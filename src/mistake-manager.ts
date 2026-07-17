import {
  delay,
  MN,
  NodeNote,
  popup,
  select,
  setTimeInterval,
  showHUD,
  undoGroupingWithRefresh
} from "marginnote"
import type { MbBookNote } from "marginnote"
import { loadBindings } from "./store"
import {
  createMistakeRecord,
  isDue,
  LEVEL_DESCRIPTIONS,
  compareMistakeRecords,
  mistakeCategoryLabel,
  mistakeCategoryPath,
  MistakeLevel,
  MistakeRecord,
  reviewMistake
} from "./mistake-domain"
import {
  loadMistakeState,
  recordForSource,
  saveMistakeState,
  upsertMistakeRecord
} from "./mistake-store"
import { openNoteInMindMap } from "./note-navigation"

const LAST_REMINDER_KEY = "marginnote.extension.mn4-answer-matcher.mistake-reminder"
const REMINDER_THROTTLE = 6 * 60 * 60 * 1000

function noteId(note: MbBookNote): string {
  return String(note.noteId ?? "")
}

function notebookTitle(notebookId: string): string {
  return MN.db.getNotebookById(notebookId)?.title?.trim() || "未命名脑图"
}

function formatTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`
}

function levelOptions(): string[] {
  return ([0, 1, 2, 3, 4, 5] as MistakeLevel[]).map(
    level => `${level}级 · ${LEVEL_DESCRIPTIONS[level]}`
  )
}

async function chooseLevel(current?: MistakeLevel): Promise<MistakeLevel | undefined> {
  const result = await select(
    levelOptions(),
    "错题分级",
    current === undefined
      ? "请选择当前掌握程度"
      : `当前 ${current} 级；请选择本次复习后的掌握程度`,
    true
  )
  return result.index < 0 ? undefined : (result.index as MistakeLevel)
}

function tagPart(value: string): string {
  return value.replace(/[\n\r#]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40)
}

function applyMistakeTags(node: NodeNote, record: MistakeRecord, level: MistakeLevel): void {
  const tags = node.tags.filter(tag =>
    tag !== "错题" &&
    !/^错题[0-5]级$/.test(tag) &&
    !/^(来源|章节)·/.test(tag)
  )
  const category = mistakeCategoryPath(record)
  const classified = [
    `来源·${tagPart(record.sourceNotebookTitle)}`,
    category.length > 1 ? `章节·${tagPart(category[1])}` : ""
  ].filter(Boolean)
  node.tags = [...tags, "错题", `错题${level}级`, ...classified]
  node.tidyupTags()
}

function pathTitles(question: NodeNote): string[] {
  try {
    return question.ancestorNodes.map(node => node.title?.trim()).filter(Boolean) as string[]
  } catch {
    return []
  }
}

export async function bindMistakeNotebook(): Promise<string | undefined> {
  const current = MN.currnetNotebookId
  const notebooks = (MN.db.allNotebooks() ?? []).filter(
    notebook => notebook.topicId && notebook.flags === 2
  )
  if (!notebooks.length) return showHUD("没有可用的脑图"), undefined
  const options = notebooks.map((notebook, index) =>
    `${index + 1}. ${notebook.title?.trim() || "未命名脑图"}${
      notebook.topicId === current ? " · 当前" : ""
    }`
  )
  const result = await select(
    options,
    "绑定总错题脑图",
    "所有题目脑图的错题都会集中复制到这里。建议先新建一个空白脑图。",
    true
  )
  if (result.index < 0) return undefined
  const notebookId = notebooks[result.index].topicId!
  const state = loadMistakeState()
  if (
    state.notebookId &&
    state.notebookId !== notebookId &&
    Object.keys(state.records).length
  ) {
    const confirmation = await popup({
      title: "更换总错题脑图",
      message: "已有错题不会被删除，但旧脑图中的记录将停止参与统计和提醒。确定更换并重新开始记录吗？",
      buttons: ["取消", "确定更换"],
      canCancel: true,
      multiLine: true
    })
    if (confirmation.buttonIndex !== 1) return undefined
    state.records = {}
    state.sourceIndex = {}
  }
  state.notebookId = notebookId
  saveMistakeState(state)
  showHUD(`已绑定总错题脑图「${notebookTitle(notebookId)}」`, 4)
  return notebookId
}

async function ensureMistakeNotebook(): Promise<string | undefined> {
  const state = loadMistakeState()
  if (state.notebookId && MN.db.getNotebookById(state.notebookId)) return state.notebookId
  const result = await popup({
    title: "尚未绑定总错题脑图",
    message: "请先在 MarginNote 中新建一个空白脑图，再将它绑定为总错题脑图。",
    buttons: ["取消", "立即绑定"],
    canCancel: true
  })
  return result.buttonIndex === 1 ? bindMistakeNotebook() : undefined
}

function existingClone(sourceNoteId: string, mistakeNotebookId: string): MbBookNote | undefined {
  const notebook = MN.db.getNotebookById(mistakeNotebookId)
  return notebook?.notes?.find(note =>
    note?.linkedNotes?.some(link => String(link.noteid) === sourceNoteId)
  )
}

function recordFromLinkedSource(
  mistakeNote: MbBookNote,
  mistakeNotebookId: string
): MistakeRecord | undefined {
  const sourceNote = mistakeNote.linkedNotes
    ?.map(link => MN.db.getNoteById(String(link.noteid)))
    .find(note => note?.notebookId && note.notebookId !== mistakeNotebookId)
  if (!sourceNote?.notebookId) return undefined
  const sourceQuestion = new NodeNote(sourceNote, sourceNote.notebookId)
  const tag = new NodeNote(mistakeNote, mistakeNotebookId).tags.find(item => /^错题[0-5]级$/.test(item))
  const level = Number(tag?.match(/[0-5]/)?.[0] ?? 0) as MistakeLevel
  return createMistakeRecord(
    {
      mistakeNoteId: noteId(mistakeNote),
      sourceNoteId: noteId(sourceNote),
      sourceNotebookId: sourceNote.notebookId,
      sourceNotebookTitle: notebookTitle(sourceNote.notebookId),
      sourceTitle: sourceQuestion.title?.trim() || "未命名错题",
      sourcePathTitles: pathTitles(sourceQuestion),
      categoryPath: [notebookTitle(sourceNote.notebookId), ...pathTitles(sourceQuestion)],
      answerNotebookId: loadBindings()[sourceNote.notebookId],
      level
    },
    mistakeNote.createDate || new Date()
  )
}

export function mistakeRecordForQuestion(
  question: NodeNote,
  currentNotebookId: string
): MistakeRecord | undefined {
  const state = loadMistakeState()
  if (state.notebookId !== currentNotebookId) return undefined
  const id = noteId(question.note)
  if (state.records[id]) return state.records[id]
  const recovered = recordFromLinkedSource(question.note, currentNotebookId)
  if (recovered) {
    upsertMistakeRecord(state, recovered)
    saveMistakeState(state)
  }
  return recovered
}

export function mistakeRecordForSourceQuestion(
  question: NodeNote,
  currentNotebookId: string
): MistakeRecord | undefined {
  return recordForSource(loadMistakeState(), currentNotebookId, noteId(question.note))
}

export interface MistakeAnswerContext {
  record: MistakeRecord
  sourceQuestion?: NodeNote
}

export function mistakeAnswerContext(
  question: NodeNote,
  currentNotebookId: string
): MistakeAnswerContext | undefined {
  const record = mistakeRecordForQuestion(question, currentNotebookId)
  if (!record) return undefined
  const sourceNote = MN.db.getNoteById(record.sourceNoteId)
  return {
    record,
    sourceQuestion: sourceNote
      ? new NodeNote(sourceNote, record.sourceNotebookId)
      : undefined
  }
}

function persistDatabase(...notebookIds: Array<string | undefined>): void {
  MN.db.savedb()
  for (const notebookId of new Set(notebookIds.filter(Boolean) as string[])) {
    MN.db.setNotebookSyncDirty(notebookId)
  }
}

async function updateExistingRecord(
  record: MistakeRecord,
  level: MistakeLevel
): Promise<MistakeRecord> {
  const updated = reviewMistake(record, level)
  const mistakeNote = MN.db.getNoteById(record.mistakeNoteId)
  const sourceNote = MN.db.getNoteById(record.sourceNoteId)
  undoGroupingWithRefresh(() => {
    if (mistakeNote) {
      applyMistakeTags(new NodeNote(mistakeNote, loadMistakeState().notebookId), updated, level)
      mistakeNote.appendTextComment(
        `【错题复习】${formatTime(updated.lastReviewedAt!)} · ${level}级 · 下次 ${formatTime(
          updated.nextReviewAt
        )}`
      )
    }
    if (sourceNote) applyMistakeTags(new NodeNote(sourceNote, record.sourceNotebookId), updated, level)
  })
  const state = loadMistakeState()
  upsertMistakeRecord(state, updated)
  saveMistakeState(state)
  persistDatabase(state.notebookId, record.sourceNotebookId)
  return updated
}

export async function markQuestionAsMistake(
  question: NodeNote,
  sourceNotebookId: string
): Promise<MistakeRecord | undefined> {
  const mistakeNotebookId = await ensureMistakeNotebook()
  if (!mistakeNotebookId) return

  const inMistakeNotebook = mistakeNotebookId === sourceNotebookId
  if (inMistakeNotebook) {
    const record = mistakeRecordForQuestion(question, sourceNotebookId)
    if (!record) {
      showHUD("这张卡片没有可识别的原题来源", 4)
      return
    }
    const level = await chooseLevel(record.level)
    if (level === undefined) return
    const updated = await updateExistingRecord(record, level)
    showHUD(`已记录为 ${level} 级；下次复习 ${formatTime(updated.nextReviewAt)}`, 4)
    return updated
  }

  const sourceNoteId = noteId(question.note)
  if (!sourceNoteId) {
    showHUD("所选卡片没有 noteId，无法摘录")
    return
  }
  const state = loadMistakeState()
  let record = recordForSource(state, sourceNotebookId, sourceNoteId)
  if (record && !MN.db.getNoteById(record.mistakeNoteId)) record = undefined
  const clone = record ? MN.db.getNoteById(record.mistakeNoteId) :
    existingClone(sourceNoteId, mistakeNotebookId)

  const level = await chooseLevel(record?.level)
  if (level === undefined) return
  if (record) {
    const updated = await updateExistingRecord(record, level)
    showHUD(`错题记录已更新为 ${level} 级；下次复习 ${formatTime(updated.nextReviewAt)}`, 4)
    return updated
  }

  let mistakeNote = clone
  if (!mistakeNote) {
    undoGroupingWithRefresh(() => {
      mistakeNote = MN.db.cloneNotesToTopic([question.note], mistakeNotebookId)?.[0]
    })
  }
  if (!mistakeNote) throw new Error("复制错题卡片失败")

  const answerNotebookId = loadBindings()[sourceNotebookId]
  const created = createMistakeRecord(
    {
      mistakeNoteId: noteId(mistakeNote),
      sourceNoteId,
      sourceNotebookId,
      sourceNotebookTitle: notebookTitle(sourceNotebookId),
      sourceTitle: question.title?.trim() || "未命名错题",
      sourcePathTitles: pathTitles(question),
      categoryPath: [notebookTitle(sourceNotebookId), ...pathTitles(question)],
      answerNotebookId,
      level
    },
    mistakeNote.createDate || new Date()
  )

  undoGroupingWithRefresh(() => {
    applyMistakeTags(question, created, level)
    applyMistakeTags(new NodeNote(mistakeNote!, mistakeNotebookId), created, level)
    if (!mistakeNote!.linkedNotes?.some(link => String(link.noteid) === sourceNoteId)) {
      mistakeNote!.appendNoteLink(question.note)
    }
    if (!question.note.linkedNotes?.some(link => String(link.noteid) === created.mistakeNoteId)) {
      question.note.appendNoteLink(mistakeNote!)
    }
    mistakeNote!.appendTextComment(
      `【错题档案】\n首次记录：${formatTime(created.createdAt)}\n当前等级：${level}级 · ${
        LEVEL_DESCRIPTIONS[level]
      }\n来源脑图：${created.sourceNotebookTitle}\n原题：${created.sourceTitle}\n下次复习：${formatTime(
        created.nextReviewAt
      )}`
    )
  })
  upsertMistakeRecord(state, created)
  saveMistakeState(state)
  persistDatabase(sourceNotebookId, mistakeNotebookId)
  showHUD(`已摘录到总错题脑图，定为 ${level} 级`, 4)
  return created
}

function dueRecords(): MistakeRecord[] {
  return Object.values(loadMistakeState().records)
    .filter(record => isDue(record) && Boolean(MN.db.getNoteById(record.mistakeNoteId)))
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt) || compareMistakeRecords(a, b))
}

export async function openLinkedMistakeOrSource(
  question: NodeNote,
  currentNotebookId: string
): Promise<void> {
  const state = loadMistakeState()
  if (state.notebookId === currentNotebookId) {
    const record = mistakeRecordForQuestion(question, currentNotebookId)
    if (!record) return showHUD("这张错题没有可识别的原题链接", 4)
    await openNoteInMindMap(record.sourceNoteId, record.sourceNotebookId)
    return
  }
  const record = recordForSource(state, currentNotebookId, noteId(question.note))
  if (!record || !MN.db.getNoteById(record.mistakeNoteId)) {
    return showHUD("这张题目还没有对应的错题卡片", 4)
  }
  await openNoteInMindMap(record.mistakeNoteId, state.notebookId)
}

export async function openMistakeRecord(record: MistakeRecord): Promise<void> {
  const state = loadMistakeState()
  await openNoteInMindMap(record.mistakeNoteId, state.notebookId)
}

function validRecords(): MistakeRecord[] {
  return Object.values(loadMistakeState().records)
    .filter(record => Boolean(MN.db.getNoteById(record.mistakeNoteId)))
    .sort(compareMistakeRecords)
}

export interface MistakeWorkbenchData {
  notebookId?: string
  notebookTitle: string
  records: MistakeRecord[]
  dueCount: number
  levelCounts: number[]
}

export function mistakeWorkbenchData(): MistakeWorkbenchData {
  const state = loadMistakeState()
  const records = validRecords()
  return {
    notebookId: state.notebookId,
    notebookTitle: state.notebookId ? notebookTitle(state.notebookId) : "未绑定总错题脑图",
    records,
    dueCount: records.filter(record => isDue(record)).length,
    levelCounts: [0, 1, 2, 3, 4, 5].map(level =>
      records.filter(record => record.level === level).length
    )
  }
}

export async function openMistakeById(mistakeNoteId: string): Promise<void> {
  const record = loadMistakeState().records[mistakeNoteId]
  if (!record) throw new Error("错题记录不存在")
  await openMistakeRecord(record)
}

export async function openSourceByMistakeId(mistakeNoteId: string): Promise<void> {
  const record = loadMistakeState().records[mistakeNoteId]
  if (!record) throw new Error("错题记录不存在")
  await openNoteInMindMap(record.sourceNoteId, record.sourceNotebookId)
}

export async function reviewMistakeById(
  mistakeNoteId: string,
  level: MistakeLevel
): Promise<MistakeRecord> {
  const record = loadMistakeState().records[mistakeNoteId]
  if (!record) throw new Error("错题记录不存在")
  if (level < 0 || level > 5) throw new Error("错题等级必须为 0–5")
  return updateExistingRecord(record, level)
}

export async function openMistakeDirectory(): Promise<void> {
  const records = validRecords()
  if (!records.length) return showHUD("还没有可整理的错题", 3)
  const groups = new Map<string, MistakeRecord[]>()
  for (const record of records) {
    const label = mistakeCategoryLabel(record)
    groups.set(label, [...(groups.get(label) ?? []), record])
  }
  const labels = [...groups.keys()]
  const category = await select(
    labels.map((label, index) => `${index + 1}. ${label}（${groups.get(label)!.length}题）`),
    "错题分类目录",
    "按来源脑图和章节分类，组内保持稳定排序",
    true
  )
  if (category.index < 0) return
  const chosen = groups.get(labels[category.index])!
  const item = await select(
    chosen.map((record, index) => `${index + 1}. [${record.level}级] ${record.sourceTitle}`),
    labels[category.index],
    "选择错题后跳转到总错题脑图",
    true
  )
  if (item.index >= 0) await openMistakeRecord(chosen[item.index])
}

export async function repairAndOrganizeMistakes(): Promise<void> {
  const state = loadMistakeState()
  if (!state.notebookId) return showHUD("尚未绑定总错题脑图", 3)
  let repaired = 0
  let missing = 0
  for (const stored of Object.values(state.records)) {
    const mistakeNote = MN.db.getNoteById(stored.mistakeNoteId)
    const sourceNote = MN.db.getNoteById(stored.sourceNoteId)
    if (!mistakeNote || !sourceNote) {
      missing++
      continue
    }
    const sourceQuestion = new NodeNote(sourceNote, stored.sourceNotebookId)
    const record: MistakeRecord = {
      ...stored,
      sourceNotebookTitle: notebookTitle(stored.sourceNotebookId),
      sourceTitle: sourceQuestion.title?.trim() || stored.sourceTitle,
      sourcePathTitles: pathTitles(sourceQuestion),
      categoryPath: [notebookTitle(stored.sourceNotebookId), ...pathTitles(sourceQuestion)],
      answerNotebookId: loadBindings()[stored.sourceNotebookId] ?? stored.answerNotebookId
    }
    undoGroupingWithRefresh(() => {
      applyMistakeTags(sourceQuestion, record, record.level)
      applyMistakeTags(new NodeNote(mistakeNote, state.notebookId), record, record.level)
      if (!mistakeNote.linkedNotes?.some(link => String(link.noteid) === record.sourceNoteId)) {
        mistakeNote.appendNoteLink(sourceNote)
      }
      if (!sourceNote.linkedNotes?.some(link => String(link.noteid) === record.mistakeNoteId)) {
        sourceNote.appendNoteLink(mistakeNote)
      }
    })
    upsertMistakeRecord(state, record)
    repaired++
  }
  saveMistakeState(state)
  persistDatabase(state.notebookId, ...Object.values(state.records).map(record => record.sourceNotebookId))
  showHUD(`整理完成：${repaired} 道已分类并修复双向链接${missing ? `，${missing} 道卡片已失效` : ""}`, 5)
}

function statsText(records: MistakeRecord[]): string {
  const counts = [0, 1, 2, 3, 4, 5].map(
    level => `${level}级 ${records.filter(record => record.level === level).length}题`
  )
  return `${counts.join(" · ")}\n到期 ${records.filter(record => isDue(record)).length}题`
}

async function reviewDueList(): Promise<void> {
  const due = dueRecords()
  if (!due.length) return showHUD("目前没有到期错题", 3)
  const result = await select(
    due.map((record, index) =>
      `${index + 1}. [${record.level}级] ${record.sourceTitle} · ${record.sourceNotebookTitle}`
    ),
    `到期错题 ${due.length} 道`,
    "选择一道题并记录本次复习结果",
    true
  )
  if (result.index < 0) return
  const record = due[result.index]
  const state = loadMistakeState()
  if (MN.currnetNotebookId === state.notebookId) {
    MN.studyController.focusNoteInMindMapById(record.mistakeNoteId)
  }
  const level = await chooseLevel(record.level)
  if (level === undefined) return
  const updated = await updateExistingRecord(record, level)
  showHUD(`复习完成；下次 ${formatTime(updated.nextReviewAt)}`, 4)
}

export async function openMistakeReviewCenter(): Promise<void> {
  const state = loadMistakeState()
  const records = Object.values(state.records).filter(record =>
    Boolean(MN.db.getNoteById(record.mistakeNoteId))
  )
  const result = await popup({
    title: "错题统计与复习",
    message: records.length
      ? `${statsText(records)}\n\n总错题脑图：${
          state.notebookId ? notebookTitle(state.notebookId) : "未绑定"
        }`
      : "还没有错题记录。",
    buttons: ["关闭", "查看到期错题"],
    canCancel: true,
    multiLine: true
  })
  if (result.buttonIndex === 1) await reviewDueList()
}

function reminderRecentlyShown(): boolean {
  try {
    const time = NSUserDefaults.standardUserDefaults().doubleForKey(LAST_REMINDER_KEY)
    return Date.now() - time < REMINDER_THROTTLE
  } catch {
    return false
  }
}

function rememberReminder(): void {
  try {
    const defaults = NSUserDefaults.standardUserDefaults()
    defaults.setDoubleForKey(Date.now(), LAST_REMINDER_KEY)
    defaults.synchronize()
  } catch {
    // Reminder throttling is optional.
  }
}

export async function checkMistakeReviewReminder(): Promise<void> {
  if (reminderRecentlyShown()) return
  const due = dueRecords()
  if (!due.length) return
  rememberReminder()
  const result = await popup({
    title: `有 ${due.length} 道错题到期`,
    message: due.slice(0, 6).map(record => `[${record.level}级] ${record.sourceTitle}`).join("\n"),
    buttons: ["稍后", "开始复习"],
    canCancel: true,
    multiLine: true
  })
  if (result.buttonIndex === 1) await reviewDueList()
}

export function scheduleMistakeReviewReminder(): void {
  void delay(5).then(() => checkMistakeReviewReminder()).catch(error => MN.error(error))
}

export function startMistakeReminderTimer(): void {
  self.mistakeReminderTimer?.invalidate?.()
  void setTimeInterval(30 * 60, () => void checkMistakeReviewReminder())
    .then(timer => {
      self.mistakeReminderTimer = timer
    })
    .catch(error => MN.error(error))
}

export function stopMistakeReminderTimer(): void {
  self.mistakeReminderTimer?.invalidate?.()
  self.mistakeReminderTimer = undefined
}
