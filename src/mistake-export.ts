import { MN, saveFile, writeTextFile } from "marginnote"
import { LEVEL_DESCRIPTIONS, MistakeHistoryItem, MistakeRecord } from "./mistake-domain"
import { mistakeDetailById, mistakeWorkbenchData } from "./mistake-manager"
import { cardHtmlToMarkdown } from "./card-markdown"

export interface MistakeExportOptions {
  recordIds?: string[]
  format: "md" | "pdf"
  filename?: string
  answerLayout?: "questions-first" | "interleaved"
  pageLayout?: "compact" | "one-per-page" | "two-per-page" | "three-per-page"
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
          if (detail.answers.length > 1) lines.push(`#### 答案${index + 1}.${answerIndex + 1}：${answer.title}`, "", answer.path || "")
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

function pdfCardBody(documentHtml: string): string {
  return bodyOf(documentHtml)
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>\s*/gi, "")
    .replace(/<iframe\b[^>]*\/?>(?:\s*)/gi, "")
    .replace(/<div\s+class=["']eyebrow["'][^>]*>[\s\S]*?<\/div>\s*/i, "")
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>\s*/i, "")
}

function pdfSourceLine(record: MistakeRecord): string {
  return [record.sourceNotebookTitle, ...(record.sourcePathTitles || [])].filter(Boolean).join(" › ") || "未命名脑图"
}

export function buildMistakePdfHtml(details: ExportDetail[], options: MistakeExportOptions): string {
  const include = { question: true, answer: true, source: true, review: true, ...options.include }
  const questionBlock = (detail: ExportDetail, index: number) => {
    const record = detail.record
    const source = include.source ? `<small class="problem-source">来源：${escapeHtml(pdfSourceLine(record))}</small>` : ""
    const question = include.question ? `<section class="card-content">${pdfCardBody(detail.questionHtml)}</section>` : ""
    const review = include.review ? `<small class="review-meta">错题${record.level}级 · ${escapeHtml(LEVEL_DESCRIPTIONS[record.level])}　加入 ${escapeHtml(formatDate(record.createdAt))}　下次 ${escapeHtml(formatDate(record.nextReviewAt))}</small>` : ""
    return `<article class="mistake question-unit"><header class="problem-title"><span>${index + 1}.</span><h1>${escapeHtml(record.sourceTitle)}</h1></header>${source}${question}<div class="writing-space" aria-hidden="true"></div>${review}</article>`
  }
  const answerBlock = (detail: ExportDetail, index: number) => {
    const record = detail.record
    const answerCards = detail.answers.length
      ? detail.answers.map((answer, answerIndex) => `<section class="answer-card">${detail.answers.length > 1 ? `<h2>答案${index + 1}.${answerIndex + 1} · ${escapeHtml(answer.title)}</h2>` : ""}${answer.path ? `<small>${escapeHtml(answer.path)}</small>` : ""}${pdfCardBody(answer.html)}</section>`).join("")
      : `<p class="notice">${detail.answerStatus === "unbound" ? "原题脑图尚未绑定答案脑图" : "当前未匹配到答案"}</p>`
    return `<article class="mistake answer-unit"><header class="problem-title"><span>答案 ${index + 1}</span><h1>${escapeHtml(record.sourceTitle)}</h1></header>${include.source ? `<small class="problem-source">来源：${escapeHtml(pdfSourceLine(record))}</small>` : ""}<section class="answer-content">${answerCards}</section></article>`
  }
  const questionBlocks = details.map(questionBlock)
  const answerBlocks = include.answer ? details.map(answerBlock) : []
  const pageLayout = options.pageLayout || "compact"
  const perPage = pageLayout === "one-per-page" ? 1
    : pageLayout === "two-per-page" ? 2
      : pageLayout === "three-per-page" ? 3 : 0
  const flow = (blocks: string[], className: string) => blocks.length
    ? `<section class="pdf-flow ${className}">${blocks.map(block => `<div class="pdf-slot">${block}</div>`).join("")}</section>`
    : ""
  let articles = ""
  if (!perPage) {
    const orderedBlocks = options.answerLayout === "questions-first"
      ? [...questionBlocks, ...answerBlocks]
      : details.map((detail, index) => `${questionBlock(detail, index)}${include.answer ? answerBlock(detail, index) : ""}`)
    articles = flow(orderedBlocks, "pdf-compact-flow")
  }
  else {
    const pageCount = Math.ceil(questionBlocks.length / perPage)
    const pages = Array.from({ length: pageCount }, (_, pageIndex) => {
      const start = pageIndex * perPage
      const questions = questionBlocks.slice(start, start + perPage)
      const slots = questions.map(block => `<div class="pdf-slot">${block}</div>`).join("")
      const questionPage = `<section class="pdf-page slots-${perPage}">${slots}</section>`
      return options.answerLayout === "interleaved"
        ? questionPage + flow(answerBlocks.slice(start, start + questions.length), "pdf-answer-flow")
        : questionPage
    })
    articles = pages.join("") + (options.answerLayout === "questions-first" ? flow(answerBlocks, "pdf-answer-flow") : "")
  }

  const readinessScript = `<script>(function(){window.__MN_PDF_EXPORT_PROTOCOL_V2__=true;var started=false,notified=false;function signal(name,message){if(notified)return;notified=true;var frame=document.createElement("iframe");frame.setAttribute("data-pdf-control","true");frame.style.cssText="display:none!important;position:fixed!important;width:0!important;height:0!important;border:0!important;visibility:hidden!important";frame.src="mnaddon://"+name+(message?"?message="+encodeURIComponent(message):"");document.documentElement.appendChild(frame)}function markBrokenImage(image){try{var holder=document.createElement("div");holder.setAttribute("data-pdf-image-error","true");holder.textContent="图片加载失败，原位置已保留";holder.style.cssText="min-height:48px;padding:14px;border:1px dashed #cbd5e1;border-radius:6px;background:#f8fafc;color:#64748b;text-align:center;font-size:11px";image.style.display="none";if(image.parentNode)image.parentNode.insertBefore(holder,image.nextSibling)}catch(error){}}function waitForImages(){return new Promise(function(resolve){var images=Array.prototype.slice.call(document.images||[]),remaining=images.length,failed=0;if(!remaining){resolve(0);return}function done(ok,image){if(!ok){failed+=1;markBrokenImage(image)}remaining-=1;if(!remaining)resolve(failed)}images.forEach(function(image){if(image.complete){done(image.naturalWidth!==0,image);return}function loaded(){cleanup();done(true,image)}function broken(){cleanup();done(false,image)}function cleanup(){image.removeEventListener("load",loaded);image.removeEventListener("error",broken)}image.addEventListener("load",loaded);image.addEventListener("error",broken)})})}function canvasFingerprint(canvas){try{var data=canvas.toDataURL("image/png"),hash=0,step=Math.max(1,Math.floor(data.length/64));for(var i=0;i<data.length;i+=step)hash=((hash<<5)-hash+data.charCodeAt(i))|0;return canvas.width+"x"+canvas.height+":"+data.length+":"+hash}catch(error){return canvas.width+"x"+canvas.height+":unavailable"}}function layoutSignature(){var root=document.documentElement,body=document.body,canvases=Array.prototype.slice.call(document.querySelectorAll("canvas")).map(canvasFingerprint).join(","),images=Array.prototype.slice.call(document.images||[]).map(function(image){return image.complete+":"+image.naturalWidth+"x"+image.naturalHeight}).join(",");return Math.max(root.scrollWidth,body.scrollWidth)+"x"+Math.max(root.scrollHeight,body.scrollHeight)+"|"+document.querySelectorAll("*").length+"|"+images+"|"+canvases}function waitForStableLayout(){return new Promise(function(resolve,reject){var deadline=Date.now()+10000,notBefore=Date.now()+600,previous="",stable=0;function sample(){requestAnimationFrame(function(){var current=layoutSignature();stable=current===previous?stable+1:0;previous=current;if(Date.now()>=notBefore&&stable>=3){resolve();return}if(Date.now()>deadline){reject(new Error("页面内容在限定时间内未稳定"));return}setTimeout(sample,120)})}sample()})}function waitForFrames(count){return new Promise(function(resolve){function next(){if(count--<=0){resolve();return}requestAnimationFrame(next)}next()})}window.__MN_PDF_EXPORT_BEGIN__=function(){if(started)return;started=true;var fonts=document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve();Promise.all([fonts,waitForImages()]).then(waitForStableLayout).then(function(){return waitForFrames(2)}).then(function(){signal("pdf-render-ready")}).catch(function(error){signal("pdf-render-error",error&&error.message?error.message:String(error))})}})();</script>`
  const navigationReadinessScript = readinessScript.replace(
    'var frame=document.createElement("iframe");frame.setAttribute("data-pdf-control","true");frame.style.cssText="display:none!important;position:fixed!important;width:0!important;height:0!important;border:0!important;visibility:hidden!important";frame.src="mnaddon://"+name+(message?"?message="+encodeURIComponent(message):"");document.documentElement.appendChild(frame)',
    'window.location.href="mnaddon://"+name+(message?"?message="+encodeURIComponent(message):"")'
  )
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{width:186mm;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB",sans-serif;color:#172033;font-size:12px;line-height:1.55}.pdf-slot{break-inside:avoid}.pdf-flow .pdf-slot+.pdf-slot{margin-top:1.55em}.pdf-flow{width:186mm}.pdf-answer-flow{padding:2mm 1mm}.pdf-page{width:186mm;min-height:273mm;page-break-before:always;break-after:page;display:grid;gap:0}.pdf-page:first-of-type{page-break-before:auto}.pdf-page.slots-1{grid-template-rows:1fr}.pdf-page.slots-2{grid-template-rows:repeat(2,minmax(0,1fr))}.pdf-page.slots-3{grid-template-rows:repeat(3,minmax(0,1fr))}.pdf-page .pdf-slot{min-height:0;padding:3mm 1mm}.mistake{padding:3mm 1mm 0;break-inside:avoid}.pdf-page .mistake{padding-top:0}.problem-title{display:flex;align-items:baseline;gap:8px;margin:0 0 2px;padding:0;border:0}.problem-title span{font-size:14px;font-weight:800;color:#111827;white-space:nowrap}.problem-title h1{font-size:18px;line-height:1.35;margin:0;font-weight:750}.problem-source{display:block;font-size:9.5px;color:#7b8494;margin:0 0 8px}.card-content,.answer-content{margin:0}.card-content .card,.answer-card .card{min-height:0!important;padding:0!important;background:#fff!important;color:#172033!important}.card-content .card>.eyebrow,.card-content .card>h1,.answer-card .card>.eyebrow,.answer-card .card>h1{display:none!important}.text-block,.html-block{font-size:13px!important;line-height:1.62!important;margin:7px 0!important;padding:8px 10px!important}.child{margin-top:10px!important;padding-top:8px!important}.child h2{font-size:13px!important;margin:0 0 6px!important}.card-content figure,.answer-content figure{margin:8px 0!important}.answer-content figure.drawing{width:auto!important;max-width:46%!important;margin:6px auto!important}.answer-content figure.drawing canvas[data-drawing]:not([data-drawing-overlay]){display:block!important;width:auto!important;max-width:100%!important;max-height:45mm!important;margin:0 auto!important;object-fit:contain}.writing-space{height:22mm}.layout-one-per-page .writing-space{min-height:80mm}.layout-two-per-page .writing-space{min-height:35mm}.layout-three-per-page .writing-space{min-height:16mm}.layout-compact .writing-space{display:none}.review-meta{display:block;font-size:8.5px;color:#9aa2af;margin-top:2mm}.answer-unit{margin-top:8px}.answer-card{margin:0 0 12px;page-break-inside:auto}.answer-card>h2{font-size:12px;margin:8px 0 2px;padding:0;border:0}.answer-card>small{display:block;font-size:8.5px;color:#8a94a4;margin-bottom:5px}.notice{background:#f4f6f8;padding:10px;border-radius:6px;color:#64748b}img,svg,canvas{max-width:100%!important;height:auto!important;page-break-inside:avoid}article,section,div,p{max-width:100%}</style></head><body class="layout-${pageLayout}">${articles}${navigationReadinessScript}</body></html>`
}

export function previewMistakeExport(options: MistakeExportOptions): any {
  const details = selectedDetails(options)
  if (!details.length) throw new Error("当前预览范围没有可用错题")
  if (options.format === "md") {
    return { preview: true, format: "md", count: details.length, markdown: buildMistakeMarkdown(details, options) }
  }
  return { renderPdfPreview: true, format: "pdf", count: details.length, html: buildMistakePdfHtml(details, options) }
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
