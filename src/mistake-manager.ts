import { delay, MN, NodeNote, popup, setTimeInterval, showHUD, undoGroupingWithRefresh } from "marginnote"
import type { MbBookNote } from "marginnote"
import { renderCardHtml } from "./card-html"
import { answerCardHtml } from "./matcher"
import { findAnswersForQuestion } from "./answer-lookup"
import { BindingTarget, getBindingForMode, loadBindings, targetForMode } from "./store"
import { mindMapRoot, nodeIdentifier } from "./mindmap-scope"
import { loadMatcherSettings, normalizeMistakeReviewCurves, saveMatcherSettings } from "./settings"
import {
  compareMistakeRecords,
  automaticCategoryPath,
  categoryPathPrefixes,
  createMistakeRecord,
  isDue,
  isMistakeLevel,
  LEVEL_DESCRIPTIONS,
  manualTagsOf,
  MistakeLevel,
  MistakeReviewCurves,
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
import {
  cleanMistakeTags,
  customMistakeTagsFromSource,
  mistakeSourceTags,
  mistakeStateFromSourceTags,
  withoutMistakeSourceTags
} from "./mistake-tags"

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

function answerBinding(sourceNotebookId: string, sourceRootNodeId: string): BindingTarget | undefined {
  const bindings = loadBindings()
  const scoped = loadMatcherSettings().allowSameStudySetMindMap
  const target = getBindingForMode(bindings, sourceNotebookId, sourceRootNodeId, scoped)
  return target && targetForMode(target, scoped)
}

function applySourceTags(record: MistakeRecord, previousCategories?: string[]): void {
  const note = MN.db.getNoteById(record.sourceNoteId)
  if (!note) return
  const node = new NodeNote(note, record.sourceNotebookId)
  node.tags = mistakeSourceTags(node.tags, record.level, manualTagsOf(record), previousCategories)
  node.tidyupTags()
}

function removeSourceTags(record: MistakeRecord): void {
  const note = MN.db.getNoteById(record.sourceNoteId)
  if (!note) return
  const node = new NodeNote(note, record.sourceNotebookId)
  node.tags = withoutMistakeSourceTags(node.tags, manualTagsOf(record))
  node.tidyupTags()
}

function syncManualTagsFromSource(record: MistakeRecord): MistakeRecord {
  const note = MN.db.getNoteById(record.sourceNoteId)
  if (!note) return record
  const sourceTags = customMistakeTagsFromSource(new NodeNote(note, record.sourceNotebookId).tags)
  const storedTags = manualTagsOf(record)
  if (sourceTags.length === storedTags.length && sourceTags.every((tag, index) => tag === storedTags[index])) {
    return record
  }
  return {
    ...record,
    manualCategories: sourceTags,
    manualCategory: sourceTags[0],
    updatedAt: new Date().toISOString()
  }
}

function persistSources(notebookIds: Iterable<string>): void {
  const uniqueIds = Array.from(new Set(notebookIds)).filter(Boolean)
  if (!uniqueIds.length) return
  MN.db.savedb()
  for (const notebookId of uniqueIds) MN.db.setNotebookSyncDirty(notebookId)
}

function commitSourceTagMutation(notebookIds: Iterable<string>, mutation: () => void): void {
  const uniqueIds = Array.from(new Set(notebookIds)).filter(Boolean)
  undoGroupingWithRefresh(() => {
    mutation()
    persistSources(uniqueIds)
  })
}

function refreshRecord(record: MistakeRecord): MistakeRecord {
  const note = MN.db.getNoteById(record.sourceNoteId)
  if (!note) return record
  const node = new NodeNote(note, record.sourceNotebookId)
  const root = mindMapRoot(node)
  const sourcePathTitles = pathTitles(node)
  const sourceRootNodeId = nodeIdentifier(root)
  const binding = answerBinding(record.sourceNotebookId, sourceRootNodeId)
  return {
    ...record,
    sourceNotebookTitle: notebookTitle(record.sourceNotebookId),
    sourceRootNodeId,
    sourceRootTitle: root.title?.trim() || "未命名题目脑图",
    sourceTitle: node.title?.trim() || record.sourceTitle || "未命名错题",
    sourcePathTitles,
    categoryPath: [notebookTitle(record.sourceNotebookId), ...sourcePathTitles],
    answerNotebookId: binding?.notebookId ?? record.answerNotebookId,
    answerRootNodeId: binding?.rootNodeId ?? record.answerRootNodeId
  }
}

export interface MistakeTagRecoveryResult {
  scanned: number
  found: number
  added: number
  existing: number
  failed: number
}

const FULL_TAG_RECOVERY_INTERVAL = 30 * 60 * 1000
let lastFullTagRecoveryAt = 0
let tagRecoveryQueue: Promise<void> = Promise.resolve()

async function recoverMistakesFromSourceTagsInternal(targetNotebookId?: string): Promise<MistakeTagRecoveryResult> {
  if (!targetNotebookId && Date.now() - lastFullTagRecoveryAt < FULL_TAG_RECOVERY_INTERVAL) {
    return { scanned: 0, found: 0, added: 0, existing: 0, failed: 0 }
  }

  const state = loadMistakeState()
  const curves = loadMatcherSettings().mistakeReviewCurves
  const candidates = targetNotebookId
    ? [MN.db.getNotebookById(targetNotebookId)].filter(Boolean)
    : (MN.db.allNotebooks() ?? []).filter(item => item.topicId && item.flags === 2)

  let scanned = 0
  let found = 0
  let added = 0
  let existing = 0
  let failed = 0

  for (const notebook of candidates as any[]) {
    const sourceNotebookId = String(notebook?.topicId ?? targetNotebookId ?? "").trim()
    if (!sourceNotebookId) continue
    const notes = notebook?.notes ?? []

    for (let index = 0; index < notes.length; index++) {
      const note = notes[index]
      if (!note) continue
      scanned++
      try {
        const question = new NodeNote(note, sourceNotebookId)
        const tagState = mistakeStateFromSourceTags(question.tags)
        if (!tagState.isMistake) continue
        found++

        const sourceNoteId = noteId(note)
        if (!sourceNoteId) continue
        const recordId = sourceRecordKey(sourceNotebookId, sourceNoteId)
        if (state.records[recordId]) {
          existing++
          continue
        }

        const sourceRoot = mindMapRoot(question)
        const sourceRootNodeId = nodeIdentifier(sourceRoot)
        const binding = answerBinding(sourceNotebookId, sourceRootNodeId)
        const sourcePathTitles = pathTitles(question)
        const manualCategories = tagState.customTags
        const sourceNotebookTitle = notebook.title?.trim() || notebookTitle(sourceNotebookId)
        const record = createMistakeRecord({
          sourceNoteId,
          sourceNotebookId,
          sourceNotebookTitle,
          sourceRootNodeId,
          sourceRootTitle: sourceRoot.title?.trim() || "未命名题目脑图",
          sourceTitle: question.title?.trim() || "未命名错题",
          sourcePathTitles,
          categoryPath: [sourceNotebookTitle, ...sourcePathTitles],
          manualCategories,
          manualCategory: manualCategories[0],
          answerNotebookId: binding?.notebookId,
          answerRootNodeId: binding?.rootNodeId,
          level: tagState.level ?? 0
        }, new Date(), curves)
        upsertMistakeRecord(state, record)
        added++
      } catch (error) {
        failed++
        MN.error(error)
      }

      if (index % 80 === 79) await delay(0.01)
    }
  }

  if (added) saveMistakeState(state)
  if (!targetNotebookId) lastFullTagRecoveryAt = Date.now()
  return { scanned, found, added, existing, failed }
}

/**
 * 从 MarginNote 已同步的卡片标签重建缺失的错题记录。
 * 只补充不存在的记录，不删除或覆盖已有复习历史。
 */
export function recoverMistakesFromSourceTags(targetNotebookId?: string): Promise<MistakeTagRecoveryResult> {
  const task = tagRecoveryQueue.then(() => recoverMistakesFromSourceTagsInternal(targetNotebookId))
  tagRecoveryQueue = task.then(() => undefined, () => undefined)
  return task
}

export function scheduleMistakeTagRecovery(targetNotebookId?: string): void {
  const wait = targetNotebookId ? 1 : 3
  void delay(wait)
    .then(() => recoverMistakesFromSourceTags(targetNotebookId))
    .then(result => {
      if (result.added > 0) showHUD(`已从 MarginNote 标签恢复 ${result.added} 道错题`, 4)
    })
    .catch(error => MN.error(error))
}
function recordById(recordId: string): MistakeRecord {
  const record = loadMistakeState().records[recordId]
  if (!record) throw new Error("错题记录不存在")
  return record
}

export async function markQuestionAsMistake(
  question: NodeNote,
  sourceNotebookId: string,
  requestedLevel?: MistakeLevel
): Promise<MistakeRecord | undefined> {
  const sourceNoteId = noteId(question.note)
  if (!sourceNoteId) throw new Error("所选卡片没有 noteId，无法标记")
  const state = loadMistakeState()
  const previous = recordForSource(state, sourceNotebookId, sourceNoteId)
  const now = new Date()
  const sourceRoot = mindMapRoot(question)
  const sourceRootNodeId = nodeIdentifier(sourceRoot)
  const binding = answerBinding(sourceNotebookId, sourceRootNodeId)
  const metadata = {
    sourceNoteId,
    sourceNotebookId,
    sourceNotebookTitle: notebookTitle(sourceNotebookId),
    sourceRootNodeId,
    sourceRootTitle: sourceRoot.title?.trim() || "未命名题目脑图",
    sourceTitle: question.title?.trim() || "未命名错题",
    sourcePathTitles: pathTitles(question),
    categoryPath: [notebookTitle(sourceNotebookId), ...pathTitles(question)],
    answerNotebookId: binding?.notebookId,
    answerRootNodeId: binding?.rootNodeId,
    level: requestedLevel ?? previous?.level ?? 0 as MistakeLevel
  }
  const record = previous
    ? { ...previous, ...metadata, updatedAt: now.toISOString() }
    : createMistakeRecord(metadata, now, loadMatcherSettings().mistakeReviewCurves)
  upsertMistakeRecord(state, record)
  saveMistakeState(state)
  commitSourceTagMutation([sourceNotebookId], () => applySourceTags(record, manualTagsOf(previous)))

  showHUD(previous ? "该题已在错题库中，记录已刷新" : "已标记为错题，可在错题浏览窗口中查看", 4)
  return record
}

export interface BatchMistakeResult {
  added: number
  updated: number
  failed: number
  records: MistakeRecord[]
}

/**
 * Mark the current mind-map selection as mistakes in one database transaction.
 * Existing records are refreshed without losing their review history.
 */
export async function markQuestionsAsMistakes(
  questions: NodeNote[],
  sourceNotebookId: string,
  requestedLevel: MistakeLevel
): Promise<BatchMistakeResult> {
  const state = loadMistakeState()
  const curves = loadMatcherSettings().mistakeReviewCurves
  const seen = new Set<string>()
  const prepared: Array<{
    record: MistakeRecord
    previous?: MistakeRecord
  }> = []
  let failed = 0

  for (const question of questions) {
    try {
      const sourceNoteId = noteId(question.note)
      if (!sourceNoteId) throw new Error("所选卡片没有 noteId，无法标记")
      if (seen.has(sourceNoteId)) continue
      seen.add(sourceNoteId)

      const previous = recordForSource(state, sourceNotebookId, sourceNoteId)
      const now = new Date()
      const sourceRoot = mindMapRoot(question)
      const sourceRootNodeId = nodeIdentifier(sourceRoot)
      const binding = answerBinding(sourceNotebookId, sourceRootNodeId)
      const metadata = {
        sourceNoteId,
        sourceNotebookId,
        sourceNotebookTitle: notebookTitle(sourceNotebookId),
        sourceRootNodeId,
        sourceRootTitle: sourceRoot.title?.trim() || "未命名题目脑图",
        sourceTitle: question.title?.trim() || "未命名错题",
        sourcePathTitles: pathTitles(question),
        categoryPath: [notebookTitle(sourceNotebookId), ...pathTitles(question)],
        answerNotebookId: binding?.notebookId,
        answerRootNodeId: binding?.rootNodeId,
        level: requestedLevel
      }
      const record = previous
        ? { ...previous, ...metadata, updatedAt: now.toISOString() }
        : createMistakeRecord(metadata, now, curves)
      upsertMistakeRecord(state, record)
      prepared.push({ record, previous })
    } catch (error) {
      failed++
      MN.error(error)
    }
  }

  if (prepared.length) {
    saveMistakeState(state)
    commitSourceTagMutation([sourceNotebookId], () => {
      for (const { record, previous } of prepared) {
        try {
          applySourceTags(record, manualTagsOf(previous))
        } catch (error) {
          MN.error(error)
        }
      }
    })
  }

  return {
    added: prepared.filter(item => !item.previous).length,
    updated: prepared.filter(item => Boolean(item.previous)).length,
    failed,
    records: prepared.map(item => item.record)
  }
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
  if (!isMistakeLevel(Number(level))) throw new Error("错题分类必须为错题0级至错题5级")
  const state = loadMistakeState()
  const previous = state.records[recordId]
  if (!previous) throw new Error("错题记录不存在")
  const record = reviewMistake(
    previous,
    Number(level) as MistakeLevel,
    new Date(),
    loadMatcherSettings().mistakeReviewCurves
  )
  upsertMistakeRecord(state, record)
  saveMistakeState(state)
  commitSourceTagMutation([record.sourceNotebookId], () => applySourceTags(record))
  return record
}

export interface BatchMistakeChangeResult {
  changed: number
  missing: number
  records: MistakeRecord[]
}

function uniqueRecordIds(recordIds: unknown): string[] {
  if (!Array.isArray(recordIds)) return []
  return Array.from(new Set(recordIds.map(String).map(id => id.trim()).filter(Boolean)))
}

export async function reviewMistakesByIds(
  recordIds: unknown,
  level: MistakeLevel
): Promise<BatchMistakeChangeResult> {
  if (!isMistakeLevel(Number(level))) throw new Error("错题分类必须为错题0级至错题5级")
  const ids = uniqueRecordIds(recordIds)
  if (!ids.length) throw new Error("请至少选择一道错题")
  const state = loadMistakeState()
  const curves = loadMatcherSettings().mistakeReviewCurves
  const now = new Date()
  const records: MistakeRecord[] = []
  let missing = 0

  for (const recordId of ids) {
    const previous = state.records[recordId]
    if (!previous) {
      missing++
      continue
    }
    const record = reviewMistake(previous, Number(level) as MistakeLevel, now, curves)
    upsertMistakeRecord(state, record)
    records.push(record)
  }

  if (records.length) {
    saveMistakeState(state)
    undoGroupingWithRefresh(() => {
      for (const record of records) {
        try {
          applySourceTags(record)
        } catch (error) {
          MN.error(error)
        }
      }
      persistSources(records.map(record => record.sourceNotebookId))
    })
  }
  return { changed: records.length, missing, records }
}

export async function setMistakeCategoryById(recordId: string, categories: string | string[]): Promise<MistakeRecord> {
  const state = loadMistakeState()
  const previous = state.records[recordId]
  if (!previous) throw new Error("错题记录不存在")
  const manualCategories = cleanMistakeTags(categories)
  const record = {
    ...previous,
    manualCategories,
    manualCategory: manualCategories[0],
    updatedAt: new Date().toISOString()
  }
  upsertMistakeRecord(state, record)
  saveMistakeState(state)
  const previousTags = manualTagsOf(previous)
  if (manualCategories.length || previousTags.length) {
    const settings = loadMatcherSettings()
    saveMatcherSettings({
      mistakeCustomCategories: Array.from(new Set([
        ...settings.mistakeCustomCategories,
        ...previousTags,
        ...manualCategories
      ]))
    })
  }
  commitSourceTagMutation([record.sourceNotebookId], () => applySourceTags(record, previousTags))
  return record
}

export async function deleteMistakeTag(tagValue: string): Promise<{ tag: string; changed: number }> {
  const tag = cleanMistakeTags(tagValue)[0]
  if (!tag) throw new Error("标签不能为空")

  const state = loadMistakeState()
  const changedRecords: Array<{ previousTags: string[]; record: MistakeRecord }> = []
  const now = new Date().toISOString()

  for (const previous of Object.values(state.records)) {
    const previousTags = manualTagsOf(previous)
    if (!previousTags.includes(tag)) continue
    const manualCategories = previousTags.filter(item => item !== tag)
    const record: MistakeRecord = {
      ...previous,
      manualCategories,
      manualCategory: manualCategories[0],
      updatedAt: now
    }
    upsertMistakeRecord(state, record)
    changedRecords.push({ previousTags, record })
  }

  if (changedRecords.length) saveMistakeState(state)

  const settings = loadMatcherSettings()
  saveMatcherSettings({
    mistakeCustomCategories: settings.mistakeCustomCategories.filter(item => item !== tag)
  })

  if (changedRecords.length) {
    commitSourceTagMutation(changedRecords.map(item => item.record.sourceNotebookId), () => {
      for (const { previousTags, record } of changedRecords) {
        try {
          applySourceTags(record, previousTags)
        } catch (error) {
          MN.error(error)
        }
      }
    })
  }

  return { tag, changed: changedRecords.length }
}

export async function removeMistakeById(recordId: string): Promise<void> {
  const state = loadMistakeState()
  const record = state.records[recordId]
  if (!record) return
  removeMistakeRecord(state, recordId)
  saveMistakeState(state)
  try {
    commitSourceTagMutation([record.sourceNotebookId], () => removeSourceTags(record))
  } catch (error) {
    // The mistake record is authoritative. A stale source tag must not make
    // cancellation appear to fail or restore the removed record in the UI.
    MN.error(error)
  }
}

export interface MistakeWorkbenchRecord extends MistakeRecord {
  noteAvailable: boolean
  categoryLabel: string
  categoryKeys: string[]
}

export interface MistakeWorkbenchData {
  records: MistakeWorkbenchRecord[]
  dueCount: number
  levelCounts: number[]
  categories: Array<{ key: string; name: string; depth: number; count: number }>
  migratedFromLegacy: number
  reviewCurves: MistakeReviewCurves
  customCategories: string[]
}

export function mistakeWorkbenchData(): MistakeWorkbenchData {
  const state = loadMistakeState()
  const matcherSettings = loadMatcherSettings()
  let migratedFromLegacy = 0
  const records = Object.values(state.records).map(stored => {
    if (stored.legacyMistakeNoteId) migratedFromLegacy++
    const synced = syncManualTagsFromSource(stored)
    const automaticOptions = categoryPathPrefixes(automaticCategoryPath(synced))
    const manualOptions = manualTagsOf(synced).map(tag => ({
      key: `manual:${tag}`,
      label: `自定义 › ${tag}`,
      depth: 0
    }))
    return {
      ...synced,
      noteAvailable: Boolean(MN.db.getNoteById(stored.sourceNoteId)),
      categoryLabel: mistakeCategoryLabel(synced),
      categoryKeys: [...automaticOptions, ...manualOptions].map(option => option.key)
    }
  }).sort(compareMistakeRecords)
  const categoryCounts = new Map<string, { key: string; name: string; depth: number; count: number }>()
  for (const record of records) {
    const options = [
      ...categoryPathPrefixes(automaticCategoryPath(record)),
      ...manualTagsOf(record).map(tag => ({
        key: `manual:${tag}`,
        label: `自定义 › ${tag}`,
        depth: 0
      }))
    ]
    for (const option of options) {
      const previous = categoryCounts.get(option.key)
      categoryCounts.set(option.key, {
        key: option.key,
        name: option.label,
        depth: option.depth,
        count: (previous?.count ?? 0) + 1
      })
    }
  }
  const savedCategories = matcherSettings.mistakeCustomCategories
  const customCategories = Array.from(new Set([
    ...savedCategories,
    ...records.flatMap(record => manualTagsOf(record))
  ])).sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }))
  if (JSON.stringify(customCategories) !== JSON.stringify(savedCategories)) {
    saveMatcherSettings({ mistakeCustomCategories: customCategories })
  }
  return {
    records,
    dueCount: records.filter(record => record.noteAvailable && isDue(record)).length,
    levelCounts: [0, 1, 2, 3, 4, 5].map(level => records.filter(record => record.level === level).length),
    categories: [...categoryCounts.values()],
    migratedFromLegacy,
    reviewCurves: matcherSettings.mistakeReviewCurves,
    customCategories
  }
}

export async function removeMistakesByIds(recordIds: unknown): Promise<BatchMistakeChangeResult> {
  const ids = uniqueRecordIds(recordIds)
  if (!ids.length) throw new Error("请至少选择一道错题")
  const state = loadMistakeState()
  const records: MistakeRecord[] = []
  let missing = 0

  for (const recordId of ids) {
    const record = state.records[recordId]
    if (!record) {
      missing++
      continue
    }
    removeMistakeRecord(state, recordId)
    records.push(record)
  }

  if (records.length) {
    saveMistakeState(state)
    undoGroupingWithRefresh(() => {
      for (const record of records) {
        try {
          removeSourceTags(record)
        } catch (error) {
          MN.error(error)
        }
      }
      persistSources(records.map(record => record.sourceNotebookId))
    })
  }
  return { changed: records.length, missing, records }
}

export function saveMistakeReviewCurves(value: unknown): MistakeReviewCurves {
  const curves = normalizeMistakeReviewCurves(value)
  saveMatcherSettings({ mistakeReviewCurves: curves })
  showHUD("已保存错题复习天数；将在新标记或完成复习后生效", 4)
  return curves
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
  const record = syncManualTagsFromSource(refreshRecord(recordById(recordId)))
  const note = MN.db.getNoteById(record.sourceNoteId)
  if (!note) throw new Error("原题卡片不存在或尚未同步")
  const node = new NodeNote(note, record.sourceNotebookId)
  const binding = answerBinding(record.sourceNotebookId, nodeIdentifier(mindMapRoot(node)))
  const answerTarget = binding ?? (record.answerNotebookId
    ? { notebookId: record.answerNotebookId, rootNodeId: record.answerRootNodeId }
    : undefined)
  let answerStatus: MistakeDetailData["answerStatus"] = answerTarget ? "not-found" : "unbound"
  let answers: MistakeDetailData["answers"] = []
  if (answerTarget) {
    try {
      const titles = Array.from(new Set([record.sourceTitle, ...node.titles.map(title => title.trim())])).filter(Boolean)
      const matches = findAnswersForQuestion(answerTarget, node, titles, pathTitles(node))
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
    record: {
      ...record,
      noteAvailable: true,
      categoryLabel: mistakeCategoryLabel(record),
      categoryKeys: [
        ...categoryPathPrefixes(automaticCategoryPath(record)).map(option => option.key),
        ...manualTagsOf(record).map(tag => `manual:${tag}`)
      ]
    },
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
    message: `共 ${data.records.length} 道 · 到期 ${data.dueCount} 道\n${data.levelCounts.map((count, level) => `错题${level}级 ${count}`).join(" · ")}`,
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
