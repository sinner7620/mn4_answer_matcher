import { drawingSvgDataUri } from "./pkdrawing-svg"

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x"
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
      return Number.isFinite(code) ? String.fromCharCode(code) : _
    }
    return named[entity.toLowerCase()] ?? _
  })
}

function attribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`${name}=["']([^"']*)["']`, "i"))
  return match?.[1] || ""
}

function text(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, "")).replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").trim()
}

function imageExtension(source: string): string {
  const base64 = String(source || "").split(",").pop()?.replace(/\s/g, "") || ""
  if (base64.startsWith("iVBOR")) return "png"
  if (base64.startsWith("/9j/")) return "jpg"
  if (base64.startsWith("R0lGOD")) return "gif"
  if (base64.startsWith("UklGR")) return "webp"
  return /^data:image\/jpe?g/i.test(source) ? "jpg" : "png"
}

export function cardHtmlToMarkdown(documentHtml: string, headingBase = 4): string {
  let html = String(documentHtml || "")
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (body) html = body[1]
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "")
  html = html.replace(/<style[\s\S]*?<\/style>/gi, "")
  html = html.replace(/<div[^>]*class=["'][^"']*eyebrow[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "")
  html = html.replace(/<canvas\b[^>]*data-drawing=["'][^"']+["'][^>]*><\/canvas>/gi, tag => {
    try {
      return `\n\n![手写内容](${drawingSvgDataUri(attribute(tag, "data-drawing"))})\n\n`
    } catch {
      return "\n\n> 手写内容解析失败，请在 MarginNote 原卡片中查看。\n\n"
    }
  })
  html = html.replace(/<img\b[^>]*>/gi, tag => {
    const source = attribute(tag, "src")
    const alt = text(attribute(tag, "alt")) || "卡片图片"
    const mediaId = attribute(tag, "data-media-id")
    if (mediaId) return `\n\n![${alt}](mnmedia://${imageExtension(source)}/${mediaId})\n\n`
    return source ? `\n\n![${alt}](${source})\n\n` : ""
  })
  html = html.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, content: string) => {
    const depth = Math.min(6, headingBase + Number(level) - 1)
    return `\n\n${"#".repeat(depth)} ${text(content)}\n\n`
  })
  html = html.replace(/<br\s*\/?>/gi, "\n")
  html = html.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, content: string) => `\n- ${text(content)}\n`)
  html = html.replace(/<\/(p|div|figure|section|article|ul|ol)>/gi, "\n\n")
  html = html.replace(/<(p|div|figure|section|article|ul|ol)\b[^>]*>/gi, "\n")
  html = text(html)
  return `${html.replace(/\n{3,}/g, "\n\n").trim()}\n`
}
