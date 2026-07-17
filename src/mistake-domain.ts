export type MistakeLevel = 0 | 1 | 2 | 3 | 4 | 5

export interface MistakeRecord {
  mistakeNoteId: string
  sourceNoteId: string
  sourceNotebookId: string
  sourceNotebookTitle: string
  sourceTitle: string
  sourcePathTitles: string[]
  answerNotebookId?: string
  level: MistakeLevel
  createdAt: string
  lastReviewedAt?: string
  nextReviewAt: string
  reviewCount: number
  history: Array<{ at: string; level: MistakeLevel }>
}

export const LEVEL_DESCRIPTIONS: Record<MistakeLevel, string> = {
  0: "无法看懂答案思路",
  1: "首次看懂答案思路",
  2: "首次模仿答案并动笔做对",
  3: "不看答案，仅查资料后做对",
  4: "不查资料，独立动笔做对",
  5: "看到题目即掌握完整解法"
}

// Intervals are intentionally front-loaded for lower levels and increasingly
// spaced for mastered questions. Repeated reviews use the next interval.
export const REVIEW_CURVES: Record<MistakeLevel, number[]> = {
  0: [1, 2, 4, 7, 14, 30],
  1: [1, 3, 7, 14, 30, 60],
  2: [2, 5, 10, 21, 45, 90],
  3: [3, 7, 14, 30, 60, 120],
  4: [7, 14, 30, 60, 120, 240],
  5: [30, 60, 120, 240, 365]
}

export function isMistakeLevel(value: number): value is MistakeLevel {
  return Number.isInteger(value) && value >= 0 && value <= 5
}

export function nextReviewTime(
  level: MistakeLevel,
  reviewCount: number,
  from = new Date()
): Date {
  const curve = REVIEW_CURVES[level]
  const days = curve[Math.min(Math.max(0, reviewCount), curve.length - 1)]
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000)
}

export function createMistakeRecord(
  input: Omit<MistakeRecord, "createdAt" | "nextReviewAt" | "reviewCount" | "history">,
  now = new Date()
): MistakeRecord {
  return {
    ...input,
    createdAt: now.toISOString(),
    nextReviewAt: nextReviewTime(input.level, 0, now).toISOString(),
    reviewCount: 0,
    history: [{ at: now.toISOString(), level: input.level }]
  }
}

export function reviewMistake(
  record: MistakeRecord,
  level: MistakeLevel,
  now = new Date()
): MistakeRecord {
  const reviewCount = level === record.level ? record.reviewCount + 1 : 0
  return {
    ...record,
    level,
    reviewCount,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: nextReviewTime(level, reviewCount, now).toISOString(),
    history: [...record.history, { at: now.toISOString(), level }]
  }
}

export function sourceRecordKey(sourceNotebookId: string, sourceNoteId: string): string {
  return `${sourceNotebookId}:${sourceNoteId}`
}

export function isDue(record: MistakeRecord, now = new Date()): boolean {
  return new Date(record.nextReviewAt).getTime() <= now.getTime()
}
