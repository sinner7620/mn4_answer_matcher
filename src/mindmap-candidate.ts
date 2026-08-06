export function isSelectableMindMapRoot(
  hasParent: boolean,
  title: unknown,
  noteId?: unknown,
  groupTargetIds: unknown[] = []
): boolean {
  const currentNoteId = String(noteId ?? "")
  const isGroupedAlias = groupTargetIds.some(targetId =>
    typeof targetId === "string" && targetId.length > 0 && targetId !== currentNoteId
  )
  return !hasParent && !isGroupedAlias && typeof title === "string" && title.trim().length > 0
}
