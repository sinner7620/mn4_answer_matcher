import AdmZip from "adm-zip"
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
const runtimeRoot = path.join(root, "runtime-baseline")
const baselineManifest = JSON.parse(await readFile(path.join(runtimeRoot, "mnaddon.json"), "utf8"))
if (baselineManifest.version !== "2.3.1-beta.25") {
  throw new Error(`运行基线版本异常：${baselineManifest.version}`)
}

const distRoot = path.join(root, "dist")
const addonRoot = path.join(distRoot, "mn4-answer-matcher")
const webDist = path.join(root, "web-dist")
const betaChannel = pkg.version.includes("-beta")
const localBeta = pkg.version.includes("beta.local")
const archive = path.join(
  distRoot,
  `${localBeta ? "mn4-answer-matcher-beta" : "mn4-answer-matcher"}-v${pkg.version}.mnaddon`
)

await mkdir(distRoot, { recursive: true })
await rm(archive, { force: true })
await rm(webDist, { recursive: true, force: true })
await rm(addonRoot, { recursive: true, force: true })
await mkdir(addonRoot, { recursive: true })
await cp(runtimeRoot, addonRoot, { recursive: true })
await cp(path.join(runtimeRoot, "web-dist"), webDist, { recursive: true })

async function replaceRequired(file, replacements) {
  let source = await readFile(file, "utf8")
  for (const [search, replacement] of replacements) {
    if (!source.includes(search)) throw new Error(`运行基线补丁目标不存在：${path.basename(file)} · ${search}`)
    source = source.split(search).join(replacement)
  }
  await writeFile(file, source)
}

async function removeRequired(file, pattern, label) {
  var source = await readFile(file, "utf8")
  if (!pattern.test(source)) throw new Error(`运行基线删除目标不存在：${path.basename(file)} · ${label}`)
  await writeFile(file, source.replace(pattern, ""))
}

async function appendCss(file, css) {
  const source = await readFile(file, "utf8")
  await writeFile(file, `${source.trimEnd()}\n${css.trim()}\n`)
}

await replaceRequired(path.join(addonRoot, "AnswerMatcherCore.js"), [
  ["2.3.1-beta.25", pkg.version]
])

const webAppReplacements = [
  ["return{printPanel:!0,format:`pdf`,filename:r,count:e.length}", "return{printPanel:!0,printCompleted:!0,format:`pdf`,filename:r,count:e.length}"],
  ["e!=null&&e.saved&&p(`已打开系统另存面板：${e.filename}（${e.count} 道）`)", "e!=null&&e.pdfGenerated?p(`PDF 已在本地生成，共 ${e.pages} 页；已打开保存面板（${e.count} 道）`):e!=null&&e.saved&&p(`已打开系统另存面板：${e.filename}（${e.count} 道）`)"],
  ["e!=null&&e.printPanel&&p(`系统打印面板已打开；请在预览中选择分享并“存储到文件”（${e.count} 道）`)", "e!=null&&e.printInvoked?p(`系统打印已调用；请在面板中选择打印或另存为 PDF（${e.count} 道）`):e!=null&&e.htmlFallback?p(`当前 MarginNote 未提供打印接口，已打开自包含 HTML 保存面板；可用浏览器打开后打印为 PDF（${e.count} 道）`):e!=null&&e.printCompleted?p(`系统已完成打印或另存操作（${e.count} 道）`):e!=null&&e.printCancelled?p(`已取消打印/另存为 PDF`):e!=null&&e.printDismissed&&p(`系统打印面板已关闭`)"],
  ["`系统打印预览`", "`本地生成 PDF`"],
  ["`可分享或存储到文件`", "`题目、图片和手写一并导出`"],
  ["`生成 PDF 并打开打印面板`", "`生成并另存 PDF`"]
]
await replaceRequired(path.join(webDist, "app.js"), webAppReplacements)
await replaceRequired(path.join(addonRoot, "web-dist", "app.js"), webAppReplacements)

const liquidGlassCss = /\/\* beta\.12: when a real UIGlassEffect is mounted by the native panel, let it show through the WebView\. \*\/[\s\S]*?html\.nativeLiquidGlass \.reviewList\{\s*background:rgba\(255,255,255,\.90\)!important;\s*\}\s*/
await removeRequired(path.join(webDist, "app.css"), liquidGlassCss, "nativeLiquidGlass CSS")
await removeRequired(path.join(addonRoot, "web-dist", "app.css"), liquidGlassCss, "nativeLiquidGlass CSS")

const fixedRootScrollCss = `/* beta.28: lock the plugin root; scroll only inside page content and dedicated panes. */
html,body,#root,.shell{width:100%;height:100%;max-height:100%;overflow:hidden!important;overscroll-behavior:none}
html,body{position:fixed;inset:0}
.shell>main{height:100%;overflow:hidden!important;overscroll-behavior:none}
.overviewPage,.reviewPage,.settingsPage,.exportPage{height:calc(100vh - 112px);min-height:0;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
@media(max-width:800px){.overviewPage,.reviewPage,.settingsPage,.exportPage{height:calc(100vh - 55px)}}`
await appendCss(path.join(webDist, "app.css"), fixedRootScrollCss)
await appendCss(path.join(addonRoot, "web-dist", "app.css"), fixedRootScrollCss)

const vendorRoot = path.join(webDist, "vendor")
const addonVendorRoot = path.join(addonRoot, "web-dist", "vendor")
await mkdir(vendorRoot, { recursive: true })
await mkdir(addonVendorRoot, { recursive: true })
for (const [source, name] of [
  [path.join(root, "node_modules", "html2canvas", "dist", "html2canvas.min.js"), "html2canvas.min.js"],
  [path.join(root, "node_modules", "jspdf", "dist", "jspdf.umd.min.js"), "jspdf.umd.min.js"],
  [path.join(root, "web", "pdf-export-runtime.js"), "pdf-export-runtime.js"]
]) {
  await copyFile(source, path.join(vendorRoot, name))
  await copyFile(source, path.join(addonVendorRoot, name))
}

for (const name of ["main.js", "WebBridgeCommands.js", "WebPanelController.js", "WebAddon.js"]) {
  await copyFile(path.join(root, "rails-native", name), path.join(addonRoot, name))
}
await copyFile(path.join(root, "assets", "logo.png"), path.join(addonRoot, "logo.png"))

const manifest = {
  addonid: betaChannel
    ? "marginnote.extension.mn4-answer-matcher.beta"
    : "marginnote.extension.mn4-answer-matcher",
  author: "frank",
  title: betaChannel ? "CardLink 跨脑图卡片匹配 Beta" : "跨脑图卡片匹配",
  version: pkg.version,
  marginnote_version_min: "4.0.0",
  cert_key: ""
}
await writeFile(path.join(addonRoot, "mnaddon.json"), `${JSON.stringify(manifest, null, 2)}\n`)

const zip = new AdmZip()
async function addDirectory(directory, prefix = "") {
  const { readdir } = await import("node:fs/promises")
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    const relative = path.posix.join(prefix, entry.name)
    if (entry.isDirectory()) await addDirectory(absolute, relative)
    else zip.addFile(relative, await readFile(absolute))
  }
}
await addDirectory(addonRoot)
zip.writeZip(archive)
console.log(`Built ${pkg.version} from beta.25 runtime baseline: ${archive}`)
