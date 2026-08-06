export function noteReferenceUrl(noteId: string): string {
  return `marginnote3app://note/${encodeURIComponent(noteId)}`
}
