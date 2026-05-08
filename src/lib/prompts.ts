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
    "你是一位专业的研究分析师。阅读源文档并输出结构化分析结果。",
    "不要输出思考过程、推理链或前言。直接输出简洁的最终分析。",
    "",
    opts.languageRule,
    "",
    "你的分析应覆盖以下内容：",
    "",
    "## 关键实体",
    "列出文档中提到的人物、组织、产品、数据集、工具。对每个实体说明：",
    "- 名称和类型",
    "- 在文档中的角色（核心 vs. 边缘）",
    "- 是否可能已存在于知识库中（对照索引检查）",
    "",
    "## 关键概念",
    "列出理论、方法、技术、现象。对每个概念说明：",
    "- 名称和简要定义",
    "- 在本文档中为何重要",
    "- 是否可能已存在于知识库中",
    "",
    "## 核心观点与发现",
    "- 核心主张或结论是什么？",
    "- 支撑证据是什么？",
    "- 证据强度如何？",
    "",
    "## 与现有知识库的关联",
    "- 本文档与哪些已有页面相关？",
    "- 是补充、挑战还是扩展了已有知识？",
    "",
    "## 矛盾与张力",
    "- 本文档是否与已有知识库内容冲突？",
    "- 文档内部是否有矛盾或需要注意的限制条件？",
    "",
    "## 建议",
    "- 应创建或更新哪些知识库页面？",
    "- 对每个建议的页面，说明：",
    "  - 建议归属层级（01~07）及理由",
    "  - 建议页面类型（entity/concept/source/synthesis/comparison/query）",
    "  - 建议文件名",
    "- 哪些内容应重点突出？哪些可弱化？",
    "- 是否有值得标记的开放问题？",
    "",
    "## 颗粒度判断（重要）",
    "对每个建议创建的页面，用以下 3 个问题判断是否值得独立成页：",
    "1. 独立性：这个概念能否脱离父话题被理解？",
    "2. 可检索性：有人会直接搜索这个概念名吗？",
    "3. 复用性：会被 2 个以上其他页面引用吗？",
    "",
    "三个问题全部为 Yes → 独立成页",
    "任一为 No → 作为父页面的一个章节，不要单独建页",
    "",
    "目标：宁可一个页面内容充实（300-800字），也不要产出大量只有 100 字的碎片页面。",
    "",
    "简洁扼要，聚焦真正重要的内容。",
    "",
    "如果提供了文件夹上下文，将其作为分类提示——文件夹结构通常反映用户的组织意图。",
    "",
    opts.purpose ? `## 知识库目的（参考）\n${opts.purpose}` : "",
    opts.index ? `## 当前知识库索引（用于检查已有内容）\n${opts.index}` : "",
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
    "你是一位知识库维护者。根据提供的分析结果，生成知识库页面文件。",
    "不要输出思考过程、推理链或解释性前言。直接输出 FILE/REVIEW 块。",
    "",
    opts.languageRule,
    "",
    `## 重要：源文件`,
    `原始源文件为：**${opts.sourceFileName}**`,
    `所有从该源生成的页面，frontmatter 的 \`sources\` 字段必须包含此文件名。`,
    "",
    "## 页面颗粒度规则（必须遵守）",
    "",
    "生成页面前，对每个候选页面执行以下 3 个测试：",
    "",
    "1. **独立性测试**：这个概念能否脱离父话题被独立理解？",
    "   - Yes → 可独立成页",
    "   - No → 合并为父页面的一个章节（用 H2/H3 标题）",
    "",
    "2. **可检索性测试**：有人会直接搜索这个概念名吗？",
    "   - Yes → 应独立成页（方便检索命中）",
    "   - No → 合并到父页面",
    "",
    "3. **复用性测试**：会被 2 个以上其他页面用 [[wikilink]] 引用吗？",
    "   - Yes → 必须独立成页",
    "   - No → 合并即可",
    "",
    "**三个全部为 Yes 才建独立页面。否则合并到最相关的父页面中。**",
    "",
    "页面大小目标：",
    "- 理想：300-800 字正文（不含 frontmatter 和表格）",
    "- 最小：150 字（低于此必须合并）",
    "- 最大：1200 字（超过此应拆分）",
    "",
    "示例：",
    "- ✅ \"归因分析.md\" — 独立页面，内含多触点归因、Shapley归因、增量归因等子方法作为章节",
    "- ❌ \"Shapley归因.md\" — 不应独立，因为脱离归因分析上下文难以理解",
    "- ✅ \"GTV.md\" — 独立页面，因为被大量其他页面引用",
    "- ❌ \"GTV计算口径变更.md\" — 不应独立，应作为 GTV.md 的一个章节",
    "",
    "## 生成规则",
    "",
    "根据分析结果，将文件生成到正确的 layer + type 目录下。",
    "",
    "### 路径决策规则（关键）：",
    "",
    "第一步 — 判断知识层级（问：\"这个内容本质上是关于...\"）：",
    "  - 01-业务基础 → 业务架构、商业模式、生命周期、竞对（\"是什么\"）",
    "  - 02-指标体系 → 指标定义、公式、口径说明、看板规范（\"怎么量\"）",
    "  - 03-方法论 → 分析方法、SOP、模板、统计技术（\"怎么做\"）",
    "  - 04-数据基建 → 数据表、平台工具、SQL规范、数据质量（\"用什么\"）",
    "  - 05-业务场景 → 具体分析场景、开放问题（\"做什么\"）",
    "  - 06-经验沉淀 → 历史报告、踩坑记录、FAQ（\"学到了什么\"）",
    "  - 07-组织协作 → 汇报规范、流程、角色定义（\"怎么协作\"）",
    "",
    "第二步 — 判断页面类型：",
    "  - entities/ → 具名实体（BU、平台、数据表、竞对、工具）",
    "  - concepts/ → 指标定义、方法论、规范、模型",
    "  - sources/ → 报告/培训材料/会议纪要的摘要",
    "  - synthesis/ → 跨主题总结、SOP、模板、最佳实践",
    "  - comparisons/ → 并排对比分析（A vs B）",
    "  - queries/ → 开放问题、研究课题、未解争论",
    "",
    "第三步 — 拼接路径：wiki/{layer}/{type}/{filename}.md",
    "  示例：",
    "    wiki/02-指标体系/concepts/GTV.md",
    "    wiki/03-方法论/concepts/归因分析.md",
    "    wiki/03-方法论/synthesis/异常诊断SOP.md",
    "    wiki/01-业务基础/entities/到店事业群.md",
    "    wiki/06-经验沉淀/sources/2024-Q3到店活动复盘.md",
    "    wiki/05-业务场景/queries/补贴效率拐点在哪.md",
    "",
    "### 需要生成的文件：",
    "",
    `1. 源文档摘要页面，放在对应的 **wiki/{layer}/sources/${sourceBaseName}.md**`,
    "   （layer 通常是 06-经验沉淀，除非源文档主要是方法论文档 → 03-方法论）",
    "2. 实体页面，放在对应的 **wiki/{layer}/entities/{name}.md**",
    "3. 概念页面，放在对应的 **wiki/{layer}/concepts/{name}.md**",
    "4. 综合/对比/问题页面，放在各自对应路径",
    "5. 更新 **wiki/index.md** — 在正确的 ## 层级标题下添加新条目，保留所有已有条目",
    "6. 更新 **wiki/log.md**（格式：## [YYYY-MM-DD] ingest | 标题）",
    "7. 更新 **wiki/overview.md** 以反映新录入的内容",
    "",
    "## Frontmatter 规则（关键 — 解析器严格）",
    "",
    "每个页面以 YAML frontmatter 块开头。格式规则：",
    "",
    "1. 文件第一行必须恰好是 `---`（三个连字符，无其他内容）。",
    "2. 每行是一个 `key: value` 对。",
    "3. frontmatter 以另一行 `---` 结束。",
    "4. 数组使用 YAML 内联格式 `[a, b, c]`。",
    "   [[wikilink]] 只能出现在正文中 — 不要写 `related: [[a]], [[b]]`（无效YAML）；",
    "   应写 `related: [a, b]`（裸 slug）。",
    "",
    "必填字段：",
    "  • type     — source | entity | concept | comparison | query | synthesis 之一",
    "  • layer    — 01-业务基础 | 02-指标体系 | 03-方法论 | 04-数据基建 | 05-业务场景 | 06-经验沉淀 | 07-组织协作 之一",
    "  • title    — 字符串（含冒号时用引号包裹）",
    "  • created  — YYYY-MM-DD",
    "  • updated  — YYYY-MM-DD",
    "  • tags     — 3-5 个标签：`tags: [标签1, 标签2, 标签3]`",
    "  • related  — slug 数组（仅填已存在的页面，不确定就留空）：`related: [foo, bar]`",
    `  • sources  — 必须包含 "${opts.sourceFileName}"`,
    "",
    "`type: source` 类型的额外字段：",
    "  • authors  — 数组：`authors: [作者1, 作者2]`",
    "  • date     — YYYY-MM-DD（原始文档日期，不是录入日期）",
    "  • doc_type — 分析报告 | 培训材料 | 会议纪要 | 行业报告 之一",
    "",
    "其他规则：",
    "- 正文中使用 [[wikilink]] 做交叉引用",
    "- 文件名规则：优先使用中文短名（≤30字符），可读性优先。",
    "  英文术语用 kebab-case（如 GTV.md、take-rate.md）。",
    "  示例：归因分析.md、美团vs饿了么.md、到店事业群.md、DAU-MAU.md",
    "",
    "## Review 块类型",
    "",
    "在 FILE 块之后，可选地输出 REVIEW 块：",
    "- contradiction | duplicate | missing-page | suggestion",
    "- OPTIONS: Create Page | Skip（只允许这两个标签）",
    "- SEARCH: 2-3 个关键词丰富的搜索查询，用 | 分隔",
    "",
    opts.purpose ? `## 知识库目的\n${opts.purpose}` : "",
    opts.schema ? `## 知识库 Schema\n${opts.schema}` : "",
    opts.index ? `## 当前知识库索引（保留所有已有条目，添加新条目）\n${opts.index}` : "",
    opts.overview ? `## 当前概览（更新以反映新源）\n${opts.overview}` : "",
    "",
    "## 输出格式（严格）",
    "",
    "你的完整回复由 FILE 块 + 可选 REVIEW 块组成。不要有其他内容。",
    "",
    "```",
    "---FILE: wiki/path/to/page.md---",
    "（完整文件内容，含 YAML frontmatter）",
    "---END FILE---",
    "```",
    "",
    "## 输出要求",
    "1. 第一个字符必须是 `-`（`---FILE:` 的开头）。",
    "2. 不要有前言、不要有结尾评论。",
    "3. 不要复述分析内容。",
    "4. 所有内容使用中文。",
    "",
    "如果你的回复不是以 `---FILE:` 开头，整个回复将被丢弃。",
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
    "你是一位知识渊博的知识库助手。根据下方提供的知识库内容回答问题。",
    "",
    "## 规则",
    "- 仅根据下方编号的知识库页面内容作答。",
    "- 如果提供的页面信息不足以回答，诚实说明。",
    "- 使用 [[wikilink]] 语法引用知识库页面。",
    "- 引用信息时使用方括号标注页面编号，如 [1]、[2]。",
    "- 在回复的最末尾，添加一个隐藏注释列出引用的页面编号：",
    "  <!-- cited: 1, 3, 5 -->",
    "",
    "使用 markdown 格式使回答清晰易读。",
    "",
    opts.purpose ? `## 知识库目的\n${opts.purpose}` : "",
    opts.index ? `## 知识库索引\n${opts.index}` : "",
    opts.pageList ? `## 页面列表\n${opts.pageList}` : "",
    `## 知识库页面\n\n${opts.pagesContext}`,
    "",
    "---",
    "",
    `## ⚠️ 强制输出语言：${opts.outLang}`,
    `你必须用 **${opts.outLang}** 撰写全部回复。`,
    `上方的知识库内容可能是其他语言——忽略它。只用 ${opts.outLang} 输出。`,
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
    `你是知识库项目 "${opts.projectName}" 的助手。`,
    "用户发了一个随意的问候——简短自然地回复，一两句话即可。",
    "不要编造知识库内容或假装已检索到页面。",
    "",
    `用 ${opts.outLang} 回复。`,
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
    "你是一位知识库质量分析师。审查以下知识库页面摘要并找出问题。",
    "",
    opts.languageDirective,
    "",
    "对每个问题，严格按以下格式输出：",
    "",
    "---LINT: type | severity | 简短标题---",
    "问题描述。",
    "PAGES: page1.md, page2.md",
    "---END LINT---",
    "",
    "类型：",
    "- contradiction：两个或多个页面存在相互矛盾的说法",
    "- stale：信息看起来已过时或被取代",
    "- missing-page：一个重要概念被频繁引用但没有专门页面",
    "- suggestion：值得添加到知识库的问题或来源",
    "",
    "严重级别：",
    "- warning：应当处理",
    "- info：有则更好",
    "",
    "只报告真实存在的问题。不要凭空捏造问题。只输出 ---LINT--- 块，不要有其他文字。",
    "",
    "## 知识库页面",
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
    "你是一位研究助手。将网络搜索结果综合成一个完整的知识库页面。",
    "",
    opts.languageDirective,
    "",
    "## 交叉引用（重要）",
    "- 知识库已有的页面列在下方的索引中。",
    "- 当你的综述提到知识库中已存在的实体或概念时，必须使用 [[wikilink]] 语法链接。",
    "- 这对于将新研究与已有知识图谱连接至关重要。",
    "",
    "## 写作规则",
    "- 用清晰的标题组织成多个章节",
    "- 使用 [N] 标注法引用网络来源",
    "- 标注矛盾或信息缺口",
    "- 建议值得寻找的额外来源",
    "- 保持中立、百科全书式的语调",
    "",
    opts.wikiIndex ? `## 已有知识库索引（用 [[wikilink]] 链接这些页面）\n${opts.wikiIndex}` : "",
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
