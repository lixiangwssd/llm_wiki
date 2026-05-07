/**
 * prompt-settings.tsx — Prompt 可视化编辑面板
 *
 * 放置位置：src/components/settings/prompt-settings.tsx
 *
 * 功能：
 * 1. 默认展示 prompt 内容（textarea 显示默认值）
 * 2. 版本历史控制（保存时推入历史，支持恢复）
 * 3. 历史版本对比视图（左右对比）
 */
import { useState, useEffect, useCallback, useMemo } from "react"
import { RotateCcw, Pencil, Check, X, ChevronDown, ChevronRight, Clock, ArrowLeftRight } from "lucide-react"
import { usePromptStore, type PromptKey } from "@/stores/prompt-store"
import type { PromptHistoryEntry } from "@/stores/prompt-store"
import {
  buildAnalysisDefault,
  buildGenerationDefault,
  buildQueryDefault,
  buildGreetingDefault,
  buildLintDefault,
  buildResearchDefault,
} from "@/lib/prompts"
import { Button } from "@/components/ui/button"

// ═══════════════════════════════════════════════════════════════════
// Prompt 元数据配置
// ═══════════════════════════════════════════════════════════════════

interface PromptConfig {
  key: PromptKey
  label: string
  description: string
  variables: string[]
}

const PROMPT_CONFIGS: PromptConfig[] = [
  {
    key: "analysisPrompt",
    label: "Ingest: Analysis (Step 1)",
    description: "LLM 分析源文档、提取实体/概念/论点时的系统提示",
    variables: ["languageRule", "purpose", "index"],
  },
  {
    key: "generationPrompt",
    label: "Ingest: Generation (Step 2)",
    description: "LLM 根据分析结果生成 wiki 文件时的系统提示",
    variables: ["languageRule", "schema", "purpose", "index", "sourceFileName", "overview"],
  },
  {
    key: "queryPrompt",
    label: "Chat: Query",
    description: "对话查询时的系统提示（检索到 wiki 页面后）",
    variables: ["purpose", "index", "pageList", "pagesContext", "outLang"],
  },
  {
    key: "greetingPrompt",
    label: "Chat: Greeting",
    description: "用户只是打招呼时的简短回复提示",
    variables: ["projectName", "outLang"],
  },
  {
    key: "lintPrompt",
    label: "Lint: Semantic Check",
    description: "对 wiki 进行语义质量检查的提示",
    variables: ["languageDirective", "summaries"],
  },
  {
    key: "researchPrompt",
    label: "Deep Research: Synthesis",
    description: "将搜索结果综合为 wiki 研究页面的提示",
    variables: ["languageDirective", "wikiIndex"],
  },
]

// ═══════════════════════════════════════════════════════════════════
// 获取默认 prompt
// ═══════════════════════════════════════════════════════════════════

function getDefaultPrompt(key: PromptKey): string {
  const map: Record<PromptKey, string> = {
    analysisPrompt: buildAnalysisDefault({ languageRule: "", purpose: "", index: "" }),
    generationPrompt: buildGenerationDefault({ languageRule: "", schema: "", purpose: "", index: "", sourceFileName: "", overview: "" }),
    queryPrompt: buildQueryDefault({ purpose: "", index: "", pageList: "", pagesContext: "", outLang: "" }),
    greetingPrompt: buildGreetingDefault({ projectName: "", outLang: "" }),
    lintPrompt: buildLintDefault({ languageDirective: "", summaries: "" }),
    researchPrompt: buildResearchDefault({ languageDirective: "", wikiIndex: "" }),
  }
  return map[key]
}

// ═══════════════════════════════════════════════════════════════════
// 格式化时间
// ═══════════════════════════════════════════════════════════════════

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString()
}

// ═══════════════════════════════════════════════════════════════════
// 简单行对比高亮（基于 LCS 的 diff）
// ═══════════════════════════════════════════════════════════════════

interface DiffLine {
  type: "same" | "added" | "removed"
  text: string
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n")
  const newLines = newText.split("\n")
  // Build LCS table
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to build diff
  const diff: DiffLine[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({ type: "same", text: oldLines[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ type: "added", text: newLines[j - 1] })
      j--
    } else {
      diff.unshift({ type: "removed", text: oldLines[i - 1] })
      i--
    }
  }

  return diff
}

// ═══════════════════════════════════════════════════════════════════
// 历史版本对比 Modal
// ═══════════════════════════════════════════════════════════════════

function HistoryDiffModal({
  entry,
  idx,
  currentValue,
  onRestore,
  onClose,
}: {
  entry: PromptHistoryEntry
  idx: number
  currentValue: string
  onRestore: (idx: number) => void
  onClose: () => void
}) {
  const diff = useMemo(() => computeDiff(entry.content, currentValue), [entry.content, currentValue])

  // Left shows: same lines + removed lines
  const leftLines = diff.filter((l) => l.type !== "added")
  // Right shows: same lines + added lines
  const rightLines = diff.filter((l) => l.type !== "removed")

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-xl w-[1000px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div>
            <h3 className="font-medium">版本对比</h3>
            <p className="text-xs text-muted-foreground">{formatTime(entry.timestamp)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { onRestore(idx); onClose() }}
              className="h-8 text-xs gap-1"
            >
              <ArrowLeftRight className="h-3 w-3" />
              恢复此版本
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} className="h-8 px-2">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Diff content - left/right columns with highlighted diff */}
        <div className="flex-1 overflow-hidden p-4 grid grid-cols-2 gap-3">
          {/* Left: History version */}
          <div className="flex flex-col min-h-0">
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1 shrink-0">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              历史版本
            </div>
            <div className="flex-1 overflow-auto bg-muted/30 rounded border">
              {leftLines.map((line, i) => (
                <div
                  key={i}
                  className={`text-xs font-mono px-3 py-0.5 whitespace-pre-wrap break-words ${
                    line.type === "removed"
                      ? "bg-red-500/15 text-red-700"
                      : "text-foreground"
                  }`}
                >
                  {line.type === "removed" ? "− " : "  "}
                  {line.text || "(空行)"}
                </div>
              ))}
              {leftLines.length === 0 && (
                <div className="text-xs text-muted-foreground px-3 py-2">无差异</div>
              )}
            </div>
          </div>

          {/* Right: Current version */}
          <div className="flex flex-col min-h-0">
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1 shrink-0">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              当前版本
            </div>
            <div className="flex-1 overflow-auto bg-muted/30 rounded border">
              {rightLines.map((line, i) => (
                <div
                  key={i}
                  className={`text-xs font-mono px-3 py-0.5 whitespace-pre-wrap break-words ${
                    line.type === "added"
                      ? "bg-green-500/15 text-green-700"
                      : "text-foreground"
                  }`}
                >
                  {line.type === "added" ? "+ " : "  "}
                  {line.text || "(空行)"}
                </div>
              ))}
              {rightLines.length === 0 && (
                <div className="text-xs text-muted-foreground px-3 py-2">无差异</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// 单个 Prompt 编辑卡片
// ═══════════════════════════════════════════════════════════════════

function PromptCard({ config }: { config: PromptConfig }) {
  const store = usePromptStore()
  const currentValue = store[config.key]
  const history = store.getHistory(config.key)
  const [isEditing, setIsEditing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [draft, setDraft] = useState("")
  const [copied, setCopied] = useState(false)
  const [selectedHistoryIdx, setSelectedHistoryIdx] = useState<number | null>(null)

  const hasCustom = currentValue !== null
  const defaultPrompt = useMemo(() => getDefaultPrompt(config.key), [config.key])

  const effectiveCurrentValue = currentValue || defaultPrompt

  const handleEdit = useCallback(() => {
    setDraft(currentValue || defaultPrompt)
    setIsEditing(true)
    setShowHistory(false)
    setSelectedHistoryIdx(null)
  }, [currentValue, defaultPrompt])

  const handleSave = useCallback(async () => {
    const value = draft.trim() === defaultPrompt.trim() ? null : (draft.trim() || null)
    await store.setPrompt(config.key, value)
    setIsEditing(false)
  }, [draft, config.key, store, defaultPrompt])

  const handleCancel = useCallback(() => {
    setIsEditing(false)
    setDraft("")
    setShowHistory(false)
    setSelectedHistoryIdx(null)
  }, [])

  const handleReset = useCallback(async () => {
    if (window.confirm(`确定恢复 "${config.label}" 为默认值？`)) {
      await store.resetPrompt(config.key)
    }
  }, [config, store])

  const handleRestore = useCallback(async (idx: number) => {
    await store.resetToHistory(config.key, idx)
    setIsEditing(false)
    setShowHistory(false)
    setSelectedHistoryIdx(null)
  }, [config, store])

  const handleCopyVars = useCallback(() => {
    const text = config.variables.map((v) => `{{${v}}}`).join("\n")
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [config.variables])

  const selectedEntry = selectedHistoryIdx !== null ? history[history.length - 1 - selectedHistoryIdx] : null
  const selectedEntryIdx = selectedHistoryIdx !== null ? history.length - 1 - selectedHistoryIdx : null

  return (
    <>
      {selectedEntry && (
        <HistoryDiffModal
          entry={selectedEntry}
          idx={selectedEntryIdx!}
          currentValue={effectiveCurrentValue}
          onRestore={(idx: number) => handleRestore(idx)}
          onClose={() => setSelectedHistoryIdx(null)}
        />
      )}

      <div className="border rounded-lg overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => !isEditing && setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">{config.label}</span>
            {hasCustom ? (
              <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full">
                已自定义
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded-full">
                默认
              </span>
            )}
          </div>

          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {history.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className="h-6 px-2 text-xs"
                title="历史版本"
              >
                <Clock className="h-3 w-3 mr-1" />
                历史 ({history.length})
              </Button>
            )}
            {hasCustom && (
              <Button variant="ghost" size="sm" onClick={handleReset} className="h-6 px-2 text-xs">
                <RotateCcw className="h-3 w-3 mr-1" />
                恢复默认
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleEdit} className="h-6 px-2 text-xs">
              <Pencil className="h-3 w-3 mr-1" />
              {hasCustom ? "编辑" : "自定义"}
            </Button>
          </div>
        </div>

        {/* Expanded content */}
        {(isExpanded || isEditing) && (
          <div className="px-3 py-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">{config.description}</p>

            {/* 历史版本列表 */}
            {showHistory && !isEditing && history.length > 0 && (
              <div className="mb-3 p-2 bg-muted/50 rounded border">
                <div className="text-xs font-medium mb-2 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  历史版本 ({history.length})
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {[...history].reverse().map((entry, i) => {
                    const realIdx = history.length - 1 - i
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs p-2 bg-background rounded hover:bg-accent/50 cursor-pointer transition-colors"
                        onClick={() => setSelectedHistoryIdx(i)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-muted-foreground">{formatTime(entry.timestamp)}</div>
                          <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                            {entry.content.slice(0, 80)}...
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRestore(realIdx)
                          }}
                          className="h-6 px-2 text-[10px] ml-2 shrink-0"
                        >
                          恢复
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Template variables */}
            <div className="flex items-center gap-1 mb-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground">模板变量：</span>
              {config.variables.map((v) => (
                <code key={v} className="text-[10px] px-1 py-0.5 bg-muted rounded">
                  {`{{${v}}}`}
                </code>
              ))}
              <button onClick={handleCopyVars} className="text-[10px] text-primary hover:underline ml-1">
                {copied ? "已复制" : "复制全部"}
              </button>
            </div>

            {/* Editing mode */}
            {isEditing ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-muted-foreground">
                    {draft === defaultPrompt.trim() ? "当前为默认值" : "自定义版本"}
                  </span>
                  {draft !== defaultPrompt.trim() && (
                    <span className="text-[10px] text-primary">● 已修改</span>
                  )}
                </div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-full h-72 font-mono text-xs p-2 border rounded resize-y bg-background"
                  placeholder={`输入自定义 prompt...\n\n支持模板变量：${config.variables.map((v) => `{{${v}}}`).join(", ")}\n\n运行时会被替换为实际值。`}
                  spellCheck={false}
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleSave} className="h-7 text-xs gap-1">
                    <Check className="h-3 w-3" />
                    保存
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancel} className="h-7 text-xs gap-1">
                    <X className="h-3 w-3" />
                    取消
                  </Button>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {draft.length > 0 ? `${draft.length} 字符` : ""}
                  </span>
                </div>
              </div>
            ) : (
              // Preview mode
              <pre className="text-[11px] font-mono bg-muted/50 p-2 rounded max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
                {effectiveCurrentValue.slice(0, 500)}
                {effectiveCurrentValue.length > 500 ? "\n\n..." : ""}
              </pre>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// 主面板
// ═══════════════════════════════════════════════════════════════════

export function PromptSettings() {
  const store = usePromptStore()

  useEffect(() => {
    if (!store.loaded) {
      store.loadPrompts()
    }
  }, [store.loaded])

  const customCount = PROMPT_CONFIGS.filter((c) => store[c.key] !== null).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Prompt Templates</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            自定义 LLM 在各阶段使用的系统提示。未自定义的使用内置默认值。
          </p>
        </div>
        {customCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              if (window.confirm("确定恢复所有 prompt 为默认值？")) {
                store.resetAll()
              }
            }}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            全部恢复默认 ({customCount})
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {PROMPT_CONFIGS.map((config) => (
          <PromptCard key={config.key} config={config} />
        ))}
      </div>

      {/* Tips */}
      <div className="text-[11px] text-muted-foreground bg-muted/30 rounded p-2 space-y-1">
        <p><strong>💡 Tips：</strong></p>
        <p>• 模板变量 <code>{`{{variable}}`}</code> 会在运行时被替换为实际内容</p>
        <p>• 编辑时 textarea 预填默认值，直接保存 = 使用默认值</p>
        <p>• 修改立即生效，下次 Ingest/Query/Lint 时使用新 prompt</p>
        <p>• 自定义内容持久化在本地，不会丢失</p>
        <p>• 历史版本持久化，app 重启后仍在</p>
        <p>• 点击历史版本可查看与当前版本的对比</p>
      </div>
    </div>
  )
}
