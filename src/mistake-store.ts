import { getLocalDataByKey, setLocalDataByKey } from "marginnote"
import { MistakeRecord, mistakeCategoryPath, sourceRecordKey } from "./mistake-domain"

const STORAGE_KEY = "mn4-answer-matcher.mistakes.v1"
const BACKUP_KEY = "marginnote.extension.mn4-answer-matcher.mistakes.v1"

export interface MistakeState {
  notebookId?: string
  records: Record<string, MistakeRecord>
  sourceIndex: Record<string, string>
}

function emptyState(): MistakeState {
  return { records: {}, sourceIndex: {} }
}

function plainState(value: unknown): Partial<MistakeState> | undefined {
  try {
    if (typeof value === "string") value = JSON.parse(value)
    if (!value || typeof value !== "object") return undefined
    return JSON.parse(JSON.stringify(value)) as Partial<MistakeState>
  } catch {
    return undefined
  }
}

export function loadMistakeState(): MistakeState {
  const primary = plainState(getLocalDataByKey(STORAGE_KEY))
  let backup: Partial<MistakeState> | undefined
  try {
    backup = plainState(NSUserDefaults.standardUserDefaults().objectForKey(BACKUP_KEY))
  } catch {
    backup = undefined
  }
  const state = primary ?? backup
  if (!state) return emptyState()
  const candidates: Record<string, MistakeRecord> = {
    ...(backup?.records && typeof backup.records === "object" ? backup.records : {}),
    ...(state.records && typeof state.records === "object" ? state.records : {})
  }
  const records: Record<string, MistakeRecord> = {}
  const sourceIndex: Record<string, string> = {}
  for (const record of Object.values(candidates)) {
    if (!record?.mistakeNoteId) continue
    if (!record.categoryPath?.length) record.categoryPath = mistakeCategoryPath(record)
    records[record.mistakeNoteId] = record
    if (record.sourceNotebookId && record.sourceNoteId && record.mistakeNoteId) {
      sourceIndex[sourceRecordKey(record.sourceNotebookId, record.sourceNoteId)] = record.mistakeNoteId
    }
  }
  return {
    notebookId: typeof state.notebookId === "string"
      ? state.notebookId
      : typeof backup?.notebookId === "string" ? backup.notebookId : undefined,
    records,
    sourceIndex
  }
}

export function saveMistakeState(state: MistakeState): void {
  const serialized = JSON.stringify(state)
  // Store JSON rather than a bridged NSDictionary. Some MN4 builds expose native
  // dictionaries as immutable proxy objects, causing a later upsert to replace old keys.
  setLocalDataByKey(serialized, STORAGE_KEY)
  try {
    const defaults = NSUserDefaults.standardUserDefaults()
    defaults.setObjectForKey(serialized, BACKUP_KEY)
    defaults.synchronize()
  } catch {
    // Add-on-local storage remains the primary copy on older builds.
  }
}

export function upsertMistakeRecord(state: MistakeState, record: MistakeRecord): void {
  state.records[record.mistakeNoteId] = record
  state.sourceIndex[sourceRecordKey(record.sourceNotebookId, record.sourceNoteId)] =
    record.mistakeNoteId
}

export function recordForSource(
  state: MistakeState,
  sourceNotebookId: string,
  sourceNoteId: string
): MistakeRecord | undefined {
  const mistakeNoteId = state.sourceIndex[sourceRecordKey(sourceNotebookId, sourceNoteId)]
  return mistakeNoteId ? state.records[mistakeNoteId] : undefined
}
