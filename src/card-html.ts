import { pkDrawingRendererScript } from "./pkdrawing-renderer"

export type NoteResolver = (noteId: string) => any
export type MediaResolver = (hash: string) => string | undefined
export type DrawingResolver = (hash: string) => string | undefined

function arrayOf<T>(value: unknown): T[] {
  try {
    return value ? Array.from(value as ArrayLike<T>) : []
  } catch {
    return []
  }
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function imageBlock(paint: unknown, resolveMedia: MediaResolver): string {
  const hash = textOf(paint)
  if (!hash) return ""
  const base64 = resolveMedia(hash)
  return base64
    ? `<figure><img src="data:image/jpeg;base64,${base64}" /></figure>`
    : '<div class="missing-image">图片资源不可用</div>'
}

function drawingBlock(drawing: unknown, resolveDrawing: DrawingResolver): string {
  const hash = textOf(drawing)
  if (!hash) return ""
  const base64 = resolveDrawing(hash)
  return base64
    ? `<figure class="drawing"><canvas data-drawing="${base64}"></canvas></figure>`
    : '<div class="missing-image">未读取到手写数据</div>'
}

function excerptBlock(note: any, resolveMedia: MediaResolver): string {
  const excerptText = textOf(note?.excerptText)
  const image = imageBlock(note?.excerptPic?.paint, resolveMedia)
  if (image) return image
  return excerptText ? `<div class="text-block">${escapeHtml(excerptText)}</div>` : ""
}

function noteBody(
  note: any,
  resolveNote: NoteResolver,
  resolveMedia: MediaResolver,
  resolveDrawing: DrawingResolver,
  visited = new Set<any>()
): string {
  const noteId = textOf(note?.noteId)
  if (!note || visited.has(note) || (noteId && visited.has(noteId))) return ""
  visited.add(note)
  if (noteId) visited.add(noteId)
  const blocks: string[] = []
  const excerpt = excerptBlock(note, resolveMedia)
  if (excerpt) blocks.push(excerpt)

  for (const comment of arrayOf<any>(note?.comments)) {
    const type = String(comment?.type ?? "")
    const text = textOf(comment?.text)
    if (type === "PaintNote") {
      const content = comment?.paint
        ? imageBlock(comment.paint, resolveMedia)
        : drawingBlock(comment?.drawing, resolveDrawing)
      if (content) blocks.push(content)
    } else if (type === "HtmlNote" && !text.startsWith("#")) {
      const html = textOf(comment?.html)
      if (html || text) blocks.push(`<div class="html-block">${html || escapeHtml(text)}</div>`)
    } else if (type === "TextNote" && text && !text.startsWith("#")) {
      if (!text.includes("marginnote3app") && !text.includes("marginnote4app")) {
        blocks.push(`<div class="text-block">${escapeHtml(text)}</div>`)
      }
    } else if (type === "LinkNote") {
      const mergedBlocks: string[] = []
      const mergedImage = comment?.q_hpic?.paint
        ? imageBlock(comment.q_hpic.paint, resolveMedia)
        : drawingBlock(comment?.q_hpic?.drawing, resolveDrawing)
      const mergedText = textOf(comment?.q_htext)
      if (mergedImage) mergedBlocks.push(mergedImage)
      if (!mergedImage && mergedText) {
        mergedBlocks.push(`<div class="text-block">${escapeHtml(mergedText)}</div>`)
      }

      // Older cards may not carry q_htext/q_hpic. Only then fall back to resolving noteid.
      if (!mergedBlocks.length) {
        const linked = resolveNote(textOf(comment?.noteid))
        if (linked && !visited.has(linked)) {
          const linkedBody = noteBody(linked, resolveNote, resolveMedia, resolveDrawing, visited)
          if (linkedBody) mergedBlocks.push(linkedBody)
        }
      }
      if (mergedBlocks.length) blocks.push(mergedBlocks.join(""))
    }
  }
  return blocks.join("")
}

export function renderCardHtml(
  note: any,
  questionTitle: string,
  resolveNote: NoteResolver,
  resolveMedia: MediaResolver,
  resolveDrawing: DrawingResolver = resolveMedia
): string {
  const answerTitle = textOf(note?.noteTitle) || "答案卡片"
  const main = noteBody(note, resolveNote, resolveMedia, resolveDrawing)
  const children = arrayOf<any>(note?.childNotes)
    .filter(Boolean)
    .map(child => {
      const title = textOf(child?.noteTitle) || "子卡片"
      return `<section class="child"><h2>${escapeHtml(title)}</h2>${noteBody(
        child,
        resolveNote,
        resolveMedia,
        resolveDrawing,
        new Set<any>()
      )}</section>`
    })
    .join("")

  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3">
<style>
:root{color-scheme:light dark}*{box-sizing:border-box}html,body{margin:0;padding:0;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#202124}body{padding:0}.card{min-height:100vh;background:#fff;padding:54px 22px 34px}.eyebrow{font-size:12px;color:#6b7280;margin-bottom:6px}.card h1{font-size:22px;line-height:1.35;margin:0 44px 18px 0}.text-block,.html-block{font-size:16px;line-height:1.7;white-space:pre-wrap;word-break:break-word;margin:12px 0;padding:12px 14px;background:#f5f7fb;border-radius:9px}.html-block{white-space:normal}figure{margin:14px 0;text-align:center}img,canvas[data-drawing]{display:block;max-width:100%;height:auto;margin:0 auto;border-radius:8px}canvas[data-drawing]{width:100%;background:#fff}.missing-image{padding:28px;text-align:center;color:#9b1c1c;background:#fff1f1;border-radius:8px}.child{margin-top:20px;padding-top:16px;border-top:1px solid #d9dde7}.child h2{font-size:17px;margin:0 0 10px}
@media(prefers-color-scheme:dark){html,body{color:#f3f4f6}.card{background:#202124}.text-block,.html-block{background:#303236}.eyebrow{color:#aeb4bf}.child{border-color:#45484f}}
</style></head><body><article class="card"><div class="eyebrow">${escapeHtml(
    questionTitle
  )}</div><h1>${escapeHtml(answerTitle)}</h1>${main}${children}</article><script>${pkDrawingRendererScript}</script></body></html>`
}
