import { delay, MN, NodeNote } from "marginnote"
import type { MbBookNote } from "marginnote"
import {
  AnswerLike,
  buildIndex,
  extractAnswer,
  normalizeTitle,
  pathMatchScore,
  rankAnswers
} from "./domain"
import { readSafeNote } from "./safe-note"
import { renderCardHtml } from "./card-html"
import { loadStoredIndex, saveStoredIndex, StoredAnswerIndexItem } from "./index-store"
import { isInMindMap, nodeIdentifier } from "./mindmap-scope"
import { IndexScope as MindMapScope, scopeKey } from "./scope-key"

export interface IndexedAnswer extends AnswerLike {
  noteId: string
  notebookId: string
  pathTitles: string[]
}

const indexes = new Map<string, Map<string, IndexedAnswer[]>>()

export interface RefreshResult {
  indexedCards: number
  skippedCards: number
  brokenLinks: number
}

function pathTitles(node: NodeNote): string[] {
  try {
    return node.ancestorNodes.map(ancestor => ancestor.title?.trim()).filter(Boolean) as string[]
  } catch {
    return []
  }
}

function toIndexedAnswer(
  note: MbBookNote,
  notebookId: string
): { answer: IndexedAnswer; brokenLinks: number } {
  const node = new NodeNote(note, notebookId)
  const safe = readSafeNote(node.note, noteId => MN.db.getNoteById(noteId))
  return {
    answer: {
      id: nodeIdentifier(node),
      noteId: String(node.note.noteId),
      notebookId,
      pathTitles: pathTitles(node),
      titles: safe.titles,
      tags: safe.tags,
      comments: safe.comments,
      excerpts: safe.excerpts,
      children: safe.children
    },
    brokenLinks: safe.brokenLinks
  }
}

export async function refreshIndex(scope: string | MindMapScope): Promise<RefreshResult> {
  const normalized = typeof scope === "string" ? { notebookId: scope } : scope
  const { notebookId, rootNodeId } = normalized
  const key = scopeKey(normalized)
  const notebook = MN.db.getNotebookById(notebookId)
  if (!notebook) throw new Error("找不到已绑定的答案脑图，可能已被删除")

  const byId = new Map<string, IndexedAnswer>()
  let skippedCards = 0
  let brokenLinks = 0
  const notes = notebook.notes ?? []
  for (let index = 0; index < notes.length; index++) {
    const note = notes[index]
    if (!note) {
      skippedCards++
      continue
    }
    try {
      const node = new NodeNote(note, notebookId)
      if (!isInMindMap(node, rootNodeId)) continue
      const result = toIndexedAnswer(note, notebookId)
      brokenLinks += result.brokenLinks
      if (!byId.has(result.answer.id)) byId.set(result.answer.id, result.answer)
    } catch (error) {
      skippedCards++
      MN.error(error)
    }
    if (index % 40 === 39) await delay(0.01)
  }
  const answers = [...byId.values()]
  indexes.set(key, buildIndex(answers))
  saveStoredIndex(key, answers.map(toStoredAnswer))
  return { indexedCards: answers.length, skippedCards, brokenLinks }
}

function shortened(value: string): string {
  return value.slice(0, 240)
}

function toStoredAnswer(answer: IndexedAnswer): StoredAnswerIndexItem {
  return {
    id: answer.id,
    noteId: answer.noteId,
    notebookId: answer.notebookId,
    pathTitles: answer.pathTitles,
    titles: answer.titles,
    tags: answer.tags,
    comments: answer.comments.slice(0, 1).map(shortened),
    excerpts: answer.excerpts.slice(0, 1).map(shortened),
    children: answer.children.slice(0, 1).map(child => ({
      title: shortened(child.title),
      text: shortened(child.text)
    }))
  }
}

function restoreIndex(key: string): boolean {
  const stored = loadStoredIndex(key)
  if (!stored?.length) return false
  indexes.set(key, buildIndex(stored as IndexedAnswer[]))
  return true
}

export function clearIndex(scope?: string | MindMapScope): void {
  if (scope) indexes.delete(scopeKey(scope))
  else indexes.clear()
}

export function findAnswers(
  scope: string | MindMapScope,
  questionTitles: string | string[],
  questionPath: string[] = []
): IndexedAnswer[] {
  const key = scopeKey(scope)
  if (!indexes.has(key) && !restoreIndex(key)) {
    throw new Error("答案索引尚未建立，请在插件菜单点击“刷新答案索引”")
  }
  const index = indexes.get(key)
  const matchesById = new Map<string, IndexedAnswer>()
  const titles = Array.isArray(questionTitles) ? questionTitles : [questionTitles]
  for (const title of titles) {
    for (const answer of index?.get(normalizeTitle(title)) ?? []) {
      matchesById.set(answer.id, answer)
    }
  }
  const matches = [...matchesById.values()]
  return rankAnswers(matches).sort(
    (a, b) =>
      pathMatchScore(questionPath, b.pathTitles) - pathMatchScore(questionPath, a.pathTitles)
  )
}

export function answerText(answer: IndexedAnswer): string {
  return extractAnswer(answer)
}

export function answerCardHtml(answer: IndexedAnswer, questionTitle: string): string {
  const note = MN.db.getNoteById(answer.noteId)
  if (!note) throw new Error("答案卡片已不存在，请刷新答案索引")
  return renderCardHtml(
    note,
    questionTitle,
    noteId => MN.db.getNoteById(noteId),
    hash => {
      try {
        const base64 = MN.db.getMediaByHash(hash)?.base64Encoding()
        return base64 ? String(base64) : undefined
      } catch {
        return undefined
      }
    },
    hash => {
      try {
        // Keep the original NSKeyedArchive intact. iPad's add-on bridge does not
        // reliably expose NSKeyedUnarchiver, so the answer WebView unwraps it itself.
        const base64 = MN.db.getMediaByHash(hash)?.base64Encoding()
        return base64 ? String(base64) : undefined
      } catch {
        return undefined
      }
    }
  )
}
