/**
 * prompts.ts — 所有 LLM prompt 集中管理（支持用户自定义覆盖）
 *
 * 放置位置：src/lib/prompts.ts
 *
 * 这个文件有两层：
 * 1. buildXxxPrompt() — 默认 prompt 构建函数（硬编码在代码中）
 * 2. getXxxPrompt() — 对外暴露的 getter，优先使用用户自定义，fallback 到默认
 *
 * 其他文件只需要 import getXxxPrompt 系列函数。
 */
import { usePromptStore } from "@/stores/prompt-store"

// ═══════════════════════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 模板变量替换。把 {{key}} 替换为实际值。
 * 未匹配到的变量保持原样（容错）。
 */
function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value)
  }
  return result
}


// ═══════════════════════════════════════════════════════════════════════════════
// INGEST: ANALYSIS PROMPT (Step 1)
// ═══════════════════════════════════════════════════════════════════════════════

export function buildAnalysisDefault(opts: {
  languageRule: string
  purpose: string
  index: string
}): string {
  return [
    "You are an expert research analyst. Read the source document and produce a structured analysis.",
    "Do not output chain-of-thought, hidden reasoning, or a thinking transcript. Reason internally and write only the concise final analysis.",
    "",
    opts.languageRule,
    "",
    "Your analysis should cover:",
    "",
    "## Key Entities",
    "List people, organizations, products, datasets, tools mentioned. For each:",
    "- Name and type",
    "- Role in the source (central vs. peripheral)",
    "- Whether it likely already exists in the wiki (check the index)",
    "",
    "## Key Concepts",
    "List theories, methods, techniques, phenomena. For each:",
    "- Name and brief definition",
    "- Why it matters in this source",
    "- Whether it likely already exists in the wiki",
    "",
    "## Main Arguments & Findings",
    "- What are the core claims or results?",
    "- What evidence supports them?",
    "- How strong is the evidence?",
    "",
    "## Connections to Existing Wiki",
    "- What existing pages does this source relate to?",
    "- Does it strengthen, challenge, or extend existing knowledge?",
    "",
    "## Contradictions & Tensions",
    "- Does anything in this source conflict with existing wiki content?",
    "- Are there internal tensions or caveats?",
    "",
    "## Recommendations",
    "- What wiki pages should be created or updated?",
    "- For each recommended page, specify:",
    " - Suggested layer (01~07) and why",
    " - Suggested type (entity/concept/source/synthesis/comparison/query)",
    " - Suggested filename",
    "- What should be emphasized vs. de-emphasized?",
    "- Any open questions worth flagging for the user?",
    "",
    "Be thorough but concise. Focus on what's genuinely important.",
    "",
    "If a folder context is provided, use it as a hint for categorization — the folder structure often reflects the user's organizational intent (e.g., 'papers/energy' suggests the file is an energy-related paper).",
    "",
    opts.purpose ? `## Wiki Purpose (for context)\n${opts.purpose}` : "",
    opts.index ? `## Current Wiki Index (for checking existing content)\n${opts.index}` : "",
  ].filter(Boolean).join("\n")
}

/** 对外 API：获取 Analysis prompt（自定义优先） */
export function getAnalysisPrompt(opts: {
  languageRule: string
  purpose: string
  index: string
}): string {
  const custom = usePromptStore.getState().analysisPrompt
  if (custom) {
    return renderTemplate(custom, opts)
  }
  return buildAnalysisDefault(opts)
}


// ═══════════════════════════════════════════════════════════════════════════════
// INGEST: GENERATION PROMPT (Step 2)
// ═══════════════════════════════════════════════════════════════════════════════

export function buildGenerationDefault(opts: {
  languageRule: string
  schema: string
  purpose: string
  index: string
  sourceFileName: string
  overview: string
}): string {
  const sourceBaseName = opts.sourceFileName.replace(/\.[^.]+$/, "")

  return [
    "You are a wiki maintainer. Based on the analysis provided, generate wiki files.",
    "Do not output chain-of-thought, hidden reasoning, or explanatory preamble. Reason internally and output only the requested FILE/REVIEW blocks.",
    "",
    opts.languageRule,
    "",
    `## IMPORTANT: Source File`,
    `The original source file is: **${opts.sourceFileName}**`,
    `All wiki pages generated from this source MUST include this filename in their frontmatter \`sources\` field.`,
    "",
    "## What to generate",
    "",
    "Based on the analysis, generate wiki files into the CORRECT layer + type directory.",
    "",
    "### Path Resolution Rule (CRITICAL):",
    "",
    "Step 1 — Determine the knowledge LAYER by asking \"this content is fundamentally about...\":",
    " - 01-业务基础 → business architecture, models, lifecycle, competitors (\"what is it\")",
    " - 02-指标体系 → metric definitions, formulas, caliber specs, dashboards (\"how to measure\")",
    " - 03-方法论 → analysis methods, SOPs, templates, statistical techniques (\"how to do it\")",
    " - 04-数据基建 → data tables, platforms, SQL standards, data quality (\"what tools to use\")",
    " - 05-业务场景 → specific analysis scenarios, open business questions (\"what to analyze\")",
    " - 06-经验沉淀 → historical reports, lessons learned, FAQs, pitfalls (\"what was learned\")",
    " - 07-组织协作 → reporting standards, workflows, role definitions (\"how to collaborate\")",
    "",
    "Step 2 — Determine the page TYPE:",
    " - entities/ → named entities (BUs, platforms, data tables, competitors, tools)",
    " - concepts/ → metric definitions, methods, standards, models",
    " - sources/ → summaries of reports, training materials, meeting notes",
    " - synthesis/ → cross-topic summaries, SOPs, templates, best practices",
    " - comparisons/ → side-by-side analyses (A vs B)",
    " - queries/ → open questions, research topics, unresolved debates",
    "",
    "Step 3 — Combine into path: wiki/{layer}/{type}/{filename}.md",
    " Examples:",
    " wiki/02-指标体系/concepts/GTV.md",
    " wiki/03-方法论/concepts/漏斗分析.md",
    " wiki/03-方法论/synthesis/异常诊断SOP.md",
    " wiki/01-业务基础/entities/到店事业群.md",
    " wiki/06-经验沉淀/sources/2024-Q3到店活动复盘.md",
    " wiki/05-业务场景/queries/补贴效率拐点在哪.md",
    "",
    "### Files to generate:",
    "",
    `1. A source summary page at the appropriate **wiki/{layer}/sources/${sourceBaseName}.md**`,
    " (layer is usually 06-经验沉淀, unless the source is primarily a methodology doc → 03-方法论)",
    "2. Entity pages at **wiki/{layer}/entities/{name}.md** for key entities",
    "3. Concept pages at **wiki/{layer}/concepts/{name}.md** for key concepts",
    "4. Synthesis/comparison/query pages at their respective paths if identified in analysis",
    "5. An updated **wiki/index.md** — add new entries under the correct ## layer heading, preserve all existing entries",
    "6. A log entry for **wiki/log.md** (format: ## [YYYY-MM-DD] ingest | Title)",
    "7. An updated **wiki/overview.md** reflecting the newly ingested source",
    "## Frontmatter Rules (CRITICAL — parser is strict)",
    "",
    "Every page begins with a YAML frontmatter block. Format rules:",
    "",
    "1. The VERY FIRST line of the file MUST be exactly `---` (three hyphens, nothing else).",
    "2. Each frontmatter line is a `key: value` pair on its own line.",
    "3. The frontmatter ends with another `---` line on its own.",
    "4. Arrays use the standard YAML inline form `[a, b, c]`.",
    "   Wikilinks belong in the BODY only — never write `related: [[a]], [[b]]` (invalid YAML);",
    "   write `related: [a, b]` with bare slugs.",
    "",
    "Required fields:",
    " • type — one of: source | entity | concept | comparison | query | synthesis",
    " • layer — one of: 01-业务基础 | 02-指标体系 | 03-方法论 | 04-数据基建 | 05-业务场景 | 06-经验沉淀 | 07-组织协作",
    ' • title — string (quote if contains colon)',
    " • created — YYYY-MM-DD",
    " • updated — YYYY-MM-DD",
    " • tags — array of 3-5 tags: tags: [tag1, tag2, tag3]",
    " • related — array of slugs (existing pages only, leave empty if unsure): related: [foo, bar-baz]",
    `• sources — MUST include "${opts.sourceFileName}"`,
    "",
    "Additional fields for `type: source` pages:",
    " • authors — array: `authors: [author1, author2]`",
    " • date — YYYY-MM-DD (original document date, not ingest date)",
    " • doc_type — one of: 分析报告 | 培训材料 | 会议纪要 | 行业报告",
    "Other rules:",
    "- Use [[wikilink]] syntax in the BODY for cross-references",
    "- Filename convention: Chinese short names preferred for readability (≤30 chars).",
    " Use kebab-case only for English terms (e.g., GTV.md, take-rate.md).",
    " Examples: 漏斗分析.md, 美团vs饿了么.md, 到店事业群.md, DAU-MAU.md",
    "",
    "## Review block types",
    "",
    "After FILE blocks, optionally emit REVIEW blocks:",
    "- contradiction | duplicate | missing-page | suggestion",
    "- OPTIONS: Create Page | Skip (ONLY these two labels)",
    "- SEARCH: 2-3 keyword-rich web search queries separated by |",
    "",
    opts.purpose ? `## Wiki Purpose\n${opts.purpose}` : "",
    opts.schema ? `## Wiki Schema\n${opts.schema}` : "",
    opts.index ? `## Current Wiki Index (preserve all existing entries, add new ones)\n${opts.index}` : "",
    opts.overview ? `## Current Overview (update this to reflect the new source)\n${opts.overview}` : "",
    "",
    "## Output Format (STRICT)",
    "",
    "Your ENTIRE response consists of FILE blocks followed by optional REVIEW blocks. Nothing else.",
    "",
    "```",
    "---FILE: wiki/path/to/page.md---",
    "(complete file content with YAML frontmatter)",
    "---END FILE---",
    "```",
    "",
    "## Output Requirements",
    "1. FIRST character MUST be `-` (opening of `---FILE:`).",
    "2. No preamble, no trailing commentary.",
    "3. Do NOT echo the analysis.",
    "4. ALL content in the mandatory output language.",
    "",
    "If you start with anything other than `---FILE:`, the entire response will be discarded.",
    "",
    opts.languageRule,
  ].filter(Boolean).join("\n")
}

/** 对外 API：获取 Generation prompt（自定义优先） */
export function getGenerationPrompt(opts: {
  languageRule: string
  schema: string
  purpose: string
  index: string
  sourceFileName: string
  overview: string
}): string {
  const custom = usePromptStore.getState().generationPrompt
  if (custom) {
    return renderTemplate(custom, opts)
  }
  return buildGenerationDefault(opts)
}


// ═══════════════════════════════════════════════════════════════════════════════
// QUERY: CHAT SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

export function buildQueryDefault(opts: {
  purpose: string
  index: string
  pageList: string
  pagesContext: string
  outLang: string
}): string {
  return [
    "You are a knowledgeable wiki assistant. Answer questions based on the wiki content provided below.",
    "",
    "## Rules",
    "- Answer based ONLY on the numbered wiki pages provided below.",
    "- If the provided pages don't contain enough information, say so honestly.",
    "- Use [[wikilink]] syntax to reference wiki pages.",
    "- When citing information, use the page number in brackets, e.g. [1], [2].",
    "- At the VERY END of your response, add a hidden comment listing which page numbers you used:",
    "  <!-- cited: 1, 3, 5 -->",
    "",
    "Use markdown formatting for clarity.",
    "",
    opts.purpose ? `## Wiki Purpose\n${opts.purpose}` : "",
    opts.index ? `## Wiki Index\n${opts.index}` : "",
    opts.pageList ? `## Page List\n${opts.pageList}` : "",
    `## Wiki Pages\n\n${opts.pagesContext}`,
    "",
    "---",
    "",
    `## ⚠️ MANDATORY OUTPUT LANGUAGE: ${opts.outLang}`,
    `You MUST write your entire response in **${opts.outLang}**.`,
    `The wiki content above may be in a different language — ignore that. Write in ${opts.outLang} only.`,
  ].filter(Boolean).join("\n")
}

/** 对外 API：获取 Query prompt（自定义优先） */
export function getQueryPrompt(opts: {
  purpose: string
  index: string
  pageList: string
  pagesContext: string
  outLang: string
}): string {
  const custom = usePromptStore.getState().queryPrompt
  if (custom) {
    return renderTemplate(custom, opts)
  }
  return buildQueryDefault(opts)
}


// ═══════════════════════════════════════════════════════════════════════════════
// QUERY: GREETING PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

export function buildGreetingDefault(opts: { projectName: string; outLang: string }): string {
  return [
    `You are a wiki assistant for the project "${opts.projectName}".`,
    "The user sent a casual greeting — reply briefly and naturally, in one or two sentences.",
    "Do NOT invent wiki content or pretend to have retrieved pages.",
    "",
    `Respond in ${opts.outLang}.`,
  ].join("\n")
}

/** 对外 API：获取 Greeting prompt（自定义优先） */
export function getGreetingPrompt(opts: { projectName: string; outLang: string }): string {
  const custom = usePromptStore.getState().greetingPrompt
  if (custom) {
    return renderTemplate(custom, opts)
  }
  return buildGreetingDefault(opts)
}


// ═══════════════════════════════════════════════════════════════════════════════
// LINT: SEMANTIC ANALYSIS PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

export function buildLintDefault(opts: { languageDirective: string; summaries: string }): string {
  return [
    "You are a wiki quality analyst. Review the following wiki page summaries and identify issues.",
    "",
    opts.languageDirective,
    "",
    "For each issue, output exactly this format:",
    "",
    "---LINT: type | severity | Short title---",
    "Description of the issue.",
    "PAGES: page1.md, page2.md",
    "---END LINT---",
    "",
    "Types:",
    "- contradiction: two or more pages make conflicting claims",
    "- stale: information that appears outdated or superseded",
    "- missing-page: an important concept is heavily referenced but has no dedicated page",
    "- suggestion: a question or source worth adding to the wiki",
    "",
    "Severities:",
    "- warning: should be addressed",
    "- info: nice to have",
    "",
    "Only report genuine issues. Do not invent problems. Output ONLY the ---LINT--- blocks, no other text.",
    "",
    "## Wiki Pages",
    "",
    opts.summaries,
  ].join("\n")
}

/** 对外 API：获取 Lint prompt（自定义优先） */
export function getLintPrompt(opts: { languageDirective: string; summaries: string }): string {
  const custom = usePromptStore.getState().lintPrompt
  if (custom) {
    return renderTemplate(custom, opts)
  }
  return buildLintDefault(opts)
}


// ═══════════════════════════════════════════════════════════════════════════════
// DEEP RESEARCH: SYNTHESIS PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

export function buildResearchDefault(opts: { languageDirective: string; wikiIndex: string }): string {
  return [
    "You are a research assistant. Synthesize the web search results into a comprehensive wiki page.",
    "",
    opts.languageDirective,
    "",
    "## Cross-referencing (IMPORTANT)",
    "- The wiki already has existing pages listed in the Wiki Index below.",
    "- When your synthesis mentions an entity or concept that exists in the wiki, ALWAYS use [[wikilink]] syntax to link to it.",
    "- This is critical for connecting new research to existing knowledge in the graph.",
    "",
    "## Writing Rules",
    "- Organize into clear sections with headings",
    "- Cite web sources using [N] notation",
    "- Note contradictions or gaps",
    "- Suggest additional sources worth finding",
    "- Neutral, encyclopedic tone",
    "",
    opts.wikiIndex ? `## Existing Wiki Index (link to these pages with [[wikilink]])\n${opts.wikiIndex}` : "",
  ].filter(Boolean).join("\n")
}

/** 对外 API：获取 Research prompt（自定义优先） */
export function getResearchPrompt(opts: { languageDirective: string; wikiIndex: string }): string {
  const custom = usePromptStore.getState().researchPrompt
  if (custom) {
    return renderTemplate(custom, opts)
  }
  return buildResearchDefault(opts)
}
