import { delay, MN, openURL } from "marginnote"
import { noteReferenceUrl } from "./note-link"

const NAVIGATION_RETRY_INTERVAL = 0.25
const NAVIGATION_RETRY_ATTEMPTS = 60

function focusPendingNote(noteId: string): boolean {
  try {
    MN.studyController.focusNoteInMindMapById(noteId)
    self.pendingMistakeNavigation = undefined
    return true
  } catch {
    return false
  }
}

async function retryPendingNavigation(noteId: string, notebookId?: string): Promise<boolean> {
  for (let attempt = 0; attempt < NAVIGATION_RETRY_ATTEMPTS; attempt++) {
    if ((!notebookId || MN.currnetNotebookId === notebookId) && focusPendingNote(noteId)) return true
    await delay(NAVIGATION_RETRY_INTERVAL)
  }
  return false
}

export async function openNoteInMindMap(noteId: string, notebookId?: string): Promise<void> {
  if (!noteId) throw new Error("目标卡片缺少 noteId")
  if (!MN.db.getNoteById(noteId)) throw new Error("目标卡片不存在或尚未同步")
  if (!notebookId || MN.currnetNotebookId === notebookId) {
    self.pendingMistakeNavigation = { noteId, notebookId }
    if (focusPendingNote(noteId) || await retryPendingNavigation(noteId, notebookId)) return
    self.pendingMistakeNavigation = undefined
    throw new Error("原题脑图尚未加载完成，请稍后重试")
  }
  self.pendingMistakeNavigation = { noteId, notebookId }
  openURL(noteReferenceUrl(noteId), true)
  if (await retryPendingNavigation(noteId, notebookId)) return
  self.pendingMistakeNavigation = undefined
  throw new Error("打开了原题链接，但脑图加载超时，请再次点击定位原题")
}

export async function completePendingNoteNavigation(openedNotebookId?: string): Promise<void> {
  const target = self.pendingMistakeNavigation as
    | { noteId: string; notebookId?: string }
    | undefined
  if (!target || (target.notebookId && openedNotebookId && target.notebookId !== openedNotebookId)) return
  await delay(0.2)
  // The originating bridge call keeps retrying too. This extra attempt handles
  // notebook-open events that arrive before the mind-map view is ready.
  focusPendingNote(target.noteId)
}
