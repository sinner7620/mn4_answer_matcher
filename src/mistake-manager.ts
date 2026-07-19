import { delay, MN, NodeNote, popup, setTimeInterval, showHUD, undoGroupingWithRefresh } from "marginnote"
import type { MbBookNote } from "marginnote"
import { renderCardHtml } from "./card-html"
import { answerCardHtml, findAnswers } from "./matcher"
import { loadBindings } from "./store"
import {
  compareMistakeRecords,
  createMistakeRecord,
  isDue,
  isMistakeLevel,
  LEVEL_DESCRIPTIONS,
  MistakeLevel,
  MistakeRecord,
  mistakeCategoryLabel,
  reviewMistake,
  sourceRecordKey
} from "./mistake-domain"
import {
  loadMistakeState,
  recordForSource,
  removeMistakeRecord,
  saveMistakeState,
  upsertMistakeRecord
} from "./mistake-store"
import { openNoteInMindMap } from "./note-navigation"

const LAST_REMINDER_KEY = "marginnote.extension.mn4-answer-matcher.mistake-reminder.v2"
const REMINDER_THROTTLE = 6 * 60 * 60 * 1000

function noteId(note: MbBookNote | any): string {
  return String(note?.noteId ?? note?.noteid ?? note?.id ?? note?.note?.noteId ?? "").trim()
}

function notebookTitle(notebookId: string): string {
  return MN.db.getNotebookById(notebookId)?.title?.trim() || "未命名脑图"
}

function pathTitles(question: NodeNote): string[] {
  try {
    return question.ancestorNodes.map(node => node.title?.trim()).filter(Boolean) as string[]
  } catch {
    return []
  }
}

function cleanTag(value: string): string {
  return String(value ?? "").replace(/[\n\r#]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40)
}

function applySourceTags(record: MistakeRecord): void {
  const note = MN.db.getNoteById(record.sourceNoteId)
  if (!note) return
  const node = new NodeNote(note, record.sourceNotebookId)
  const tags = node.tags.filter(tag =>
    tag !== "错题" && !/^错题[0-5]级$/.test(tag) && !/^错题分类·/.test(tag)
  )
  const category = cleanTag(record.manualCategory ?? "")
  node.tags = [
    ...tags,
    "错题",
    `错题${record.level}级`,
    ...(category ? [`错题分类·${category}`] : [])
  ]
  node.tidyupTags()
}

function removeSourceTags(record: MistakeRecord): void {
  const note = MN.db.getNoteById(record.sourceNoteId)
  if (!note) return
  const node = new NodeNote(note, record.sourceNotebookId)
  node.tags = node.tags.filter(tag =>
    tag !== "错题" && !/^错题[0-5]级$/.test(tag) && !/^错题分类·/.test(tag)
  )
  node.tidyupTags()
}

function persistSource(notebookId: string): void {
  MN.db.savedb()
  MN.db.setNotebookSyncDirty(notebookId)
}

function refreshRecord(record: MistakeRecord): MistakeRecord {
  const note = MN.db.getNoteById(record.sourceNoteId)
  if (!note) return record
  const node = new NodeNote(note, record.sourceNotebookId)
  const sourcePathTitles = pathTitles(node)
  return {
    ...record,
    sourceNotebookTitle: notebookTitle(record.sourceNotebookId),
    sourceTitle: node.title?.trim() || record.sourceTitle || "未命名错题",
    sourcePathTitles,
    categoryPath: [notebookTitle(record.sourceNotebookId), ...sourcePathTitles],
    answerNotebookId: loadBindings()[record.sourceNotebookId] ?? record.answerNotebookId
  }
}

function recordById(recordId: string): MistakeRecord {
  const record = loadMistakeState().records[recordId]
  if (!record) throw new Error("错题记录不存在")
  return record
}

export async function markQuestionAsMistake(
  question: NodeNote,
  sourceNotebookId: string
): Promise<MistakeRecord | undefined> {
  const sourceNoteId = noteId(question.note)
  if (!sourceNoteId) throw new Error("所选卡片没有 noteId，无法标记")
  const state = loadMistakeState()
  const previous = recordForSource(state, sourceNotebookId, sourceNoteId)
  const now = new Date()
  const metadata = {
    sourceNoteId,
    sourceNotebookId,
    sourceNotebookTitle: notebookTitle(sourceNotebookId),
    sourceTitle: question.title?.trim() || "未命名错题",
    sourcePathTitles: pathTitles(question),
    categoryPath: [notebookTitle(sourceNotebookId), ...pathTitles(question)],
    answerNotebookId: loadBindings()[sourceNotebookId],
    level: previous?.level ?? 0 as MistakeLevel
  }
  const record = previous
    ? { ...previous, ...metadata, updatedAt: now.toISOString() }
    : createMistakeRecord(metadata, now)
  upsertMistakeRecord(state, record)
  saveMistakeState(state)
  undoGroupingWithRefresh(() => applySourceTags(record))
  persistSource(sourceNotebookId)
  showHUD(previous ? "该题已在错题库中，记录已刷新" : "已标记为错题，可在错题浏览窗口中查看", 4)
  return record
}

export function mistakeRecordForSourceQuestion(
  question: NodeNote,
  currentNotebookId: string
): MistakeRecord | undefined {
  return recordForSource(loadMistakeState(), currentNotebookId, noteId(question.note))
}

export function mistakeRecordForQuestion(
  question: NodeNote,
  currentNotebookId: string
): MistakeRecord | undefined {
  return mistakeRecordForSourceQuestion(question, currentNotebookId)
}

export interface MistakeAnswerContext {
  record: MistakeRecord
  sourceQuestion?: NodeNote
}

export function mistakeAnswerContext(
  question: NodeNote,
  currentNotebookId: string
): MistakeAnswerContext | undefined {
  const record = mistakeRecordForSourceQuestion(question, currentNotebookId)
  if (!record) return
  const source = MN.db.getNoteById(record.sourceNoteId)
  return { record, sourceQuestion: source ? new NodeNote(source, record.sourceNotebookId) : undefined }
}

export async function reviewMistakeById(recordId: string, level: MistakeLevel): Promise<MistakeRecord> {
  if (!isMistakeLevel(Number(level))) throw new Error("错题等级必须为 0–5")
  const state = loadMistakeState()
  const previous = state.records[recordId]
  if (!previous) throw new Error("错题记录不存在")
  const record = reviewMistake(refreshRecord(previous), Number(level) as MistakeLevel)
  upsertMistakeRecord(state, record)
  saveMistakeState(state)
  undoGroupingWithRefresh(() => applySourceTags(record))
  persistSource(record.sourceNotebookId)
  return record
}

export async function setMistakeCategoryById(recordId: string, category: string): Promise<MistakeRecord> {
  const state = loadMistakeState()
  const previous = state.records[recordId]
  if (!previous) throw new Error("错题记录不存在")
  const record = {
    ...refreshRecord(previous),
    manualCategory: String(category ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || undefined,
    updatedAt: new Date().toISOString()
  }
  upsertMistakeRecord(state, record)
  saveMistakeState(state)
  undoGroupingWithRefresh(() => applySourceTags(record))
  persistSource(record.sourceNotebookId)
  return record
}

export async function removeMistakeById(recordId: string): Promise<void> {
  const state = loadMistakeState()
  const record = state.records[recordId]
  if (!record) return
  removeMistakeRecord(state, recordId)
  saveMistakeState(state)
  undoGroupingWithRefresh(() => removeSourceTags(record))
  persistSource(record.sourceNotebookId)
}

export interface MistakeWorkbenchRecord extends MistakeRecord {
  noteAvailable: boolean
  categoryLabel: string
}

export interface MistakeWorkbenchData {
  records: MistakeWorkbenchRecord[]
  dueCount: number
  levelCounts: number[]
  categories: Array<{ name: string; count: number }>
  migratedFromLegacy: number
}

export function mistakeWorkbenchData(): MistakeWorkbenchData {
  const state = loadMistakeState()
  let changed = false
  let migratedFromLegacy = 0
  const records = Object.values(state.records).map(stored => {
    const current = refreshRecord(stored)
    if (current.legacyMistakeNoteId) migratedFromLegacy++
    if (JSON.stringify(current) !== JSON.stringify(stored)) {
      state.records[current.recordId] = current
      changed = true
    }
    return {
      ...current,
      noteAvailable: Boolean(MN.db.getNoteById(current.sourceNoteId)),
      categoryLabel: mistakeCategoryLabel(current)
    }
  }).sort(compareMistakeRecords)
  if (changed) saveMistakeState(state)
  const categoryCounts = new Map<string, number>()
  for (const record of records) {
    categoryCounts.set(record.categoryLabel, (categoryCounts.get(record.categoryLabel) ?? 0) + 1)
  }
  return {
    records,
    dueCount: records.filter(record => record.noteAvailable && isDue(record)).length,
    levelCounts: [0, 1, 2, 3, 4, 5].map(level => records.filter(record => record.level === level).length),
    categories: [...categoryCounts].map(([name, count]) => ({ name, count })),
    migratedFromLegacy
  }
}

function media(hash: string): string | undefined {
  try {
    const value = MN.db.getMediaByHash(hash)?.base64Encoding()
    return value ? String(value) : undefined
  } catch {
    return undefined
  }
}

function questionHtml(record: MistakeRecord): string {
  const note = MN.db.getNoteById(record.sourceNoteId)
  if (!note) throw new Error("原题卡片不存在或尚未同步")
  return renderCardHtml(note, "错题原题", id => MN.db.getNoteById(id), media, media)
}

export interface MistakeDetailData {
  record: MistakeWorkbenchRecord
  questionHtml: string
  answers: Array<{ id: string; title: string; path: string; html: string }>
  answerStatus: "ready" | "unbound" | "not-found" | "index-missing"
}

export function mistakeDetailById(recordId: string): MistakeDetailData {
  const record = refreshRecord(recordById(recordId))
  const note = MN.db.getNoteById(record.sourceNoteId)
  if (!note) throw new Error("原题卡片不存在或尚未同步")
  const node = new NodeNote(note, record.sourceNotebookId)
  const answerNotebookId = loadBindings()[record.sourceNotebookId] ?? record.answerNotebookId
  let answerStatus: MistakeDetailData["answerStatus"] = answerNotebookId ? "not-found" : "unbound"
  let answers: MistakeDetailData["answers"] = []
  if (answerNotebookId) {
    try {
      const titles = Array.from(new Set([record.sourceTitle, ...node.titles.map(title => title.trim())])).filter(Boolean)
      const matches = findAnswers(answerNotebookId, titles, pathTitles(node))
      answers = matches.map(answer => ({
        id: answer.noteId,
        title: answer.titles[0] || "答案卡片",
        path: answer.pathTitles.filter(Boolean).join(" › "),
        html: answerCardHtml(answer, record.sourceTitle)
      }))
      answerStatus = answers.length ? "ready" : "not-found"
    } catch (error) {
      answerStatus = String(error).includes("索引") ? "index-missing" : "not-found"
    }
  }
  return {
    record: { ...record, noteAvailable: true, categoryLabel: mistakeCategoryLabel(record) },
    questionHtml: questionHtml(record),
    answers,
    answerStatus
  }
}

export async function openSourceByMistakeId(recordId: string): Promise<void> {
  const record = recordById(recordId)
  await openNoteInMindMap(record.sourceNoteId, record.sourceNotebookId)
}

export async function openMistakeById(recordId: string): Promise<void> {
  return openSourceByMistakeId(recordId)
}

export async function openMistakeRecord(record: MistakeRecord): Promise<void> {
  await openNoteInMindMap(record.sourceNoteId, record.sourceNotebookId)
}

export async function openLinkedMistakeOrSource(question: NodeNote, currentNotebookId: string): Promise<void> {
  const record = mistakeRecordForSourceQuestion(question, currentNotebookId)
  if (!record) return showHUD("该卡片尚未标记为错题", 3)
  await openMistakeRecord(record)
}

export async function repairAndOrganizeMistakes(): Promise<void> {
  const state = loadMistakeState()
  let available = 0
  let missing = 0
  for (const stored of Object.values(state.records)) {
    const record = refreshRecord(stored)
    if (MN.db.getNoteById(record.sourceNoteId)) {
      available++
      undoGroupingWithRefresh(() => applySourceTags(record))
      state.records[record.recordId] = record
    } else missing++
  }
  saveMistakeState(state)
  MN.db.savedb()
  showHUD(`错题索引已整理：${available} 道有效，${missing} 道原卡片暂不可用`, 5)
}

export async function bindMistakeNotebook(): Promise<string | undefined> {
  showHUD("新版使用虚拟错题库，不再需要绑定或复制到总错题脑图", 5)
  return undefined
}

export async function openMistakeDirectory(): Promise<void> {
  showHUD("请打开插件窗口，在“错题浏览”中按分类查找", 4)
}

export async function openMistakeReviewCenter(): Promise<void> {
  const data = mistakeWorkbenchData()
  await popup({
    title: "错题统计",
    message: `共 ${data.records.length} 道 · 到期 ${data.dueCount} 道\n${data.levelCounts.map((count, level) => `${level}级 ${count}`).join(" · ")}`,
    buttons: ["关闭"],
    canCancel: true,
    multiLine: true
  })
}

function dueRecords(): MistakeRecord[] {
  return mistakeWorkbenchData().records.filter(record => record.noteAvailable && isDue(record))
}

function reminderRecentlyShown(): boolean {
  try {
    return Date.now() - NSUserDefaults.standardUserDefaults().doubleForKey(LAST_REMINDER_KEY) < REMINDER_THROTTLE
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
    // Optional throttle only.
  }
}

export async function checkMistakeReviewReminder(): Promise<void> {
  if (reminderRecentlyShown()) return
  const due = dueRecords()
  if (!due.length) return
  rememberReminder()
  showHUD(`有 ${due.length} 道错题到期，请在错题浏览窗口中复习`, 5)
}

export function scheduleMistakeReviewReminder(): void {
  void delay(5).then(checkMistakeReviewReminder).catch(error => MN.error(error))
}

export function startMistakeReminderTimer(): void {
  self.mistakeReminderTimer?.invalidate?.()
  void setTimeInterval(30 * 60, () => void checkMistakeReviewReminder())
    .then(timer => { self.mistakeReminderTimer = timer })
    .catch(error => MN.error(error))
}

export function stopMistakeReminderTimer(): void {
  self.mistakeReminderTimer?.invalidate?.()
  self.mistakeReminderTimer = undefined
}

export function mistakeRecordId(notebookId: string, sourceNoteId: string): string {
  return sourceRecordKey(notebookId, sourceNoteId)
}
