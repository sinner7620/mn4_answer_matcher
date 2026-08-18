import { MN, NodeNote } from "marginnote"
import { BindingTarget } from "./binding"
import { nodeIdentifier } from "./mindmap-scope"
import { collectChildMindMapNoteIds, noteBelongsToMindMapScope } from "./mindmap-candidate"
import {
  buildOrderedPairing,
  PairingBuildResult,
  PairingGroup
} from "./ordered-pairing-domain"

export {
  buildOrderedPairing
} from "./ordered-pairing-domain"
export type {
  PairingBuildResult,
  PairingChild,
  PairingGroup,
  PairingIssue,
  PairingPreview
} from "./ordered-pairing-domain"

function safeChildren(node: NodeNote): NodeNote[] {
  try {
    return Array.from(node.childNodes ?? [])
  } catch {
    return []
  }
}

function noteId(node: NodeNote): string {
  return String(node.note?.noteId ?? "").trim()
}

export function collectPairingGroups(root: NodeNote): PairingGroup[] {
  const groups: PairingGroup[] = []
  const stack = [root]
  const visited = new Set<string>()
  while (stack.length) {
    const node = stack.pop()!
    const id = nodeIdentifier(node)
    if (!id || visited.has(id)) continue
    visited.add(id)
    const children = safeChildren(node)
    if (children.length) {
      groups.push({
        nodeId: id,
        title: node.title?.trim() || "",
        children: children.map(child => ({
          nodeId: nodeIdentifier(child),
          noteId: noteId(child),
          title: child.title?.trim() || ""
        }))
      })
    }
    for (let index = children.length - 1; index >= 0; index--) stack.push(children[index])
  }
  return groups
}

export function collectPairingGroupsForScope(notebookId: string, scopeId: string): PairingGroup[] {
  const notebook = MN.db.getNotebookById(notebookId)
  if (!notebook) return []
  const notes = notebook.notes ?? []
  const childMapIds = collectChildMindMapNoteIds(notes)
  const groups: PairingGroup[] = []
  const visited = new Set<string>()
  for (const note of notes) {
    if (!note || !noteBelongsToMindMapScope(note, scopeId, childMapIds)) continue
    try {
      const node = new NodeNote(note, notebookId)
      const id = nodeIdentifier(node)
      if (!id || visited.has(id)) continue
      visited.add(id)
      const children = safeChildren(node).filter(child =>
        noteBelongsToMindMapScope(child.note, scopeId, childMapIds)
      )
      if (!children.length) continue
      groups.push({
        nodeId: id,
        title: node.title?.trim() || "",
        children: children.map(child => ({
          nodeId: nodeIdentifier(child),
          noteId: noteId(child),
          title: child.title?.trim() || ""
        }))
      })
    } catch {
      // Ignore a damaged note; other nodes in the same mind map can still pair.
    }
  }
  return groups
}

export function findMindMapNode(notebookId: string, rootNodeId: string): NodeNote | undefined {
  const direct = MN.db.getNoteById(rootNodeId)
  if (direct) {
    try {
      const node = new NodeNote(direct, notebookId)
      if (nodeIdentifier(node) === rootNodeId || noteId(node) === rootNodeId) return node
    } catch {
      // Fall through to a notebook scan for grouped or aliased mind-map nodes.
    }
  }
  const notebook = MN.db.getNotebookById(notebookId)
  for (const note of notebook?.notes ?? []) {
    if (!note) continue
    try {
      const node = new NodeNote(note, notebookId)
      if (nodeIdentifier(node) === rootNodeId || noteId(node) === rootNodeId) return node
    } catch {
      // A single damaged note must not prevent resolving the selected root.
    }
  }
  return undefined
}

export function buildOrderedPairingForBinding(
  sourceNotebookId: string,
  sourceRootNodeId: string,
  target: BindingTarget
): PairingBuildResult {
  if (!target.rootNodeId) throw new Error("顺序匹配需要先绑定具体答案脑图")
  const sourceGroups = collectPairingGroupsForScope(sourceNotebookId, sourceRootNodeId)
  const answerGroups = collectPairingGroupsForScope(target.notebookId, target.rootNodeId)
  return buildOrderedPairing(
    sourceGroups,
    answerGroups,
    {
      sourceNotebookId,
      sourceRootNodeId,
      answerNotebookId: target.notebookId,
      answerRootNodeId: target.rootNodeId
    }
  )
}

export function pairedAnswerReference(
  target: BindingTarget,
  question: NodeNote
): { nodeId: string; noteId: string } | undefined {
  if (target.matchMode !== "parent-order" || !target.orderedPairing) return undefined
  const questionNodeId = nodeIdentifier(question)
  const questionNoteId = noteId(question)
  const pair = target.orderedPairing.pairs.find(item =>
    (questionNodeId && item.questionNodeId === questionNodeId) ||
    (questionNoteId && item.questionNoteId === questionNoteId)
  )
  return pair ? { nodeId: pair.answerNodeId, noteId: pair.answerNoteId } : undefined
}
