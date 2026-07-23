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
import { findAnswersForQuestion } from "./answer-lookup"
import { createAnswerToolbar, destroyAnswerToolbar, hideAnswerToolbar, showAnswerToolbar } from "./floating-toolbar"
import {
  answerCardHtml,
  answerText,
  clearIndex,
  IndexedAnswer,
  refreshIndex
} from "./matcher"
import {
  BindingTarget,
  RegexMatchingRules,
  getBinding,
  getBindingForMode,
  loadBindings,
  normalizeBinding,
  removeBinding,
  saveBindings,
  setBinding,
  targetForMode
} from "./store"
import { validateRegexMatchingRules } from "./regex-matching"
import { loadMatcherSettings, saveMatcherSettings } from "./settings"
import { mindMapRoot, nodeIdentifier } from "./mindmap-scope"
import { isSelectableMindMapRoot } from "./mindmap-candidate"
import { buildOrderedPairingForBinding } from "./ordered-pairing"
import {
  closeAnswerCard,
  onAnswerCardPan,
  onAnswerCardResize,
  showAnswerCard
} from "./answer-card-view"
import { checkForUpdates, scheduleAutomaticUpdateCheck } from "./updater"
import { chooseNotebook, closeNotebookPicker, onNotebookPickerAction } from "./notebook-picker"
import { completePendingNoteNavigation } from "./note-navigation"
import {
  chooseMistakeLevel,
  closeMistakeLevelPicker,
  onMistakeLevelPickerAction
} from "./level-picker"
import {
  bindMistakeNotebook,
  markQuestionAsMistake,
  mistakeAnswerContext,
  mistakeRecordForSourceQuestion,
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

interface MindMapCandidate extends BindingTarget {
  title: string
}

function mindMapTitle(node: NodeNote): string {
  return node.title?.trim() || "未命名脑图"
}

function sourceMindMap(
  notebookId = currentNotebookId(),
  question = selectedQuestion()
): { notebookId: string; rootNodeId: string; title: string } | undefined {
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

function matchingModeLabel(target?: BindingTarget): string {
  if (target?.matchMode === "parent-order") {
    return `章节顺序配对（${target.orderedPairing?.pairs.length ?? 0} 张）`
  }
  if (target?.matchMode === "regex") return "正则规则匹配"
  return "完整标题匹配"
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
    answerNotebookId = selected.id
  } else {
    const result = await select(
      notebooks.map((item, index) => `${index + 1}. ${item.title?.trim() || "未命名学习集"}`),
      "绑定答案学习集",
      "将索引所选学习集内的全部卡片",
      true
    )
    if (result.index < 0) return
    answerNotebookId = notebooks[result.index].topicId!
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

export async function bindAnswerNotebook(
  targetQuestionNotebookId?: string,
  targetQuestion?: NodeNote
): Promise<void> {
  const questionNotebookId = targetQuestionNotebookId ?? currentNotebookId()
  if (!questionNotebookId) return showHUD("请先打开题目脑图")
  if (!scopedBindingEnabled()) return bindAnswerStudySet(questionNotebookId)
  const source = sourceMindMap(questionNotebookId, targetQuestion ?? selectedQuestion())
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
    targetNotebookId = selected.id
  } else {
    const result = await select(
      notebooks.map((item, index) => `${index + 1}. ${item.title?.trim() || "未命名学习集"}${item.topicId === source.notebookId ? "（当前）" : ""}`),
      "选择答案所在学习集",
      "答案脑图可以位于当前学习集",
      true
    )
    if (result.index < 0) return
    targetNotebookId = notebooks[result.index].topicId!
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
    const selected = await chooseNotebook(candidates.map((item, index) => ({ id: String(index), title: item.title })))
    if (!selected) return
    target = candidates[Number(selected.id)]
  } else {
    const result = await select(
      candidates.map((item, index) => `${index + 1}. ${item.title}`),
      "绑定答案脑图",
      "请选择与当前题目脑图对应的答案脑图",
      true
    )
    if (result.index < 0) return
    target = candidates[result.index]
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

function issuePreview(
  issues: ReturnType<typeof buildOrderedPairingForBinding>["issues"]
): string {
  if (!issues.length) return ""
  const lines = issues.slice(0, 8).map(issue => {
    if (issue.reason === "count") {
      return `• ${issue.title}：题目 ${issue.sourceCount} / 答案 ${issue.answerCount}`
    }
    if (issue.reason === "ambiguous") return `• ${issue.title}：存在重名父节点`
    return `• ${issue.title}：答案侧没有同名父节点`
  })
  const remaining = issues.length - lines.length
  return `\n\n未自动配对：\n${lines.join("\n")}${remaining > 0 ? `\n• 另有 ${remaining} 个父节点` : ""}`
}

function pairPreview(
  previews: ReturnType<typeof buildOrderedPairingForBinding>["previews"]
): string {
  const lines = previews.slice(0, 6).map(item =>
    `• ${item.parentTitle} 第 ${item.position + 1} 张：` +
    `${item.questionTitle || "未命名题目"} → ${item.answerTitle || "未命名答案"}`
  )
  const remaining = previews.length - lines.length
  return lines.length
    ? `\n\n配对预览：\n${lines.join("\n")}${remaining > 0 ? `\n• 另有 ${remaining} 组配对` : ""}`
    : ""
}

export interface AnswerMatchingSettingsData {
  mode: "title" | "parent-order" | "regex"
  label: string
  bound: boolean
  scopedBinding: boolean
  pairs: number
  matchedGroups: number
  regexRules: RegexMatchingRules
}

export function answerMatchingSettingsData(): AnswerMatchingSettingsData {
  const notebookId = currentNotebookId()
  const source = sourceMindMap()
  const target = notebookId ? bindingForSource(notebookId, source?.rootNodeId) : undefined
  return {
    mode: target?.matchMode === "parent-order"
      ? "parent-order"
      : target?.matchMode === "regex"
        ? "regex"
        : "title",
    label: matchingModeLabel(target),
    bound: Boolean(target),
    scopedBinding: scopedBindingEnabled(),
    pairs: target?.orderedPairing?.pairs.length ?? 0,
    matchedGroups: target?.orderedPairing?.matchedGroups ?? 0,
    regexRules: target?.regexRules ?? {
      questionPattern: "",
      answerPattern: ""
    }
  }
}

function saveMatchingTarget(
  bindings: ReturnType<typeof loadBindings>,
  questionNotebookId: string,
  sourceRootNodeId: string | undefined,
  target: BindingTarget
): void {
  if (scopedBindingEnabled()) {
    if (!sourceRootNodeId) throw new Error("请先选中当前题目脑图中的任一卡片")
    setBinding(bindings, questionNotebookId, sourceRootNodeId, target)
  } else {
    bindings[questionNotebookId] = target
  }
  saveBindings(bindings)
}

export function saveRegexMatchingRules(
  questionPattern: string,
  answerPattern: string
): { saved: true; mode: "regex" } {
  const questionNotebookId = currentNotebookId()
  if (!questionNotebookId) throw new Error("请先打开题目脑图")
  const source = sourceMindMap()
  if (scopedBindingEnabled() && !source) {
    throw new Error("请先选中当前题目脑图中的任一卡片")
  }
  const bindings = loadBindings()
  const target = getBindingForMode(
    bindings,
    questionNotebookId,
    source?.rootNodeId,
    scopedBindingEnabled()
  )
  if (!target) throw new Error("请先绑定答案脑图")
  const regexRules = {
    questionPattern: String(questionPattern ?? "").trim(),
    answerPattern: String(answerPattern ?? "").trim()
  }
  const validation = validateRegexMatchingRules(regexRules)
  if (!validation.valid) throw new Error(validation.error || "正则规则无效")
  saveMatchingTarget(bindings, questionNotebookId, source?.rootNodeId, {
    ...target,
    matchMode: "regex",
    regexRules
  })
  showHUD("已保存并启用独立正则规则匹配", 4)
  notifyWorkbenchDataChanged()
  return { saved: true, mode: "regex" }
}

export function setScopedBindingEnabled(enabled: boolean): void {
  saveMatcherSettings({ allowSameStudySetMindMap: enabled })
  showHUD(
    enabled
      ? "已开启：可为每个题目脑图绑定具体答案脑图，包括同一学习集内的脑图"
      : "已关闭：恢复按整个答案学习集绑定",
    4
  )
  notifyWorkbenchDataChanged()
}

export async function configureAnswerMatching(): Promise<void> {
  const questionNotebookId = currentNotebookId()
  if (!questionNotebookId) return showHUD("请先打开题目脑图")
  const source = sourceMindMap()
  if (scopedBindingEnabled() && !source) {
    return showHUD("请先选中当前题目脑图中的任一卡片")
  }
  const bindings = loadBindings()
  const currentTarget = getBindingForMode(
    bindings,
    questionNotebookId,
    source?.rootNodeId,
    scopedBindingEnabled()
  )
  if (!currentTarget) return showHUD("请先绑定答案脑图")
  const mode = await select(
    [
      "完整标题匹配（默认）",
      "父节点标题匹配＋子卡片顺序",
      "独立正则规则匹配"
    ],
    "设置答案匹配方式",
    `当前：${matchingModeLabel(currentTarget)}`,
    true
  )
  if (mode.index < 0) return
  if (mode.index === 0) {
    const { matchMode: _mode, orderedPairing: _pairing, ...base } = currentTarget
    saveMatchingTarget(bindings, questionNotebookId, source?.rootNodeId, {
      ...base,
      matchMode: "title"
    })
    showHUD("已切换为完整标题匹配")
    notifyWorkbenchDataChanged()
    return
  }
  if (mode.index === 2) {
    saveMatchingTarget(bindings, questionNotebookId, source?.rootNodeId, {
      ...currentTarget,
      matchMode: "regex"
    })
    showHUD(
      currentTarget.regexRules
        ? "已切换为独立正则规则匹配"
        : "已选择正则规则匹配，请在工作台设置中填写题目规则和答案规则",
      4
    )
    notifyWorkbenchDataChanged()
    return
  }
  if (!scopedBindingEnabled()) {
    const confirmation = await popup({
      title: "需要具体脑图绑定",
      message:
        "“父节点标题＋子卡片顺序”需要把题目脑图绑定到一棵具体的答案脑图。是否现在开启具体脑图绑定？",
      buttons: ["取消", "开启"],
      canCancel: true
    })
    if (confirmation.buttonIndex === 1) {
      setScopedBindingEnabled(true)
      showHUD("已开启具体脑图绑定，请先绑定或更换答案脑图", 4)
    }
    return
  }
  if (!source || !currentTarget.rootNodeId) return showHUD("请先绑定具体答案脑图")

  HUDController.show("正在分析两个脑图的父节点与子卡片顺序…")
  await delay(0.05)
  let result: ReturnType<typeof buildOrderedPairingForBinding>
  try {
    result = buildOrderedPairingForBinding(
      questionNotebookId,
      source.rootNodeId,
      currentTarget
    )
  } finally {
    HUDController.hidden()
  }
  if (!result.pairing.pairs.length) {
    return popup({
      title: "没有可安全配对的章节",
      message: `没有找到“父标题唯一且两侧子卡片数量相同”的章节。${issuePreview(result.issues)}`,
      buttons: ["知道了"],
      canCancel: true,
      multiLine: true
    }).then(() => undefined)
  }
  const confirmation = await popup({
    title: "确认启用章节顺序配对",
    message:
      `找到 ${result.pairing.matchedGroups} 个对应父节点，可固定配对 ${result.pairing.pairs.length} 张卡片。\n` +
      "父标题会忽略“第几部分/章/节”等前缀，并允许唯一的包含匹配；只有两侧直接子卡片数量相同的章节会参与，其他章节继续回退到完整标题匹配。" +
      pairPreview(result.previews) +
      issuePreview(result.issues),
    buttons: ["取消", "启用并固定配对"],
    canCancel: true,
    multiLine: true
  })
  if (confirmation.buttonIndex !== 1) return

  HUDController.show("正在刷新答案索引并保存固定配对…")
  await delay(0.05)
  try {
    await refreshIndex(currentTarget)
  } finally {
    HUDController.hidden()
  }
  setBinding(bindings, questionNotebookId, source.rootNodeId, {
    ...currentTarget,
    matchMode: "parent-order",
    orderedPairing: result.pairing
  })
  saveBindings(bindings)
  showHUD(
    `已启用章节顺序配对：${result.pairing.matchedGroups} 个父节点，${result.pairing.pairs.length} 张卡片`,
    4
  )
  notifyWorkbenchDataChanged()
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
export { onNotebookPickerAction }
export { onMistakeLevelPickerAction }

export async function findCurrentAnswer(): Promise<void> {
  const questionNotebookId = currentNotebookId()
  if (!questionNotebookId) return showHUD("请先打开题目脑图")
  const question = selectedQuestion()
  if (!question) return showHUD("请先选中一张题目卡片")
  const mistakeContext = mistakeAnswerContext(question, questionNotebookId)
  const lookupQuestion = mistakeContext?.sourceQuestion ?? question
  const bindingSourceNotebookId = mistakeContext?.record.sourceNotebookId ?? questionNotebookId
  const sourceRootNodeId = nodeIdentifier(mindMapRoot(lookupQuestion))
  const storedTarget = bindingForSource(bindingSourceNotebookId, sourceRootNodeId) ??
    (mistakeContext?.record.answerNotebookId
      ? {
          notebookId: mistakeContext.record.answerNotebookId,
          rootNodeId: mistakeContext.record.answerRootNodeId
        }
      : undefined)
  const answerTarget = storedTarget && effectiveAnswerTarget(storedTarget)
  if (!answerTarget) {
    const shouldBind = await popup({
      title: "尚未绑定答案脑图",
      message: mistakeContext
        ? `原题脑图「${mistakeContext.record.sourceNotebookTitle}」还没有对应的答案脑图。`
        : "当前脑图还没有对应的答案脑图。",
      buttons: ["取消", "立即绑定"],
      canCancel: true
    })
    if (shouldBind.buttonIndex === 1) await bindAnswerNotebook(bindingSourceNotebookId, lookupQuestion)
    return
  }

  const questionTitle = question.title?.trim() || lookupQuestion.title?.trim() || "未命名题目"
  let questionTitles = questionTitle === "未命名题目" ? [] : [questionTitle]
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

  const matches = findAnswersForQuestion(
    answerTarget,
    lookupQuestion,
    questionTitles,
    questionPath
  )
  if (!matches.length) {
    const notFoundMessage = answerTarget.matchMode === "parent-order"
      ? `当前卡片没有固定顺序配对，也未找到同标题答案：${questionTitle}`
      : answerTarget.matchMode === "regex"
        ? `题目规则未提取到可匹配键，或答案规则没有对应结果：${questionTitle}`
        : `未找到同标题答案：${questionTitle}`
    return showHUD(
      notFoundMessage,
      3
    )
  }
  const answer = await chooseMatch(
    matches,
    answerTarget.matchMode === "regex" ? [] : questionPath
  )
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
    const previous = mistakeRecordForSourceQuestion(question, notebookId)
    const level = await chooseMistakeLevel(previous?.level)
    if (level === undefined) return
    const record = await markQuestionAsMistake(question, notebookId, level)
    if (!record) return
    notifyWorkbenchDataChanged()
  } catch (error) {
    MN.error(error)
    showHUD(`错题摘录失败：${String(error)}`, 5)
  }
}

function notifyWorkbenchDataChanged(): void {
  try {
    const webView = self.webController?.webView
    if (webView) {
      webView.evaluateJavaScript(
        "typeof window.__onNativeDataChanged==='function'&&window.__onNativeDataChanged()",
        () => undefined
      )
    }
  } catch {
    // The workbench may not have been opened yet; it loads fresh data when shown.
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
  const sourceRootNodeId = nodeIdentifier(mindMapRoot(lookupQuestion))
  const storedTarget = bindingForSource(sourceNotebookId, sourceRootNodeId) ??
    (mistakeContext?.record.answerNotebookId
      ? {
          notebookId: mistakeContext.record.answerNotebookId,
          rootNodeId: mistakeContext.record.answerRootNodeId
        }
      : undefined)
  const answerTarget = storedTarget && effectiveAnswerTarget(storedTarget)
  const questionTitle = question.title?.trim() || "未命名题目"
  if (!answerTarget) {
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
  const matches = findAnswersForQuestion(answerTarget, lookupQuestion, titles, path)
  return {
    questionTitle,
    sourceNotebookTitle: notebookTitle(sourceNotebookId),
    answerNotebookTitle: scopedBindingEnabled()
      ? targetTitle(answerTarget)
      : notebookTitle(answerTarget.notebookId),
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

export async function refreshCurrentIndex(): Promise<void> {
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

export async function unbindCurrent(): Promise<void> {
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
    message: scopedBindingEnabled()
      ? `题目脑图：${source?.title || "当前脑图"}\n答案脑图：${targetTitle(answerTarget)}`
      : `题目学习集：${notebookTitle(questionNotebookId)}\n答案学习集：${notebookTitle(answerTarget.notebookId)}`,
    buttons: ["取消", "解除绑定"],
    canCancel: true,
    multiLine: true
  })
  if (result.buttonIndex !== 1) return
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
  const binding = answerTarget
    ? scoped ? targetTitle(answerTarget) : notebookTitle(answerTarget.notebookId)
    : "未绑定"
  const result = await select(
    [
      "查找当前卡片答案",
      "标记错题级别",
      "错题统计与到期复习",
      "打开错题浏览窗口",
      "定位当前错题原题",
      "刷新错题分类索引",
      scoped ? "绑定/更换具体答案脑图" : "绑定/更换答案学习集",
      "刷新答案索引",
      `设置匹配方式：${matchingModeLabel(answerTarget)}`,
      `同学习集脑图绑定：${scoped ? "已开启" : "已关闭"}`,
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
  else if (result.index === 3) {
    ;(self as any).toggleWebPanel?.()
  }
  else if (result.index === 4) {
    const question = selectedQuestion()
    if (!question) showHUD("请先选中一张题目或错题卡片")
    else await openLinkedMistakeOrSource(question, questionNotebookId)
  }
  else if (result.index === 5) await repairAndOrganizeMistakes()
  else if (result.index === 6) await runSafely(bindAnswerNotebook)
  else if (result.index === 7) await runSafely(refreshCurrentIndex)
  else if (result.index === 8) await runSafely(configureAnswerMatching)
  else if (result.index === 9) {
    setScopedBindingEnabled(!scoped)
  }
  else if (result.index === 10) await checkForUpdates(true)
  else if (result.index === 11) await runSafely(unbindCurrent)
}

export const lifecycle = defineLifecycleHandlers({
  instanceMethods: {
    sceneWillConnect() {
      self.addon = {
        key: __APP_VERSION__.includes("-beta")
          ? "mn4-answer-matcher-beta"
          : "mn4-answer-matcher",
        title: __APP_VERSION__.includes("-beta") ? "答案匹配 Beta" : "答案匹配"
      }
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
      void completePendingNoteNavigation(notebookId)
    },
    notebookWillClose() {
      eventObservers.remove()
      self.lastClickedNote = undefined
      hideAnswerToolbar()
      closeAnswerCard()
      closeNotebookPicker()
      closeMistakeLevelPicker()
    },
    sceneDidDisconnect() {
      eventObservers.remove()
      destroyAnswerToolbar()
      clearIndex()
      closeAnswerCard()
      closeNotebookPicker()
      closeMistakeLevelPicker()
      stopMistakeReminderTimer()
    }
  },
  classMethods: {
    applicationWillEnterForeground() {
      scheduleAutomaticUpdateCheck()
      scheduleMistakeReviewReminder()
    },
    addonWillDisconnect() {
      destroyAnswerToolbar()
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
