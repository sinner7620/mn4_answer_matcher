import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("插件更新优先 GitHub，失败后检查并下载 Gitee 同版本附件", () => {
  const source = readFileSync("src/updater.ts", "utf8")
  assert.match(source, /GITHUB_RELEASES_API/)
  assert.match(source, /GITEE_RELEASES_API = "https:\/\/gitee\.com\/api\/v5\/repos\/baidreams\/CardLink\/releases\?per_page=10"/)
  assert.match(source, /return newestRelease\(await fetchReleases\("github"\), "github"\)/)
  assert.match(source, /return newestRelease\(await fetchReleases\("gitee"\), "gitee"\)/)
  assert.match(source, /find\(item => releaseVersion\(item\) === version\)/)
  assert.match(source, /GitHub 下载失败，正在从 Gitee 下载/)
})
