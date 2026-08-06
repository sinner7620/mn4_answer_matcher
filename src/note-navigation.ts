import { delay, MN, openURL } from "marginnote"
import { noteReferenceUrl } from "./note-link"

export async function openNoteInMindMap(noteId: string, notebookId?: string): Promise<void> {
  if (!noteId) throw new Error("目标卡片缺少 noteId")
  if (!MN.db.getNoteById(noteId)) throw new Error("目标卡片不存在或尚未同步")
  if (!notebookId || MN.currnetNotebookId === notebookId) {
    MN.studyController.focusNoteInMindMapById(noteId)
    return
  }
  self.pendingMistakeNavigation = { noteId, notebookId }
  openURL(noteReferenceUrl(noteId), true)
  for (let attempt = 0; attempt < 12; attempt++) {
    await delay(0.25)
    if (MN.currnetNotebookId !== notebookId) continue
    try {
      MN.studyController.focusNoteInMindMapById(noteId)
      self.pendingMistakeNavigation = undefined
      return
    } catch {
      // Notebook may be open before its mind-map nodes finish loading.
    }
  }
}

export async function completePendingNoteNavigation(openedNotebookId?: string): Promise<void> {
  const target = self.pendingMistakeNavigation as
    | { noteId: string; notebookId?: string }
    | undefined
  if (!target || (target.notebookId && openedNotebookId && target.notebookId !== openedNotebookId)) return
  await delay(0.35)
  try {
    MN.studyController.focusNoteInMindMapById(target.noteId)
    self.pendingMistakeNavigation = undefined
  } catch {
    // The retry loop in openNoteInMindMap remains active while the notebook loads.
  }
}
