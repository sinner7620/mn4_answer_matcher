import { build } from "esbuild"
import AdmZip from "adm-zip"
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
const repository = packageJson.repository?.url
  ?.replace(/^https:\/\/github\.com\//, "")
  .replace(/\.git$/, "")
if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
  throw new Error("package.json repository.url 必须是 GitHub owner/repository 地址")
}
const unpacked = path.join(root, "dist", "mn4-answer-matcher")
const archive = path.join(
  root,
  "dist",
  `mn4-answer-matcher-v${packageJson.version}.mnaddon`
)

await rm(path.join(root, "dist"), { recursive: true, force: true })
await mkdir(unpacked, { recursive: true })

await build({
  entryPoints: [path.join(root, "src", "main.ts")],
  outfile: path.join(unpacked, "main.js"),
  bundle: true,
  minify: true,
  platform: "browser",
  target: "safari13",
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __GITHUB_REPOSITORY__: JSON.stringify(repository)
  },
  banner: { js: "try {" },
  footer: {
    js: '} catch (e) { Application.sharedInstance().alert("答案匹配-" + String(e)) }'
  }
})

const manifest = {
  addonid: "marginnote.extension.mn4-answer-matcher",
  author: "frank",
  title: "答案匹配",
  version: packageJson.version,
  marginnote_version_min: "4.0.0",
  cert_key: ""
}

await writeFile(
  path.join(unpacked, "mnaddon.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
)
await copyFile(path.join(root, "assets", "logo.png"), path.join(unpacked, "logo.png"))

const zip = new AdmZip()
for (const name of ["main.js", "mnaddon.json", "logo.png"]) {
  zip.addFile(name, await readFile(path.join(unpacked, name)))
}
zip.writeZip(archive)

console.log(`Built ${archive}`)
