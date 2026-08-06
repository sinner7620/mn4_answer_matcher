import { build as esbuild } from "esbuild"
import { build as viteBuild } from "vite"
import AdmZip from "adm-zip"
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
const repository = pkg.repository?.url?.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "")
if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
  throw new Error("package.json repository.url 必须是 GitHub owner/repository 地址")
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

await rm(distRoot, { recursive: true, force: true })
await rm(webDist, { recursive: true, force: true })
await mkdir(addonRoot, { recursive: true })

await esbuild({
  entryPoints: [path.join(root, "src", "rails-core.ts")],
  outfile: path.join(addonRoot, "AnswerMatcherCore.js"),
  bundle: true,
  minify: true,
  platform: "browser",
  target: "safari13",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GITHUB_REPOSITORY__: JSON.stringify(repository)
  },
  banner: { js: "try {" },
  footer: { js: '} catch (e) { Application.sharedInstance().alert("答案匹配-" + String(e)) }' }
})

await viteBuild({ configFile: path.join(root, "web", "vite.config.js") })
await writeFile(path.join(webDist, "index.html"), `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><title>答案与错题工作台</title><link rel="stylesheet" href="./app.css"></head><body><div id="root"></div><script src="./app.js"></script></body></html>\n`)

for (const name of ["main.js", "WebBridgeCommands.js", "WebPanelController.js", "WebAddon.js"]) {
  await copyFile(path.join(root, "rails-native", name), path.join(addonRoot, name))
}

const entrySource = await readFile(path.join(addonRoot, "main.js"), "utf8")
for (const match of entrySource.matchAll(/JSB\.require\("([^"]+)"\)/g)) {
  const moduleName = match[1]
  if (moduleName.endsWith(".js")) throw new Error(`JSB.require 模块名不能带 .js：${moduleName}`)
  try {
    await readFile(path.join(addonRoot, `${moduleName}.js`))
  } catch {
    throw new Error(`JSB.require 对应模块不存在：${moduleName}.js`)
  }
}
await cp(webDist, path.join(addonRoot, "web-dist"), { recursive: true })
await copyFile(path.join(root, "assets", "logo.png"), path.join(addonRoot, "logo.png"))

const manifest = {
  addonid: betaChannel
    ? "marginnote.extension.mn4-answer-matcher.beta"
    : "marginnote.extension.mn4-answer-matcher",
  author: "frank",
  title: betaChannel ? "跨脑图卡片匹配 Beta" : "跨脑图卡片匹配",
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
console.log(`Built MN Rails web add-on ${archive}`)
