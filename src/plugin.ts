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
import { loadBindings, saveBindings } from "./store"
import {
  closeAnswerCard,
  onAnswerCardPan,
  onAnswerCardResize,
  showAnswerCard
} from "./answer-card-view"
import { checkForUpdates, scheduleAutomaticUpdateCheck } from "./updater"
import {
  bindMistakeNotebook,
  markQuestionAsMistake,
  mistakeAnswerContext,
  openLinkedMistakeOrSource,
  openMistakeDirectory,
  openMistakeRecord,
  openMistakeReviewCenter,
  repairAndOrganizeMistakes,
  scheduleMistakeReviewReminder,
  startMistakeReminderTimer,
  stopMistakeReminderTimer
} from "./mistake-manager"

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

async function bindAnswerNotebook(targetQuestionNotebookId?: string): Promise<void> {
  const questionNotebookId = targetQuestionNotebookId ?? currentNotebookId()
  if (!questionNotebookId) return showHUD("请先打开题目脑图")

  const notebooks = (MN.db.allNotebooks() ?? []).filter(
    item => item.topicId && item.topicId !== questionNotebookId && item.flags === 2
  )
  if (!notebooks.length) return showHUD("没有可绑定的其他脑图")

  const options = notebooks.map((item, index) =>
    `${index + 1}. ${item.title?.trim() || "未命名脑图"} · ${item.topicId!.slice(-6)}`
  )
  const result = await select(options, "绑定答案脑图", "请选择与当前题目脑图对应的答案脑图", true)
  if (result.index < 0) return

  const answerNotebookId = notebooks[result.index].topicId!
  const bindings = loadBindings()
  bindings[questionNotebookId] = answerNotebookId
  saveBindings(bindings)
  HUDController.show("正在建立答案索引，请稍候…")
  await delay(0.08)
  let refreshResult
  try {
    refreshResult = refreshIndex(answerNotebookId)
  } finally {
    HUDController.hidden()
  }
  const warning = refreshResult.brokenLinks || refreshResult.skippedCards
    ? `；忽略 ${refreshResult.brokenLinks} 个失效引用、${refreshResult.skippedCards} 张异常卡片`
    : ""
  showHUD(`已绑定「${notebookTitle(answerNotebookId)}」，索引 ${refreshResult.indexedCards} 张卡片${warning}`, 4)
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
  const result = await select(options, `找到 ${matches.length} 个答案`, "请选择要展示的答案卡片", true)
  return result.index < 0 ? undefined : matches[result.index]
}

async function showAnswer(questionTitle: string, answer: IndexedAnswer): Promise<void> {
  showAnswerCard(answerCardHtml(answer, questionTitle))
}

export function onCloseAnswerCard(): void {
  closeAnswerCard()
}

export { onAnswerCardPan, onAnswerCardResize }

export async function findCurrentAnswer(): Promise<void> {
  const questionNotebookId = currentNotebookId()
  if (!questionNotebookId) return showHUD("请先打开题目脑图")
  const question = selectedQuestion()
  if (!question) return showHUD("请先选中一张题目卡片")
  const mistakeContext = mistakeAnswerContext(question, questionNotebookId)
  const lookupQuestion = mistakeContext?.sourceQuestion ?? question
  const bindingSourceNotebookId = mistakeContext?.record.sourceNotebookId ?? questionNotebookId
  const bindings = loadBindings()
  const answerNotebookId = bindings[bindingSourceNotebookId] ??
    mistakeContext?.record.answerNotebookId
  if (!answerNotebookId) {
    const shouldBind = await popup({
      title: "尚未绑定答案脑图",
      message: mistakeContext
        ? `原题脑图「${mistakeContext.record.sourceNotebookTitle}」还没有对应的答案脑图。`
        : "当前脑图还没有对应的答案脑图。",
      buttons: ["取消", "立即绑定"],
      canCancel: true
    })
    if (shouldBind.buttonIndex === 1) await bindAnswerNotebook(bindingSourceNotebookId)
    return
  }

  const questionTitle = question.title?.trim()
  if (!questionTitle) return showHUD("所选卡片没有标题，无法匹配")
  let questionTitles = [questionTitle]
  try {
    questionTitles = Array.from(new Set([
      questionTitle,
      ...lookupQuestion.titles.map(title => title.trim())
    ]))
      .filter(Boolean)
  } catch {
    questionTitles = [questionTitle]
  }

  let questionPath: string[] = []
  try {
    questionPath = lookupQuestion.ancestorNodes
      .map(ancestor => ancestor.title?.trim())
      .filter(Boolean) as string[]
  } catch {
    questionPath = mistakeContext?.record.sourcePathTitles ?? []
  }

  const matches = findAnswers(answerNotebookId, questionTitles, questionPath)
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

export async function onMistakeToolbarClick(): Promise<void> {
  hideAnswerToolbar()
  try {
    const notebookId = currentNotebookId()
    const question = selectedQuestion()
    if (!notebookId || !question) return showHUD("请先选中一张题目卡片")
    const record = await markQuestionAsMistake(question, notebookId)
    if (!record) return
    const next = await popup({
      title: "错题已记录",
      message: "可以立即核对答案，或跳转到总错题脑图检查摘录结果。",
      buttons: ["完成", "核对答案", "打开错题"],
      canCancel: true
    })
    if (next.buttonIndex === 1) await runSafely(findCurrentAnswer)
    else if (next.buttonIndex === 2) await openMistakeRecord(record)
  } catch (error) {
    MN.error(error)
    showHUD(`错题摘录失败：${String(error)}`, 5)
  }
}

export interface AnswerWorkbenchCandidate {
  id: string
  title: string
  path: string
  html: string
}

export interface AnswerWorkbenchData {
  questionTitle: string
  sourceNotebookTitle: string
  answerNotebookTitle?: string
  status: "ready" | "unbound" | "not-found"
  candidates: AnswerWorkbenchCandidate[]
}

export function answerWorkbenchData(): AnswerWorkbenchData {
  const questionNotebookId = currentNotebookId()
  if (!questionNotebookId) throw new Error("请先打开题目脑图")
  const question = selectedQuestion()
  if (!question) throw new Error("请先选中一张题目卡片")
  const mistakeContext = mistakeAnswerContext(question, questionNotebookId)
  const lookupQuestion = mistakeContext?.sourceQuestion ?? question
  const sourceNotebookId = mistakeContext?.record.sourceNotebookId ?? questionNotebookId
  const answerNotebookId = loadBindings()[sourceNotebookId] ?? mistakeContext?.record.answerNotebookId
  const questionTitle = question.title?.trim() || "未命名题目"
  if (!answerNotebookId) {
    return {
      questionTitle,
      sourceNotebookTitle: notebookTitle(sourceNotebookId),
      status: "unbound",
      candidates: []
    }
  }
  let titles = [questionTitle]
  let path: string[] = mistakeContext?.record.sourcePathTitles ?? []
  try {
    titles = Array.from(new Set([questionTitle, ...lookupQuestion.titles.map(title => title.trim())])).filter(Boolean)
    path = lookupQuestion.ancestorNodes.map(node => node.title?.trim()).filter(Boolean) as string[]
  } catch {
    // Stored source metadata is the fallback for migrated mistake cards.
  }
  const matches = findAnswers(answerNotebookId, titles, path)
  return {
    questionTitle,
    sourceNotebookTitle: notebookTitle(sourceNotebookId),
    answerNotebookTitle: notebookTitle(answerNotebookId),
    status: matches.length ? "ready" : "not-found",
    candidates: matches.map(answer => ({
      id: answer.noteId,
      title: answer.titles[0] || "答案卡片",
      path: answer.pathTitles.filter(Boolean).join(" › "),
      html: answerCardHtml(answer, questionTitle)
    }))
  }
}

export async function onMistakeLinkToolbarClick(): Promise<void> {
  hideAnswerToolbar()
  try {
    const notebookId = currentNotebookId()
    const question = selectedQuestion()
    if (!notebookId || !question) return showHUD("请先选中一张题目或错题卡片")
    await openLinkedMistakeOrSource(question, notebookId)
  } catch (error) {
    MN.error(error)
    showHUD(`卡片跳转失败：${String(error)}`, 5)
  }
}

async function refreshCurrentIndex(): Promise<void> {
  const questionNotebookId = currentNotebookId()
  if (!questionNotebookId) return showHUD("请先打开题目脑图")
  const answerNotebookId = loadBindings()[questionNotebookId]
  if (!answerNotebookId) return showHUD("当前脑图尚未绑定答案脑图")
  HUDController.show("正在重建答案索引，请稍候…")
  await delay(0.08)
  let result
  try {
    result = refreshIndex(answerNotebookId)
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
  const bindings = loadBindings()
  const answerNotebookId = bindings[questionNotebookId]
  if (!answerNotebookId) return showHUD("当前脑图没有绑定")
  const result = await popup({
    title: "解除绑定",
    message: `题目脑图：${notebookTitle(questionNotebookId)}\n答案脑图：${notebookTitle(answerNotebookId)}`,
    buttons: ["取消", "解除绑定"],
    canCancel: true,
    multiLine: true
  })
  if (result.buttonIndex !== 1) return
  delete bindings[questionNotebookId]
  saveBindings(bindings)
  clearIndex(answerNotebookId)
  showHUD("已解除当前脑图的答案绑定")
}

export async function openMenu(): Promise<void> {
  const questionNotebookId = currentNotebookId()
  if (!questionNotebookId) return showHUD("请先打开一个脑图")
  const answerNotebookId = loadBindings()[questionNotebookId]
  const binding = answerNotebookId ? notebookTitle(answerNotebookId) : "未绑定"
  const result = await select(
    [
      "查找当前卡片答案",
      "错题分级并摘录",
      "错题统计与到期复习",
      "错题分类目录",
      "打开错题 / 返回原题",
      "修复并整理错题记录",
      "绑定/更换总错题脑图",
      "绑定/更换答案脑图",
      "刷新答案索引",
      "检查插件更新",
      "解除当前答案绑定"
    ],
    "答案匹配",
    `当前答案绑定：${binding}`,
    true
  )
  if (result.index === 0) await runSafely(findCurrentAnswer)
  else if (result.index === 1) await onMistakeToolbarClick()
  else if (result.index === 2) await openMistakeReviewCenter()
  else if (result.index === 3) await openMistakeDirectory()
  else if (result.index === 4) {
    const question = selectedQuestion()
    if (!question) showHUD("请先选中一张题目或错题卡片")
    else await openLinkedMistakeOrSource(question, questionNotebookId)
  }
  else if (result.index === 5) await repairAndOrganizeMistakes()
  else if (result.index === 6) await bindMistakeNotebook()
  else if (result.index === 7) await runSafely(bindAnswerNotebook)
  else if (result.index === 8) await runSafely(refreshCurrentIndex)
  else if (result.index === 9) await checkForUpdates(true)
  else if (result.index === 10) await runSafely(unbindCurrent)
}

export const lifecycle = defineLifecycleHandlers({
  instanceMethods: {
    sceneWillConnect() {
      self.addon = { key: "mn4-answer-matcher", title: "答案匹配" }
      self.lastClickedNote = undefined
      self.answerToolbar = createAnswerToolbar()
      self.answerToolbarShownAt = 0
      eventObservers.remove()
      eventObservers.add()
      scheduleAutomaticUpdateCheck()
      scheduleMistakeReviewReminder()
      startMistakeReminderTimer()
    },
    notebookWillOpen(notebookId: string) {
      eventObservers.remove()
      eventObservers.add()
    },
    notebookWillClose() {
      eventObservers.remove()
      self.lastClickedNote = undefined
      hideAnswerToolbar()
      closeAnswerCard()
    },
    sceneDidDisconnect() {
      eventObservers.remove()
      clearIndex()
      closeAnswerCard()
      stopMistakeReminderTimer()
    }
  },
  classMethods: {
    applicationWillEnterForeground() {
      scheduleAutomaticUpdateCheck()
      scheduleMistakeReviewReminder()
    },
    addonWillDisconnect() {
      clearIndex()
    }
  }
})

export const handlers = defineEventHandlers<(typeof events)[number]>({
  onPopupMenuOnNote(sender) {
    if (self.window !== MN.currentWindow) return
    self.lastClickedNote = sender.userInfo?.note
    showAnswerToolbar((sender.userInfo as any).winRect)
  },
  async onClosePopupMenuOnNote() {
    if (self.window !== MN.currentWindow) return
    const shownAt = self.answerToolbarShownAt
    await delay(0.15)
    if (shownAt === self.answerToolbarShownAt) hideAnswerToolbar()
  }
})

export function queryAddonCommandStatus() {
  return currentNotebookId()
    ? { image: "logo.png", object: self, selector: "openMenu:", checked: false }
    : null
}
