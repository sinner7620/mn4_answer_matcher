import { delay, MN, openURL } from "marginnote"

export function noteReferenceUrl(noteId: string): string {
  return `marginnote4app://noteref/${encodeURIComponent(noteId)}`
}

export async function openNoteInMindMap(noteId: string, notebookId?: string): Promise<void> {
  if (!noteId) throw new Error("目标卡片缺少 noteId")
  if (!notebookId || MN.currnetNotebookId === notebookId) {
    MN.studyController.focusNoteInMindMapById(noteId)
    return
  }
  openURL(noteReferenceUrl(noteId))
  await delay(0.45)
  try {
    MN.studyController.focusNoteInMindMapById(noteId)
  } catch {
    // The native noteref URL has already opened the card. Focusing is an optional polish.
  }
}
