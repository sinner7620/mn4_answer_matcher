import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
const webDist = path.join(root, "web-dist")
const outputDir = path.join(root, "ui-preview")
const output = path.join(outputDir, "mn4-full-ui-preview.html")
const index = await readFile(path.join(webDist, "index.html"), "utf8")
const css = await readFile(path.join(webDist, "app.css"), "utf8")
const annotationCss = await readFile(path.join(root, "scripts", "preview-annotations.css"), "utf8")
const javascript = (await readFile(path.join(webDist, "app.js"), "utf8"))
  .replace(/2\.3\.1-beta\.\d+ · 完整界面预览/g, `${pkg.version} · 完整界面预览`)
  .replace(/<\/script/gi, "<\\/script")
const annotationJavascript = (await readFile(path.join(root, "scripts", "preview-annotations.js"), "utf8"))
  .replace(/<\/script/gi, "<\\/script")

const bootstrap = `<script>window.__MN_FULL_UI_PREVIEW__ = true; window.addEventListener('error', function (event) { var root = document.getElementById('root'); if (root && !root.firstElementChild) root.innerHTML = '<div style="margin:24px;padding:16px;border:1px solid #fecaca;border-radius:10px;background:#fff7f7;color:#b42318;font-family:-apple-system,BlinkMacSystemFont,\\'PingFang SC\\',sans-serif"><strong>预览页启动失败</strong><br><small>' + String(event.message || '未知错误').replace(/[<&]/g, '') + '</small></div>'; });</script>`

function replaceLast(source, search, replacement) {
  const index = source.lastIndexOf(search)
  if (index === -1) return source
  return source.slice(0, index) + replacement + source.slice(index + search.length)
}

const pluginPreview = index
  .replace(
    "<title>答案与错题工作台</title>",
    () => `<title>MN4 答案匹配 ${pkg.version} · 实际插件预览</title>`
  )
  .replace(
    '<link rel="stylesheet" href="./app.css">',
    () => `<link rel="icon" href="data:"><style data-plugin-app-css>${css}</style><style data-preview-annotations>${annotationCss}</style>`
  )
  .replace(
    '<script src="./app.js"></script>',
    () => `${bootstrap}<script data-plugin-app-js>${javascript}</script>`
  )

const standalone = replaceLast(
  pluginPreview,
  "</body>",
  `<script data-preview-annotations>${annotationJavascript}</script></body>`
)

await mkdir(outputDir, { recursive: true })
await writeFile(output, standalone)

console.log(output)
