import { getLocalDataByKey, setLocalDataByKey } from "marginnote"
import { MistakeRecord, sourceRecordKey } from "./mistake-domain"

const STORAGE_KEY = "mn4-answer-matcher.mistakes.v2"
const BACKUP_KEY = "marginnote.extension.mn4-answer-matcher.mistakes.v2"
const LEGACY_STORAGE_KEY = "mn4-answer-matcher.mistakes.v1"
const LEGACY_BACKUP_KEY = "marginnote.extension.mn4-answer-matcher.mistakes.v1"

export interface MistakeState {
  version: 2
  records: Record<string, MistakeRecord>
}

function emptyState(): MistakeState {
  return { version: 2, records: {} }
}

function plainObject(value: unknown): any {
  try {
    if (typeof value === "string") value = JSON.parse(value)
    return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : undefined
  } catch {
    return undefined
  }
}

function backupValue(key: string): unknown {
  try {
    return NSUserDefaults.standardUserDefaults().objectForKey(key)
  } catch {
    return undefined
  }
}

function normalizeRecord(value: any): MistakeRecord | undefined {
  if (!value?.sourceNotebookId || !value?.sourceNoteId) return
  const recordId = sourceRecordKey(String(value.sourceNotebookId), String(value.sourceNoteId))
  const createdAt = String(value.createdAt || new Date().toISOString())
  return {
    ...value,
    recordId,
    sourceNotebookId: String(value.sourceNotebookId),
    sourceNoteId: String(value.sourceNoteId),
    sourceNotebookTitle: String(value.sourceNotebookTitle || "未命名脑图"),
    sourceRootNodeId: value.sourceRootNodeId ? String(value.sourceRootNodeId) : undefined,
    sourceRootTitle: value.sourceRootTitle ? String(value.sourceRootTitle) : undefined,
    sourceTitle: String(value.sourceTitle || "未命名错题"),
    sourcePathTitles: Array.isArray(value.sourcePathTitles) ? value.sourcePathTitles.map(String) : [],
    categoryPath: Array.isArray(value.categoryPath) && value.categoryPath.length
      ? value.categoryPath.map(String)
      : [String(value.sourceNotebookTitle || "未命名脑图"), ...(value.sourcePathTitles || []).map(String)],
    level: Number.isInteger(value.level) && value.level >= 0 && value.level <= 5 ? value.level : 0,
    createdAt,
    updatedAt: String(value.updatedAt || value.lastReviewedAt || createdAt),
    nextReviewAt: String(value.nextReviewAt || createdAt),
    reviewCount: Number(value.reviewCount) || 0,
    history: Array.isArray(value.history) ? value.history : [],
    legacyMistakeNoteId: value.legacyMistakeNoteId || value.mistakeNoteId || undefined
  } as MistakeRecord
}

function stateFrom(value: unknown): MistakeState | undefined {
  const source = plainObject(value)
  if (!source?.records || typeof source.records !== "object") return
  const records: Record<string, MistakeRecord> = {}
  for (const candidate of Object.values(source.records)) {
    const record = normalizeRecord(candidate)
    if (record) records[record.recordId] = record
  }
  return { version: 2, records }
}

export function loadMistakeState(): MistakeState {
  const primary = stateFrom(getLocalDataByKey(STORAGE_KEY))
  const backup = stateFrom(backupValue(BACKUP_KEY))
  const currentSources = [backup, primary].filter(Boolean) as MistakeState[]
  if (!currentSources.length) {
    const legacy = stateFrom(getLocalDataByKey(LEGACY_STORAGE_KEY)) ??
      stateFrom(backupValue(LEGACY_BACKUP_KEY))
    if (!legacy) return emptyState()
    // Persist migration immediately so removing a record later cannot resurrect it
    // from the read-only v1 store on the next load.
    saveMistakeState(legacy)
    return legacy
  }
  const records: Record<string, MistakeRecord> = {}
  for (const source of currentSources) Object.assign(records, source.records)
  return { version: 2, records }
}

export function saveMistakeState(state: MistakeState): void {
  const serialized = JSON.stringify({ version: 2, records: state.records })
  setLocalDataByKey(serialized, STORAGE_KEY)
  try {
    const defaults = NSUserDefaults.standardUserDefaults()
    defaults.setObjectForKey(serialized, BACKUP_KEY)
    defaults.synchronize()
  } catch {
    // Add-on-local storage remains available on older MN4 builds.
  }
}

export function upsertMistakeRecord(state: MistakeState, record: MistakeRecord): void {
  state.records[record.recordId] = record
}

export function removeMistakeRecord(state: MistakeState, recordId: string): void {
  delete state.records[recordId]
}

export function recordForSource(state: MistakeState, notebookId: string, noteId: string): MistakeRecord | undefined {
  return state.records[sourceRecordKey(notebookId, noteId)]
}
