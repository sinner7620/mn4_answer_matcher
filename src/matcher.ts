import { MN, NodeNote } from "marginnote"
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

export interface IndexedAnswer extends AnswerLike {
  note: MbBookNote
  notebookId: string
  pathTitles: string[]
}

const indexes = new Map<string, Map<string, IndexedAnswer[]>>()

export interface RefreshResult {
  indexedCards: number
  skippedCards: number
  brokenLinks: number
}

function nodeId(node: NodeNote): string {
  return String(node.nodeId ?? node.note.noteId)
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
      id: nodeId(node),
      note: node.note,
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

export function refreshIndex(notebookId: string): RefreshResult {
  const notebook = MN.db.getNotebookById(notebookId)
  if (!notebook) throw new Error("找不到已绑定的答案脑图，可能已被删除")

  const byId = new Map<string, IndexedAnswer>()
  let skippedCards = 0
  let brokenLinks = 0
  for (const note of notebook.notes ?? []) {
    if (!note) {
      skippedCards++
      continue
    }
    try {
      const result = toIndexedAnswer(note, notebookId)
      brokenLinks += result.brokenLinks
      if (!byId.has(result.answer.id)) byId.set(result.answer.id, result.answer)
    } catch (error) {
      skippedCards++
      MN.error(error)
    }
  }
  const answers = [...byId.values()]
  indexes.set(notebookId, buildIndex(answers))
  return { indexedCards: answers.length, skippedCards, brokenLinks }
}

export function clearIndex(notebookId?: string): void {
  if (notebookId) indexes.delete(notebookId)
  else indexes.clear()
}

export function findAnswers(
  notebookId: string,
  questionTitles: string | string[],
  questionPath: string[] = []
): IndexedAnswer[] {
  if (!indexes.has(notebookId)) refreshIndex(notebookId)
  const index = indexes.get(notebookId)
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
  return renderCardHtml(
    answer.note,
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
