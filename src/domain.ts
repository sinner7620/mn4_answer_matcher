export interface AnswerLike {
  id: string
  titles: string[]
  tags: string[]
  comments: string[]
  excerpts: string[]
  children: Array<{ title: string; text: string }>
}

export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[？?。．.!！：:]/g, "")
    .trim()
    .toLowerCase()
}

export function buildIndex<T extends Pick<AnswerLike, "id" | "titles">>(
  answers: T[]
): Map<string, T[]> {
  const index = new Map<string, T[]>()
  const seenByKey = new Map<string, Set<string>>()

  for (const answer of answers) {
    for (const title of answer.titles) {
      const key = normalizeTitle(title)
      if (!key) continue
      const seen = seenByKey.get(key) ?? new Set<string>()
      if (seen.has(answer.id)) continue
      seen.add(answer.id)
      seenByKey.set(key, seen)
      index.set(key, [...(index.get(key) ?? []), answer])
    }
  }
  return index
}

export function rankAnswers<T extends Pick<AnswerLike, "tags">>(answers: T[]): T[] {
  return [...answers].sort((a, b) => {
    const aStandard = a.tags.some(tag => normalizeTitle(tag) === "标准答案")
    const bStandard = b.tags.some(tag => normalizeTitle(tag) === "标准答案")
    return Number(bStandard) - Number(aStandard)
  })
}

export function pathMatchScore(questionPath: string[], answerPath: string[]): number {
  const question = questionPath.map(normalizeTitle).filter(Boolean)
  const answer = answerPath.map(normalizeTitle).filter(Boolean)
  let score = 0
  for (let index = 0; index < Math.min(question.length, answer.length); index++) {
    if (question[index] !== answer[index]) break
    score += Math.max(1, 100 - index)
  }
  return score
}

export function extractAnswer(answer: AnswerLike): string {
  const comments = answer.comments.map(text => text.trim()).filter(Boolean)
  if (comments.length) return comments.join("\n\n")

  const excerpts = answer.excerpts.map(text => text.trim()).filter(Boolean)
  if (excerpts.length) return excerpts.join("\n\n")

  const children = answer.children
    .map(child => {
      const title = child.title.trim()
      const text = child.text.trim()
      if (!title && !text) return ""
      return title ? `【${title}】${text ? `\n${text}` : ""}` : text
    })
    .filter(Boolean)
  return children.join("\n\n")
}
