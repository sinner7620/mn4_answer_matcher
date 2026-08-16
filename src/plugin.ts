import {
  delay,
  defineEventHandlers,
  defineLifecycleHandlers,
  eventObserverController,
  HUDController,
  MN,
  NodeNote,
  popup,
  select,
  showHUD
} from "marginnote"
import { pathMatchScore } from "./domain"
import { createAnswerToolbar, hideAnswerToolbar, showAnswerToolbar } from "./floating-toolbar"
import {
  answerCardHtml,
  answerText,
  clearIndex,
  findAnswers,
  IndexedAnswer,
  refreshIndex
} from "./matcher"
import {
  BindingTarget,
  getBinding,
  getBindingForMode,
  loadBindings,
  normalizeBinding,
  removeBinding,
  saveBindings,
  setBinding,
  targetForMode
} from "./store"
import { loadMatcherSettings, saveMatcherSettings } from "./settings"
import { mindMapRoot, nodeIdentifier } from "./mindmap-scope"
import { isSelectableMindMapRoot } from "./mindmap-candidate"
import {
  closeAnswerCard,
  onAnswerCardPan,
  onAnswerCardResize,
  showAnswerCard
} from "./answer-card-view"
import { checkForUpdates, scheduleAutomaticUpdateCheck } from "./updater"
import { scheduleTelemetryReport } from "./telemetry"
import {
  chooseNotebook,
  closeNotebookPicker,
  NOTEBOOK_PICKER_BACK_ID,
  onNotebookPickerAction
} from "./notebook-picker"

const events = ["PopupMenuOnNote", "ClosePopupMenuOnNote"] as const
export const eventObservers = eventObserverController([...events])

function currentNotebookId(): string | undefined {
  return MN.currnetNotebookId
}

function notebookTitle(notebookId: string): string {
  return MN.db.getNotebookById(notebookId)?.title?.trim() || "未命名脑图"
}

function selectedQuestion(): NodeNote | undefined {
  const selected = NodeNote.getSelectedNodes()
  if (selected.length) return selected[0]
  if (self.lastClickedNote) return new NodeNote(self.lastClickedNote)
  const focus = MN.notebookController?.focusNote
  return focus ? new NodeNote(focus) : undefined
}

function parsePopupWinRect(value: unknown): { x: number; y: number; width: number; height: number } | undefined {
  if (typeof value !== "string") return
  try {
    const values = JSON.parse(`[${value.replace(/[{}]/g, "")}]`) as number[]
    if (values.length !== 4 || values.some(item => !Number.isFinite(item))) return
    return { x: values[0], y: values[1], width: values[2], height: values[3] }
  } catch {
    return
  }
}

function samePopupTarget(
  expected: { x: number; y: number; width: number; height: number } | undefined,
  actual: { x: number; y: number; width: number; height: number } | undefined
): boolean {
  if (!expected || !actual) return false
  const tolerance = 2
  return Math.abs(expected.x - actual.x) <= tolerance &&
    Math.abs(expected.y - actual.y) <= tolerance &&
    Math.abs(expected.width - actual.width) <= tolerance &&
    Math.abs(expected.height - actual.height) <= tolerance
}

function isCurrentNotePopupStillVisible(): boolean {
  try {
    const menu = PopupMenu.currentMenu()
    if (!menu?.visible) return false

    const expectedTarget = self.answerToolbarTargetRect as
      | { x: number; y: number; width: number; height: number }
      | undefined
    if (samePopupTarget(expectedTarget, menu.targetWinRect)) return true

    const focus = MN.notebookController?.visibleFocusNote ?? MN.notebookController?.focusNote
    const focusNoteId = focus?.noteId
    return Boolean(focusNoteId && self.answerToolbarNoteId && focusNoteId === self.answerToolbarNoteId)
  } catch {
    return false
  }
}

interface MindMapCandidate extends BindingTarget {
  title: string
}

function mindMapTitle(node: NodeNote): string {
  return node.title?.trim() || "未命名脑图"
}

function sourceMindMap(): { notebookId: string; rootNodeId: string; title: string } | undefined {
  const notebookId = currentNotebookId()
  const question = selectedQuestion()
  if (!notebookId || !question) return undefined
  const root = mindMapRoot(question)
  return { notebookId, rootNodeId: nodeIdentifier(root), title: mindMapTitle(root) }
}

async function mindMapCandidates(notebookId: string): Promise<MindMapCandidate[]> {
  const candidates: MindMapCandidate[] = []
  const notebook = MN.db.getNotebookById(notebookId)
  if (!notebook) return candidates
  const roots = new Map<string, NodeNote>()
  const notes = notebook.notes ?? []
  for (let index = 0; index < notes.length; index++) {
    const note = notes[index]
    if (note) {
      try {
        const node = new NodeNote(note, notebookId)
        const realGroupTargetId = note.realGroupNoteIdForTopicId?.(notebookId)
        if (isSelectableMindMapRoot(
          Boolean(node.note.parentNote),
          node.title,
          note.noteId,
          [realGroupTargetId, note.groupNoteId]
        )) {
          roots.set(nodeIdentifier(node), node)
        }
      } catch (error) {
        MN.error(error)
      }
    }
    if (index % 80 === 79) await delay(0.01)
  }
  for (const [rootNodeId, root] of roots) {
    const rootTitle = mindMapTitle(root)
    candidates.push({
      notebookId,
      rootNodeId,
      rootTitle,
      title: `${notebook.title?.trim() || "未命名学习集"} › ${rootTitle}`
    })
  }
  return candidates
}

function targetTitle(target: BindingTarget): string {
  if (!target.rootNodeId) return notebookTitle(target.notebookId)
  return `${notebookTitle(target.notebookId)} › ${target.rootTitle || "已绑定脑图"}`
}

function scopedBindingEnabled(): boolean {
  return loadMatcherSettings().allowSameStudySetMindMap
}

function bindingForSource(notebookId: string, rootNodeId?: string): BindingTarget | undefined {
  return getBindingForMode(loadBindings(), notebookId, rootNodeId, scopedBindingEnabled())
}

function effectiveAnswerTarget(target: BindingTarget): BindingTarget {
  return targetForMode(target, scopedBindingEnabled())
}

async function bindAnswerStudySet(questionNotebookId: string): Promise<void> {
  const notebooks = (MN.db.allNotebooks() ?? []).filter(
    item => item.topicId && item.topicId !== questionNotebookId && item.flags === 2
  )
  if (!notebooks.length) return showHUD("没有可绑定的其他学习集")
  let answerNotebookId: string
  if (MN.isMac) {
    const selected = await chooseNotebook(notebooks.map(item => ({
      id: item.topicId!,
      title: item.title?.trim() || "未命名学习集"
    })))
    if (!selected) return
    if (selected.id === NOTEBOOK_PICKER_BACK_ID) {
      await openMenu()
      return
    }
    answerNotebookId = selected.id
  } else {
    const result = await select(
      [
        "取消",
        "返回",
        ...notebooks.map((item, index) => `${index + 1}. ${item.title?.trim() || "未命名学习集"}`)
      ],
      "绑定答案学习集",
      "将索引所选学习集内的全部卡片",
      false
    )
    if (result.index <= 0) return
    if (result.index === 1) {
      await openMenu()
      return
    }
    answerNotebookId = notebooks[result.index - 2].topicId!
  }
  const bindings = loadBindings()
  bindings[questionNotebookId] = answerNotebookId
  saveBindings(bindings)
  HUDController.show("正在建立答案索引，请稍候…")
  await delay(0.08)
  let refreshResult
  try {
    refreshResult = await refreshIndex(answerNotebookId)
  } finally {
    HUDController.hidden()
  }
  const warning = refreshResult.brokenLinks || refreshResult.skippedCards
    ? `；忽略 ${refreshResult.brokenLinks} 个失效引用、${refreshResult.skippedCards} 张异常卡片`
    : ""
  showHUD(`已绑定「${notebookTitle(answerNotebookId)}」，索引全部 ${refreshResult.indexedCards} 张卡片${warning}`, 4)
}

async function bindAnswerNotebook(): Promise<void> {
  const questionNotebookId = currentNotebookId()
  if (!questionNotebookId) return showHUD("请先打开题目脑图")
  if (!scopedBindingEnabled()) return bindAnswerStudySet(questionNotebookId)
  const source = sourceMindMap()
  if (!source) return showHUD("请先选中当前题目脑图中的任一卡片")

  const notebooks = (MN.db.allNotebooks() ?? []).filter(item => item.topicId && item.flags === 2)
  if (!notebooks.length) return showHUD("没有可绑定的学习集")

  let targetNotebookId: string
  if (MN.isMac) {
    const selected = await chooseNotebook(notebooks.map(item => ({
      id: item.topicId!,
      title: item.topicId === source.notebookId
        ? `${item.title?.trim() || "未命名学习集"}（当前学习集）`
        : item.title?.trim() || "未命名学习集"
    })))
    if (!selected) return
    if (selected.id === NOTEBOOK_PICKER_BACK_ID) {
      await openMenu()
      return
    }
    targetNotebookId = selected.id
  } else {
    const result = await select(
      [
        "取消",
        "返回",
        ...notebooks.map((item, index) => `${index + 1}. ${item.title?.trim() || "未命名学习集"}${item.topicId === source.notebookId ? "（当前）" : ""}`)
      ],
      "选择答案所在学习集",
      "答案脑图可以位于当前学习集",
      false
    )
    if (result.index <= 0) return
    if (result.index === 1) {
      await openMenu()
      return
    }
    targetNotebookId = notebooks[result.index - 2].topicId!
  }

  HUDController.show("正在读取该学习集的脑图，请稍候…")
  await delay(0.05)
  let scanned: MindMapCandidate[]
  try {
    scanned = await mindMapCandidates(targetNotebookId)
  } finally {
    HUDController.hidden()
  }
  const candidates = scanned.filter(
    item => item.notebookId !== source.notebookId || item.rootNodeId !== source.rootNodeId
  )
  if (!candidates.length) return showHUD("没有可绑定的其他脑图")

  let target: MindMapCandidate
  if (MN.isMac) {
    const selected = await chooseNotebook(candidates.map((item, index) => ({
      id: String(index),
      title: item.title
    })))
    if (!selected) return
    if (selected.id === NOTEBOOK_PICKER_BACK_ID) {
      await bindAnswerNotebook()
      return
    }
    target = candidates[Number(selected.id)]
  } else {
    // MarginNote's native picker is stable and vertically laid out on iPad.
    // The custom UIKit overlay is Mac-only because some of its bridged properties
    // can terminate the iPad host process before JavaScript can catch an error.
    const options = [
      "取消",
      "返回",
      ...candidates.map((item, index) => `${index + 1}. ${item.title}`)
    ]
    const result = await select(
      options,
      "绑定答案脑图",
      "请选择与当前题目脑图对应的答案脑图",
      false
    )
    if (result.index <= 0) return
    if (result.index === 1) {
      await bindAnswerNotebook()
      return
    }
    target = candidates[result.index - 2]
  }
  const bindings = loadBindings()
  setBinding(bindings, source.notebookId, source.rootNodeId, {
    notebookId: target.notebookId,
    rootNodeId: target.rootNodeId,
    rootTitle: target.rootTitle
  })
  saveBindings(bindings)
  HUDController.show("正在建立答案索引，请稍候…")
  await delay(0.08)
  let refreshResult
  try {
    refreshResult = await refreshIndex(target)
  } finally {
    HUDController.hidden()
  }
  const warning = refreshResult.brokenLinks || refreshResult.skippedCards
    ? `；忽略 ${refreshResult.brokenLinks} 个失效引用、${refreshResult.skippedCards} 张异常卡片`
    : ""
  showHUD(`已绑定「${target.title}」，索引 ${refreshResult.indexedCards} 张卡片${warning}`, 4)
}

async function chooseMatch(
  matches: IndexedAnswer[],
  questionPath: string[]
): Promise<IndexedAnswer | undefined> {
  if (matches.length === 1) return matches[0]
  const scores = matches.map(answer => pathMatchScore(questionPath, answer.pathTitles))
  if (scores[0] > 0 && scores[0] > scores[1]) return matches[0]
  const options = matches.map((answer, index) => {
    const marker = answer.tags.some(tag => tag === "标准答案") ? " ★标准答案" : ""
    const path = [...answer.pathTitles].reverse().join(" / ")
    const preview = answerText(answer).replace(/\s+/g, " ").slice(0, 42)
    return `${index + 1}. ${path ? `${path} / ` : ""}${
      answer.titles[0] || "未命名卡片"
    }${marker}${preview ? ` · ${preview}` : ""}`
  })
  const result = await select(
    ["取消", "返回", ...options],
    `找到 ${matches.length} 个答案`,
    "请选择要展示的答案卡片",
    false
  )
  if (result.index <= 0) return undefined
  if (result.index === 1) {
    await openMenu()
    return undefined
  }
  return matches[result.index - 2]
}

async function showAnswer(questionTitle: string, answer: IndexedAnswer): Promise<void> {
  showAnswerCard(answerCardHtml(answer, questionTitle))
}

export function onCloseAnswerCard(): void {
  closeAnswerCard()
}

export { onAnswerCardPan, onAnswerCardResize }
export { onNotebookPickerAction }

export async function findCurrentAnswer(): Promise<void> {
  const questionNotebookId = currentNotebookId()
  if (!questionNotebookId) return showHUD("请先打开题目脑图")
  const question = selectedQuestion()
  if (!question) return showHUD("请先选中一张题目卡片")
  const sourceRootNodeId = nodeIdentifier(mindMapRoot(question))
  const storedTarget = bindingForSource(questionNotebookId, sourceRootNodeId)
  const answerTarget = storedTarget && effectiveAnswerTarget(storedTarget)
  if (!answerTarget) {
    const shouldBind = await popup({
      title: "尚未绑定答案脑图",
      message: "当前脑图还没有对应的答案脑图。",
      buttons: ["取消", "返回", "立即绑定"],
      canCancel: false
    })
    if (shouldBind.buttonIndex === 1) await openMenu()
    else if (shouldBind.buttonIndex === 2) await bindAnswerNotebook()
    return
  }

  const questionTitle = question.title?.trim()
  if (!questionTitle) return showHUD("所选卡片没有标题，无法匹配")
  let questionTitles = [questionTitle]
  try {
    questionTitles = Array.from(new Set([questionTitle, ...question.titles.map(title => title.trim())]))
      .filter(Boolean)
  } catch {
    questionTitles = [questionTitle]
  }

  let questionPath: string[] = []
  try {
    questionPath = question.ancestorNodes
      .map(ancestor => ancestor.title?.trim())
      .filter(Boolean) as string[]
  } catch {
    questionPath = []
  }

  const matches = findAnswers(answerTarget, questionTitles, questionPath)
  if (!matches.length) return showHUD(`未找到同标题答案：${questionTitle}`, 3)
  const answer = await chooseMatch(matches, questionPath)
  if (answer) await showAnswer(questionTitle, answer)
}

async function runSafely(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (error) {
    MN.error(error)
    showHUD(`答案匹配失败：${String(error)}`, 4)
  }
}

export async function onAnswerToolbarClick(): Promise<void> {
  hideAnswerToolbar()
  await runSafely(findCurrentAnswer)
}

async function refreshCurrentIndex(): Promise<void> {
  const questionNotebookId = currentNotebookId()
  if (!questionNotebookId) return showHUD("请先打开题目脑图")
  const source = sourceMindMap()
  if (scopedBindingEnabled() && !source) return showHUD("请先选中当前脑图中的任一卡片")
  const storedTarget = bindingForSource(questionNotebookId, source?.rootNodeId)
  const answerTarget = storedTarget && effectiveAnswerTarget(storedTarget)
  if (!answerTarget) return showHUD("当前脑图尚未绑定答案脑图")
  HUDController.show("正在重建答案索引，请稍候…")
  await delay(0.08)
  let result
  try {
    result = await refreshIndex(answerTarget)
  } finally {
    HUDController.hidden()
  }
  const warning = result.brokenLinks || result.skippedCards
    ? `；忽略 ${result.brokenLinks} 个失效引用、${result.skippedCards} 张异常卡片`
    : ""
  showHUD(`答案索引已刷新：${result.indexedCards} 张卡片${warning}`, 4)
}

async function unbindCurrent(): Promise<void> {
  const questionNotebookId = currentNotebookId()
  if (!questionNotebookId) return showHUD("请先打开题目脑图")
  const source = sourceMindMap()
  if (scopedBindingEnabled() && !source) return showHUD("请先选中当前脑图中的任一卡片")
  const bindings = loadBindings()
  const storedTarget = scopedBindingEnabled()
    ? getBinding(bindings, questionNotebookId, source?.rootNodeId)
    : normalizeBinding(bindings[questionNotebookId]) ?? getBinding(bindings, questionNotebookId, source?.rootNodeId)
  const answerTarget = storedTarget && effectiveAnswerTarget(storedTarget)
  if (!answerTarget) return showHUD("当前脑图没有绑定")
  const result = await popup({
    title: "解除绑定",
    message: `题目脑图：${source
      ? `${notebookTitle(source.notebookId)} › ${source.title}`
      : `${notebookTitle(questionNotebookId)} › 当前脑图`}\n答案脑图：${targetTitle(answerTarget)}`,
    buttons: ["取消", "返回", "解除绑定"],
    canCancel: false,
    multiLine: true
  })
  if (result.buttonIndex === 0) return
  if (result.buttonIndex === 1) {
    await openMenu()
    return
  }
  if (result.buttonIndex !== 2) return
  if (!scopedBindingEnabled() && normalizeBinding(bindings[questionNotebookId])) {
    removeBinding(bindings, questionNotebookId)
  } else {
    removeBinding(bindings, questionNotebookId, source?.rootNodeId)
  }
  saveBindings(bindings)
  clearIndex(answerTarget)
  showHUD("已解除当前脑图的答案绑定")
}

export async function openMenu(): Promise<void> {
  const questionNotebookId = currentNotebookId()
  if (!questionNotebookId) return showHUD("请先打开一个脑图")
  const source = sourceMindMap()
  const answerTarget = bindingForSource(questionNotebookId, source?.rootNodeId)
  const scoped = scopedBindingEnabled()
  const binding = answerTarget ? targetTitle(answerTarget) : "未绑定"
  const questionMindMap = source
    ? `${notebookTitle(source.notebookId)} › ${source.title}`
    : `${notebookTitle(questionNotebookId)} › 请先选中脑图中的卡片`
  const menuSummary = [
    `当前版本：v${__APP_VERSION__}`,
    `题目脑图：${questionMindMap}`,
    `答案脑图：${binding}`
  ].join("\n")
  const result = await select(
    [
      "查找当前卡片答案",
      scoped ? "绑定/更换具体答案脑图" : "绑定/更换答案学习集",
      "刷新答案索引",
      `同学习集脑图绑定：${scoped ? "已开启" : "已关闭"}`,
      "检查插件更新",
      "解除当前绑定"
    ],
    "答案匹配",
    menuSummary,
    true
  )
  if (result.index === 0) await runSafely(findCurrentAnswer)
  else if (result.index === 1) await runSafely(bindAnswerNotebook)
  else if (result.index === 2) await runSafely(refreshCurrentIndex)
  else if (result.index === 3) {
    saveMatcherSettings({ allowSameStudySetMindMap: !scoped })
    showHUD(!scoped ? "已开启：可绑定同学习集内的具体脑图" : "已关闭：恢复按整个答案学习集匹配", 4)
  }
  else if (result.index === 4) {
    const updateResult = await checkForUpdates(true)
    if (updateResult === "back") await openMenu()
  }
  else if (result.index === 5) await runSafely(unbindCurrent)
}

export const lifecycle = defineLifecycleHandlers({
  instanceMethods: {
    sceneWillConnect() {
      self.addon = { key: "mn4-answer-matcher", title: "答案匹配" }
      self.lastClickedNote = undefined
      self.answerToolbar = createAnswerToolbar()
      self.answerToolbarShownAt = 0
      self.answerToolbarNoteId = undefined
      self.answerToolbarTargetRect = undefined
      eventObservers.remove()
      eventObservers.add()
      scheduleAutomaticUpdateCheck()
      scheduleTelemetryReport()
    },
    notebookWillOpen(notebookId: string) {
      eventObservers.remove()
      eventObservers.add()
    },
    notebookWillClose() {
      eventObservers.remove()
      self.lastClickedNote = undefined
      self.answerToolbarNoteId = undefined
      self.answerToolbarTargetRect = undefined
      hideAnswerToolbar()
      closeAnswerCard()
      closeNotebookPicker()
    },
    sceneDidDisconnect() {
      eventObservers.remove()
      clearIndex()
      closeAnswerCard()
      closeNotebookPicker()
    }
  },
  classMethods: {
    applicationWillEnterForeground() {
      scheduleAutomaticUpdateCheck()
      scheduleTelemetryReport()
    },
    addonWillDisconnect() {
      clearIndex()
    }
  }
})

export const handlers = defineEventHandlers<(typeof events)[number]>({
  onPopupMenuOnNote(sender) {
    if (self.window !== MN.currentWindow) return
    const note = sender.userInfo?.note
    const winRect = (sender.userInfo as any).winRect
    self.lastClickedNote = note
    self.answerToolbarNoteId = note?.noteId
    self.answerToolbarTargetRect = parsePopupWinRect(winRect)
    showAnswerToolbar(winRect)
  },
  async onClosePopupMenuOnNote() {
    if (self.window !== MN.currentWindow) return
    const shownAt = self.answerToolbarShownAt
    await delay(0.15)
    if (shownAt !== self.answerToolbarShownAt) return
    if (isCurrentNotePopupStillVisible()) return
    self.answerToolbarNoteId = undefined
    self.answerToolbarTargetRect = undefined
    hideAnswerToolbar()
  }
})

export function queryAddonCommandStatus() {
  return currentNotebookId()
    ? { image: "logo.png", object: self, selector: "openMenu:", checked: false }
    : null
}
