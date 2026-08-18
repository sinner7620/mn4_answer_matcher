import { NodeNote } from "marginnote"
import { MAIN_MINDMAP_SCOPE_ID, noteBelongsToMindMapScope } from "./mindmap-candidate"
export type { IndexScope as MindMapScope } from "./scope-key"
export { MAIN_MINDMAP_SCOPE_ID } from "./mindmap-candidate"

export function nodeIdentifier(node: NodeNote): string {
  return String(node.nodeId ?? node.note.noteId)
}

export function mindMapRoot(node: NodeNote): NodeNote {
  let current = node
  const visited = new Set<string>()
  while (current.parentNode) {
    const id = nodeIdentifier(current)
    if (visited.has(id)) break
    visited.add(id)
    current = current.parentNode
  }
  return current
}

export function isInMindMap(
  node: NodeNote,
  rootNodeId?: string,
  knownChildMapNoteIds: Iterable<string> = []
): boolean {
  if (!rootNodeId) return true
  if (noteBelongsToMindMapScope(node.note, rootNodeId, knownChildMapNoteIds)) return true
  if (rootNodeId === MAIN_MINDMAP_SCOPE_ID) return false
  if (nodeIdentifier(node) === rootNodeId) return true
  try {
    return node.ancestorNodes.some(ancestor => nodeIdentifier(ancestor) === rootNodeId)
  } catch {
    return false
  }
}
