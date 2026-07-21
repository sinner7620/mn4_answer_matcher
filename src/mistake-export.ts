import { MN, saveFile, writeTextFile } from "marginnote"
import { LEVEL_DESCRIPTIONS, MistakeHistoryItem, MistakeRecord } from "./mistake-domain"
import { mistakeDetailById, mistakeWorkbenchData } from "./mistake-manager"
import { cardHtmlToMarkdown } from "./card-markdown"

export interface MistakeExportOptions {
  recordIds?: string[]
  format: "md" | "pdf"
  filename?: string
  include?: {
    question?: boolean
    answer?: boolean
    source?: boolean
    review?: boolean
  }
}

interface ExportDetail {
  record: MistakeRecord & { categoryLabel?: string }
  questionHtml: string
  answers: Array<{ title: string; path: string; html: string }>
  answerStatus: string
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>\"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"
  }[character] as string))
}

function cleanFilename(value: unknown, extension: string): string {
  const base = String(value || `MN4错题导出-${new Date().toISOString().slice(0, 10)}`)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\.(md|pdf)$/i, "")
    .trim()
    .slice(0, 80) || "MN4错题导出"
  return `${base}.${extension}`
}

interface MarkdownAsset {
  fileName: string
  base64?: string
  mediaId?: string
  utf8?: string
}

function decodeBase64Ascii(value: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  const source = String(value || "").replace(/\s/g, "")
  let output = "", buffer = 0, bits = 0
  for (const character of source) {
    if (character === "=") break
    const index = alphabet.indexOf(character)
    if (index < 0) throw new Error("SVG base64 数据无效")
    buffer = (buffer << 6) | index
    bits += 6
    if (bits >= 8) {
      bits -= 8
      output += String.fromCharCode((buffer >> bits) & 255)
    }
  }
  return output
}

export function extractMarkdownAssets(markdown: string): { markdown: string; assets: MarkdownAsset[] } {
  const assets: MarkdownAsset[] = []
  let output = String(markdown || "").replace(
    /!\[([^\]]*)\]\(mnmedia:\/\/(png|jpg|gif|webp)\/([^)]+)\)/g,
    (_, alt: string, extension: string, mediaId: string) => {
      const fileName = `asset-${String(assets.length + 1).padStart(4, "0")}.${extension}`
      assets.push({ fileName, mediaId: decodeURIComponent(mediaId) })
      return `![${alt}](assets/${fileName})`
    }
  )
  output = output.replace(
    /!\[([^\]]*)\]\(data:image\/(png|jpeg|jpg|svg\+xml);base64,([A-Za-z0-9+/=\s]+)\)/g,
    (_, alt: string, rawType: string, base64: string) => {
      const type = rawType.toLowerCase()
      const compact = base64.replace(/\s/g, "")
      const extension = compact.startsWith("iVBOR") ? "png"
        : compact.startsWith("/9j/") ? "jpg"
          : compact.startsWith("PHN2Zy") ? "svg"
            : type === "svg+xml" ? "svg" : type === "jpeg" ? "jpg" : type
      const fileName = `asset-${String(assets.length + 1).padStart(4, "0")}.${extension}`
      assets.push(extension === "svg"
        ? { fileName, utf8: decodeBase64Ascii(compact) }
        : { fileName, base64: compact })
      return `![${alt}](assets/${fileName})`
    }
  )
  return { markdown: output, assets }
}

function fallbackBase64Data(base64: string): any {
  const dataClass = NSData as any
  if (typeof dataClass.dataWithBase64EncodedStringOptions === "function") {
    return dataClass.dataWithBase64EncodedStringOptions(base64, 0)
  }
  if (typeof dataClass.alloc === "function") {
    const instance = dataClass.alloc()
    if (typeof instance?.initWithBase64EncodedStringOptions === "function") {
      return instance.initWithBase64EncodedStringOptions(base64, 0)
    }
  }
  throw new Error("HTML 评论中的内嵌图片无法解码；普通卡片图片不受影响")
}

function ensureDirectory(path: string): void {
  const manager = NSFileManager.defaultManager() as any
  if (manager.fileExistsAtPath(path)) return
  if (!manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(path, true, null)) {
    throw new Error(`无法创建导出目录：${path}`)
  }
}

function saveMarkdownBundle(markdown: string, requestedName: unknown): { filename: string; assetCount: number } {
  const mdFilename = cleanFilename(requestedName, "md")
  const baseName = mdFilename.replace(/\.md$/i, "")
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)
  const exportRoot = `${MN.app.documentPath}/MNAnswerMatcher/exports/${baseName}-${stamp}`
  const assetRoot = `${exportRoot}/assets`
  ensureDirectory(assetRoot)
  const bundle = extractMarkdownAssets(markdown)
  for (const asset of bundle.assets) {
    const data = asset.mediaId
      ? MN.db.getMediaByHash(asset.mediaId)
      : asset.utf8 !== undefined
        ? NSData.dataWithStringEncoding(asset.utf8, 4)
        : fallbackBase64Data(asset.base64 || "")
    if (!data?.length() || !data.writeToFileAtomically(`${assetRoot}/${asset.fileName}`, true)) {
      throw new Error(`导出图片失败：${asset.fileName}`)
    }
  }
  writeTextFile(`${exportRoot}/${mdFilename}`, `\uFEFF${bundle.markdown}`)
  const zipFilename = `${baseName}.zip`
  const zipPath = `${MN.app.documentPath}/MNAnswerMatcher/exports/${baseName}-${stamp}.zip`
  if (!ZipArchive.createZipFileAtPathWithContentsOfDirectory(zipPath, exportRoot)) {
    throw new Error("Markdown 压缩包生成失败")
  }
  saveFile(zipPath, "public.zip-archive")
  return { filename: zipFilename, assetCount: bundle.assets.length }
}

function bodyOf(documentHtml: string): string {
  const match = String(documentHtml || "").match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  return match ? match[1] : String(documentHtml || "")
}

function formatDate(value?: string): string {
  if (!value) return "无"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

function sourceText(record: MistakeRecord): string {
  const path = [record.sourceNotebookTitle, ...(record.sourcePathTitles || [])].filter(Boolean).join(" › ")
  return `${path || "未命名脑图"}\n\n- 原卡片 ID：\`${record.sourceNoteId}\`\n- 原脑图 ID：\`${record.sourceNotebookId}\``
}

function historyMarkdown(history: MistakeHistoryItem[]): string {
  if (!history?.length) return "暂无复习记录"
  return history.map(item => `- ${formatDate(item.at)}：错题${item.level}级 · ${LEVEL_DESCRIPTIONS[item.level]}`).join("\n")
}

function selectedDetails(options: MistakeExportOptions): ExportDetail[] {
  const allowed = new Set((options.recordIds || []).map(String))
  return mistakeWorkbenchData().records
    .filter(record => !allowed.size || allowed.has(record.recordId))
    .filter(record => record.noteAvailable)
    .map(record => mistakeDetailById(record.recordId))
}

export function buildMistakeMarkdown(details: ExportDetail[], options: MistakeExportOptions): string {
  const include = { question: true, answer: true, source: true, review: true, ...options.include }
  const lines = [
    "# MN4 错题导出",
    "",
    `> 导出时间：${formatDate(new Date().toISOString())} · 共 ${details.length} 道错题`,
    ""
  ]
  details.forEach((detail, index) => {
    const record = detail.record
    lines.push(`${index + 1}. [${record.sourceTitle}](#错题-${index + 1})`)
  })
  for (const [index, detail] of details.entries()) {
    const record = detail.record
    lines.push("", "---", "", `<a id=\"错题-${index + 1}\"></a>`, `## ${index + 1}. ${record.sourceTitle}`, "")
    lines.push(`**错题${record.level}级 · ${LEVEL_DESCRIPTIONS[record.level]}**　｜　分类：${record.categoryLabel || "未分类"}`)
    if (include.source) lines.push("", "### 来源", "", sourceText(record))
    if (include.question) lines.push("", "### 原题卡片", "", cardHtmlToMarkdown(detail.questionHtml))
    if (include.answer) {
      lines.push("", "### 实时匹配答案", "")
      if (detail.answers.length) {
        detail.answers.forEach((answer, answerIndex) => {
          if (detail.answers.length > 1) lines.push(`#### 答案 ${answerIndex + 1}：${answer.title}`, "", answer.path || "")
          lines.push(cardHtmlToMarkdown(answer.html), "")
        })
      } else {
        lines.push(`> ${detail.answerStatus === "unbound" ? "原题脑图尚未绑定答案脑图" : "当前未匹配到答案"}`)
      }
    }
    if (include.review) {
      lines.push("", "### 复习记录", "", `- 加入时间：${formatDate(record.createdAt)}`, `- 最近复习：${formatDate(record.lastReviewedAt)}`, `- 下次复习：${formatDate(record.nextReviewAt)}`, `- 完成次数：${record.reviewCount}`, "", historyMarkdown(record.history))
    }
  }
  return `${lines.join("\n")}\n`
}

export function buildMistakePdfHtml(details: ExportDetail[], options: MistakeExportOptions): string {
  const include = { question: true, answer: true, source: true, review: true, ...options.include }
  const articles = details.map((detail, index) => {
    const record = detail.record
    const answers = detail.answers.length
      ? detail.answers.map((answer, answerIndex) => `<section><h3>答案${detail.answers.length > 1 ? ` ${answerIndex + 1} · ${escapeHtml(answer.title)}` : ""}</h3>${bodyOf(answer.html)}</section>`).join("")
      : `<p class=\"notice\">${detail.answerStatus === "unbound" ? "原题脑图尚未绑定答案脑图" : "当前未匹配到答案"}</p>`
    const history = (record.history || []).map(item => `<li>${escapeHtml(formatDate(item.at))}：错题${item.level}级 · ${escapeHtml(LEVEL_DESCRIPTIONS[item.level])}</li>`).join("") || "<li>暂无复习记录</li>"
    return `<article class=\"mistake\"><header><span>错题 ${index + 1}</span><h1>${escapeHtml(record.sourceTitle)}</h1><p>错题${record.level}级 · ${escapeHtml(LEVEL_DESCRIPTIONS[record.level])}　｜　${escapeHtml(record.categoryLabel || "未分类")}</p></header>${include.source ? `<section><h2>来源</h2><p>${escapeHtml([record.sourceNotebookTitle, ...(record.sourcePathTitles || [])].filter(Boolean).join(" › "))}</p><small>原卡片 ID：${escapeHtml(record.sourceNoteId)}　原脑图 ID：${escapeHtml(record.sourceNotebookId)}</small></section>` : ""}${include.question ? `<section><h2>原题卡片</h2>${bodyOf(detail.questionHtml)}</section>` : ""}${include.answer ? `<section class=\"answers\"><h2>实时匹配答案</h2>${answers}</section>` : ""}${include.review ? `<section><h2>复习记录</h2><p>加入：${escapeHtml(formatDate(record.createdAt))}　最近复习：${escapeHtml(formatDate(record.lastReviewedAt))}<br>下次复习：${escapeHtml(formatDate(record.nextReviewAt))}　完成次数：${record.reviewCount}</p><ul>${history}</ul></section>` : ""}</article>`
  }).join("")
  return `<!doctype html><html><head><meta charset=\"utf-8\"><style>@page{size:A4;margin:15mm}*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,\"PingFang SC\",\"Hiragino Sans GB\",sans-serif;color:#172033;font-size:12px;line-height:1.55;margin:0}.cover{padding:80px 0 40px;border-bottom:2px solid #172033}.cover h1{font-size:30px;margin:0 0 12px}.cover p{color:#64748b}.mistake{page-break-before:always}.mistake>header{border-bottom:2px solid #1e3a8a;padding:4px 0 12px;margin-bottom:16px}.mistake>header span{color:#3157a4;font-weight:700}.mistake>header h1{font-size:23px;margin:4px 0}.mistake>header p{margin:0;color:#526078}section{page-break-inside:auto;margin:15px 0}h2{font-size:16px;border-left:4px solid #3157a4;padding-left:8px}h3{font-size:14px}img,svg,canvas{max-width:100%!important;height:auto!important;page-break-inside:avoid}article,div,p{max-width:100%}.notice{background:#f4f6f8;padding:12px;border-radius:7px;color:#64748b}small{color:#64748b}ul{padding-left:20px}</style></head><body><div class=\"cover\"><h1>MN4 错题导出</h1><p>导出时间：${escapeHtml(formatDate(new Date().toISOString()))}<br>共 ${details.length} 道错题</p></div>${articles}</body></html>`
}

export function exportMistakes(options: MistakeExportOptions): any {
  const details = selectedDetails(options)
  if (!details.length) throw new Error("当前导出范围没有可用错题")
  if (options.format === "md") {
    const bundle = saveMarkdownBundle(buildMistakeMarkdown(details, options), options.filename)
    return { saved: true, format: "md", filename: bundle.filename, count: details.length, assetCount: bundle.assetCount }
  }
  const filename = cleanFilename(options.filename, "pdf")
  return { renderPdf: true, filename, count: details.length, html: buildMistakePdfHtml(details, options) }
}
