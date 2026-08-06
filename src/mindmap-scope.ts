import { NodeNote } from "marginnote"
export type { IndexScope as MindMapScope } from "./scope-key"

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

export function isInMindMap(node: NodeNote, rootNodeId?: string): boolean {
  if (!rootNodeId) return true
  if (nodeIdentifier(node) === rootNodeId) return true
  try {
    return node.ancestorNodes.some(ancestor => nodeIdentifier(ancestor) === rootNodeId)
  } catch {
    return false
  }
}
