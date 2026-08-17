import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("错题列表日常刷新不重新扫描全部脑图节点", () => {
  const source = readFileSync("src/mistake-manager.ts", "utf8")
  const workbench = source.slice(
    source.indexOf("export function mistakeWorkbenchData"),
    source.indexOf("export async function removeMistakesByIds")
  )

  assert.doesNotMatch(workbench, /refreshRecord\s*\(/)
  assert.doesNotMatch(workbench, /saveMistakeState\s*\(/)
  assert.match(workbench, /MN\.db\.getNoteById\(stored\.sourceNoteId\)/)
})

test("标签恢复只补充缺失错题，不覆盖或删除已有复习记录", () => {
  const source = readFileSync("src/mistake-manager.ts", "utf8")
  const recovery = source.slice(
    source.indexOf("async function recoverMistakesFromSourceTagsInternal"),
    source.indexOf("function recordById")
  )

  assert.match(recovery, /if \(state\.records\[recordId\]\) \{[\s\S]*existing\+\+[\s\S]*continue/)
  assert.match(recovery, /if \(added\) saveMistakeState\(state\)/)
  assert.doesNotMatch(recovery, /removeMistakeRecord\s*\(/)
})

test("错题状态启用会话缓存且不强制同步 NSUserDefaults", () => {
  const source = readFileSync("src/mistake-store.ts", "utf8")

  assert.match(source, /if \(cachedState\) return cachedState/)
  assert.doesNotMatch(source, /defaults\.synchronize\s*\(/)
})

test("跨脑图定位为慢设备保留充足重试窗口并报告超时", () => {
  const source = readFileSync("src/note-navigation.ts", "utf8")

  assert.match(source, /NAVIGATION_RETRY_ATTEMPTS = 60/)
  assert.match(source, /throw new Error\("打开了原题链接，但脑图加载超时/)
})

test("批量错题操作合并存储和数据库刷新", () => {
  const source = readFileSync("src/mistake-manager.ts", "utf8")
  const batchReview = source.slice(
    source.indexOf("export async function reviewMistakesByIds"),
    source.indexOf("export async function setMistakeCategoryById")
  )
  const batchRemove = source.slice(
    source.indexOf("export async function removeMistakesByIds"),
    source.indexOf("export function saveMistakeReviewCurves")
  )

  assert.equal((batchReview.match(/saveMistakeState\s*\(/g) || []).length, 1)
  assert.equal((batchReview.match(/persistSources\s*\(/g) || []).length, 1)
  assert.equal((batchRemove.match(/saveMistakeState\s*\(/g) || []).length, 1)
  assert.equal((batchRemove.match(/persistSources\s*\(/g) || []).length, 1)
})

test("错题浏览提供多选、批量改等级和二次确认取消", () => {
  const ui = readFileSync("web/src/main.jsx", "utf8")
  const bridge = readFileSync("src/rails-core.ts", "utf8")

  assert.match(ui, /"选择"/)
  assert.match(ui, /"完成"/)
  assert.match(ui, /action\("reviewMistakes"/)
  assert.match(ui, /removeArmed \? `确认取消/)
  assert.match(bridge, /command === "reviewMistakes"/)
  assert.match(bridge, /command === "removeMistakes"/)
})
