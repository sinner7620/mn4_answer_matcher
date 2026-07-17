import { getLocalDataByKey, setLocalDataByKey } from "marginnote"

const INDEX_KEY_PREFIX = "mn4-answer-matcher.index.v1."

export interface StoredAnswerIndexItem {
  id: string
  noteId: string
  notebookId: string
  pathTitles: string[]
  titles: string[]
  tags: string[]
  comments: string[]
  excerpts: string[]
  children: Array<{ title: string; text: string }>
}

export function loadStoredIndex(notebookId: string): StoredAnswerIndexItem[] | undefined {
  const value = getLocalDataByKey(`${INDEX_KEY_PREFIX}${notebookId}`)
  if (!value || typeof value !== "object") return undefined
  try {
    const items = Array.from(value as ArrayLike<StoredAnswerIndexItem>)
    return items.length ? items : undefined
  } catch {
    return undefined
  }
}

export function saveStoredIndex(
  notebookId: string,
  answers: StoredAnswerIndexItem[]
): void {
  setLocalDataByKey(answers, `${INDEX_KEY_PREFIX}${notebookId}`)
}
