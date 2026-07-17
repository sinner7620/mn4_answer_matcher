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

function applyLevelTags(node: NodeNote, level: MistakeLevel): void {
  const tags = node.tags.filter(tag => tag !== "错题" && !/^错题[0-5]级$/.test(tag))
  node.tags = [...tags, "错题", `错题${level}级`]
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
      applyLevelTags(new NodeNote(mistakeNote, loadMistakeState().notebookId), level)
      mistakeNote.appendTextComment(
        `【错题复习】${formatTime(updated.lastReviewedAt!)} · ${level}级 · 下次 ${formatTime(
          updated.nextReviewAt
        )}`
      )
    }
    if (sourceNote) applyLevelTags(new NodeNote(sourceNote, record.sourceNotebookId), level)
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
): Promise<void> {
  const mistakeNotebookId = await ensureMistakeNotebook()
  if (!mistakeNotebookId) return

  const inMistakeNotebook = mistakeNotebookId === sourceNotebookId
  if (inMistakeNotebook) {
    const record = mistakeRecordForQuestion(question, sourceNotebookId)
    if (!record) return showHUD("这张卡片没有可识别的原题来源", 4)
    const level = await chooseLevel(record.level)
    if (level === undefined) return
    const updated = await updateExistingRecord(record, level)
    return showHUD(`已记录为 ${level} 级；下次复习 ${formatTime(updated.nextReviewAt)}`, 4)
  }

  const sourceNoteId = noteId(question.note)
  if (!sourceNoteId) return showHUD("所选卡片没有 noteId，无法摘录")
  const state = loadMistakeState()
  let record = recordForSource(state, sourceNotebookId, sourceNoteId)
  if (record && !MN.db.getNoteById(record.mistakeNoteId)) record = undefined
  const clone = record ? MN.db.getNoteById(record.mistakeNoteId) :
    existingClone(sourceNoteId, mistakeNotebookId)

  const level = await chooseLevel(record?.level)
  if (level === undefined) return
  if (record) {
    const updated = await updateExistingRecord(record, level)
    return showHUD(`错题记录已更新为 ${level} 级；下次复习 ${formatTime(updated.nextReviewAt)}`, 4)
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
      answerNotebookId,
      level
    },
    mistakeNote.createDate || new Date()
  )

  undoGroupingWithRefresh(() => {
    applyLevelTags(question, level)
    applyLevelTags(new NodeNote(mistakeNote!, mistakeNotebookId), level)
    if (!mistakeNote!.linkedNotes?.some(link => String(link.noteid) === sourceNoteId)) {
      mistakeNote!.appendNoteLink(question.note)
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
}

function dueRecords(): MistakeRecord[] {
  return Object.values(loadMistakeState().records)
    .filter(record => isDue(record) && Boolean(MN.db.getNoteById(record.mistakeNoteId)))
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt))
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
