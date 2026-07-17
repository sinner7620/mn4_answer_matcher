import { getLocalDataByKey, setLocalDataByKey } from "marginnote"
import { MistakeRecord, sourceRecordKey } from "./mistake-domain"

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

export function loadMistakeState(): MistakeState {
  let value = getLocalDataByKey(STORAGE_KEY)
  if (!value || typeof value !== "object") {
    try {
      value = NSUserDefaults.standardUserDefaults().objectForKey(BACKUP_KEY)
      if (typeof value === "string") value = JSON.parse(value)
      if (value && typeof value === "object") setLocalDataByKey(value, STORAGE_KEY)
    } catch {
      value = undefined
    }
  }
  if (!value || typeof value !== "object") return emptyState()
  const state = value as Partial<MistakeState>
  return {
    notebookId: typeof state.notebookId === "string" ? state.notebookId : undefined,
    records: state.records && typeof state.records === "object" ? state.records : {},
    sourceIndex: state.sourceIndex && typeof state.sourceIndex === "object"
      ? state.sourceIndex
      : {}
  }
}

export function saveMistakeState(state: MistakeState): void {
  setLocalDataByKey(state, STORAGE_KEY)
  try {
    const defaults = NSUserDefaults.standardUserDefaults()
    defaults.setObjectForKey(JSON.stringify(state), BACKUP_KEY)
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
