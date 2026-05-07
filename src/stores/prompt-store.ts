/**
 * prompt-store.ts — Prompt 自定义状态管理
 *
 * 存储用户自定义的 prompt 模板，持久化到 Tauri Store。
 * 未自定义的 prompt 返回 null，调用侧 fallback 到默认值。
 *
 * 版本历史也持久化到 Tauri Store，与 prompt 值分开存储。
 *
 * 放置位置：src/stores/prompt-store.ts
 */
import { create } from "zustand"
import { Store } from "@tauri-apps/plugin-store"

export type PromptKey =
  | "analysisPrompt"
  | "generationPrompt"
  | "queryPrompt"
  | "greetingPrompt"
  | "lintPrompt"
  | "researchPrompt"

export interface PromptHistoryEntry {
  content: string
  timestamp: number
}

interface PromptState {
  // 每个 prompt：null = 用默认值，string = 用户自定义
  analysisPrompt: string | null
  generationPrompt: string | null
  queryPrompt: string | null
  greetingPrompt: string | null
  lintPrompt: string | null
  researchPrompt: string | null

  // 是否已加载
  loaded: boolean

  // 版本历史（持久化到磁盘）
  history: Record<PromptKey, PromptHistoryEntry[]>

  // Actions
  setPrompt: (key: PromptKey, value: string | null) => Promise<void>
  resetPrompt: (key: PromptKey) => Promise<void>
  resetAll: () => Promise<void>
  loadPrompts: () => Promise<void>
  resetToHistory: (key: PromptKey, index: number) => Promise<void>
  getHistory: (key: PromptKey) => PromptHistoryEntry[]
}

const STORE_FILE = "custom-prompts.json"
const HISTORY_KEY = "prompts_history"

const ALL_KEYS: PromptKey[] = [
  "analysisPrompt",
  "generationPrompt",
  "queryPrompt",
  "greetingPrompt",
  "lintPrompt",
  "researchPrompt",
]

const initHistory = (): Record<PromptKey, PromptHistoryEntry[]> => {
  const h: Record<PromptKey, PromptHistoryEntry[]> = {} as Record<PromptKey, PromptHistoryEntry[]>
  for (const key of ALL_KEYS) h[key] = []
  return h
}

export const usePromptStore = create<PromptState>((set, get) => ({
  analysisPrompt: null,
  generationPrompt: null,
  queryPrompt: null,
  greetingPrompt: null,
  lintPrompt: null,
  researchPrompt: null,
  loaded: false,
  history: initHistory(),

  setPrompt: async (key, value) => {
    const prev = get()[key]
    // Push previous value to history before overwriting
    if (prev !== null) {
      const newHistory = {
        ...get().history,
        [key]: [
          ...get().history[key],
          { content: prev, timestamp: Date.now() },
        ],
      }
      set({ history: newHistory })
      // Persist history
      try {
        const store = await Store.load(STORE_FILE)
        await store.set(HISTORY_KEY, newHistory)
        await store.save()
        console.log(`[prompt-store] history saved, ${newHistory[key].length} entries for ${key}`)
      } catch (err) {
        console.error(`[prompt-store] Failed to persist history:`, err)
      }
    }
    set({ [key]: value })
    try {
      const store = await Store.load(STORE_FILE)
      // Load existing prompts
      const existingPrompts: Record<string, string | null> = {}
      for (const k of ALL_KEYS) {
        existingPrompts[k] = (await store.get<string>(k)) ?? null
      }
      existingPrompts[key] = value
      if (value === null) {
        await store.delete(key)
      } else {
        await store.set(key, value)
      }
      await store.save()
    } catch (err) {
      console.error(`[prompt-store] Failed to persist ${key}:`, err)
    }
  },

  resetPrompt: async (key) => {
    set({ [key]: null })
    // Clear history for this key
    const newHistory = { ...get().history, [key]: [] }
    set({ history: newHistory })
    try {
      const store = await Store.load(STORE_FILE)
      await store.delete(key)
      await store.set(HISTORY_KEY, newHistory)
      await store.save()
    } catch (err) {
      console.error(`[prompt-store] Failed to reset ${key}:`, err)
    }
  },

  resetAll: async () => {
    const reset: Record<string, null> = {}
    for (const key of ALL_KEYS) reset[key] = null
    set({ ...reset, history: initHistory() })
    try {
      const store = await Store.load(STORE_FILE)
      for (const key of ALL_KEYS) {
        await store.delete(key)
      }
      await store.delete(HISTORY_KEY)
      await store.save()
    } catch (err) {
      console.error(`[prompt-store] Failed to reset all:`, err)
    }
  },

  loadPrompts: async () => {
    try {
      const store = await Store.load(STORE_FILE)
      const loaded: Record<string, string | null> = {}
      for (const key of ALL_KEYS) {
        loaded[key] = (await store.get<string>(key)) ?? null
      }
      // Load history
      const history = (await store.get<Record<PromptKey, PromptHistoryEntry[]>>(HISTORY_KEY)) ?? initHistory()
      console.log(`[prompt-store] loaded history:`, JSON.stringify(history))
      set({ ...loaded, history, loaded: true })
    } catch {
      // First run — no store file yet, that's fine
      set({ loaded: true })
    }
  },

  resetToHistory: async (key, index) => {
    const h = get().history[key]
    if (index < 0 || index >= h.length) return
    const entry = h[index]
    const newHistory = {
      ...get().history,
      [key]: h.filter((_, i) => i !== index), // Remove the restored entry
    }
    set({
      [key]: entry.content,
      history: newHistory,
    })
    try {
      const store = await Store.load(STORE_FILE)
      await store.set(key, entry.content)
      await store.set(HISTORY_KEY, newHistory)
      await store.save()
    } catch (err) {
      console.error(`[prompt-store] Failed to reset to history for ${key}:`, err)
    }
  },

  getHistory: (key) => get().history[key],
}))
