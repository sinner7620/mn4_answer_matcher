import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("插件更新优先 GitHub，失败后检查并下载 Gitee 同版本附件", () => {
  const source = readFileSync("src/updater.ts", "utf8")
  assert.match(source, /GITHUB_RELEASES_API/)
  assert.match(source, /GITEE_RELEASES_API = "https:\/\/gitee\.com\/api\/v5\/repos\/baidreams\/CardLink\/releases\?per_page=10"/)
  assert.match(source, /return newestRelease\(await fetchReleases\("github"\), "github"\)/)
  assert.match(source, /catch \(githubError\)[\s\S]*?return newestRelease\(await fetchReleases\("gitee"\), "gitee"\)/)
  assert.doesNotMatch(source, /Promise\.all\([\s\S]*?fetchReleases\("github"\)[\s\S]*?fetchReleases\("gitee"\)/)
  assert.match(source, /find\(item => releaseVersion\(item\) === version\)/)
  assert.match(source, /GitHub 下载失败，正在从 Gitee 下载/)
})

test("正式自动检查仍按 12h 节流执行，且不存在强制调试检查入口", () => {
  const source = readFileSync("src/updater.ts", "utf8")
  assert.doesNotMatch(source, /debugAutomaticUpdateCheck|UpdateDebugResult/)
  assert.match(source, /if \(!interactive && Date\.now\(\) - lastCheckTime\(\) < AUTO_CHECK_INTERVAL\) return/)
  assert.match(source, /scheduleAutomaticUpdateCheck[\s\S]*checkForUpdates\(false\)/)
})

test("更新菜单只保留下载并手动安装", () => {
  const source = readFileSync("src/updater.ts", "utf8")
  assert.match(source, /buttons: \["下载并手动安装"\]/)
  assert.doesNotMatch(source, /"稍后"|"下载并安装"|下载并保存（手动安装）/)
  assert.doesNotMatch(source, /downloadAndInstall/)
})
