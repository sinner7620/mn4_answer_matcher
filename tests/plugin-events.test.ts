import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("切换卡片时旧 close 事件不会隐藏新卡片工具栏", () => {
  const source = readFileSync("src/plugin.ts", "utf8")
  assert.match(source, /const shownAt = self\.answerToolbarShownAt/)
  assert.match(source, /await delay\(0\.15\)/)
  assert.match(source, /if \(shownAt !== self\.answerToolbarShownAt\) return/)
  assert.match(source, /PopupMenu\.currentMenu\(\)/)
  assert.match(source, /menu\?\.visible/)
  assert.match(source, /samePopupTarget\(expectedTarget, menu\.targetWinRect\)/)
  assert.match(source, /if \(isCurrentNotePopupStillVisible\(\)\) return/)
  assert.match(source, /hideAnswerToolbar\(\)/)
})

test("Beta 启动、回到前台和打开学习集时仅调度可节流去重的错题标签恢复", () => {
  const source = readFileSync("src/plugin.ts", "utf8")
  assert.match(source, /sceneWillConnect\(\)[\s\S]*scheduleMistakeTagRecovery\(\)/)
  assert.match(source, /applicationWillEnterForeground\(\)[\s\S]*scheduleMistakeTagRecovery\(\)/)
  assert.match(source, /notebookWillOpen\(notebookId: string\)[\s\S]*scheduleMistakeTagRecovery\(notebookId\)/)
})

test("卡片弹窗关闭后不再用残留选中节点阻止侧边工具栏隐藏", () => {
  const source = readFileSync("src/plugin.ts", "utf8")
  const start = source.indexOf("async onClosePopupMenuOnNote()")
  const end = source.indexOf("export function queryAddonCommandStatus", start)
  const handler = source.slice(start, end)
  assert.doesNotMatch(handler, /NodeNote\.getSelectedNodes\(\)/)
  assert.doesNotMatch(handler, /selectedNodes\?\.length/)
  assert.match(handler, /hideAnswerToolbar\(\)/)
})
