export type MistakeLevel = 0 | 1 | 2 | 3 | 4 | 5

export interface MistakeHistoryItem {
  at: string
  level: MistakeLevel
}

export interface MistakeRecord {
  /** Stable identity. Never use title alone: duplicate titles are common across notebooks. */
  recordId: string
  sourceNoteId: string
  sourceNotebookId: string
  sourceNotebookTitle: string
  sourceTitle: string
  sourcePathTitles: string[]
  categoryPath: string[]
  manualCategory?: string
  answerNotebookId?: string
  answerRootNodeId?: string
  level: MistakeLevel
  createdAt: string
  updatedAt: string
  lastReviewedAt?: string
  nextReviewAt: string
  reviewCount: number
  history: MistakeHistoryItem[]
  /** v1 migration hint only. New records never clone a card into a mistake notebook. */
  legacyMistakeNoteId?: string
}

function cleanPart(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim()
}

export function sourceRecordKey(sourceNotebookId: string, sourceNoteId: string): string {
  return `${sourceNotebookId}:${sourceNoteId}`
}

export function mistakeCategoryPath(record: MistakeRecord): string[] {
  const manual = cleanPart(record.manualCategory ?? "")
  if (manual) return [manual]
  const stored = (record.categoryPath ?? []).map(cleanPart).filter(Boolean)
  if (stored.length) return stored
  return [
    cleanPart(record.sourceNotebookTitle) || "未命名脑图",
    ...(record.sourcePathTitles ?? []).map(cleanPart).filter(Boolean)
  ]
}

export function automaticCategoryPath(record: MistakeRecord): string[] {
  const stored = (record.categoryPath ?? []).map(cleanPart).filter(Boolean)
  if (stored.length) return stored
  return [
    cleanPart(record.sourceNotebookTitle) || "未命名脑图",
    ...(record.sourcePathTitles ?? []).map(cleanPart).filter(Boolean)
  ]
}

export interface MistakeCategoryOption {
  key: string
  label: string
  depth: number
}

export function categoryPathPrefixes(path: string[]): MistakeCategoryOption[] {
  const clean = path.map(cleanPart).filter(Boolean)
  return clean.map((_, index) => {
    const prefix = clean.slice(0, index + 1)
    return {
      key: `path:${prefix.join("\u001f")}`,
      label: prefix.join(" › "),
      depth: index
    }
  })
}

export function mistakeCategoryLabel(record: MistakeRecord): string {
  return mistakeCategoryPath(record).slice(0, 3).join(" › ") || "未分类"
}

export function compareMistakeRecords(a: MistakeRecord, b: MistakeRecord): number {
  const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" })
  const path = collator.compare(mistakeCategoryPath(a).join("\u0000"), mistakeCategoryPath(b).join("\u0000"))
  if (path) return path
  const title = collator.compare(a.sourceTitle, b.sourceTitle)
  if (title) return title
  return a.createdAt.localeCompare(b.createdAt) || a.recordId.localeCompare(b.recordId)
}

export const LEVEL_DESCRIPTIONS: Record<MistakeLevel, string> = {
  0: "未掌握",
  1: "已理解",
  2: "可完成",
  3: "已掌握",
  4: "已稳定",
  5: "已迁移"
}

export const REVIEW_CURVES: Record<MistakeLevel, number[]> = {
  0: [1],
  1: [1],
  2: [3],
  3: [7, 14],
  4: [30],
  5: [60]
}

export function isMistakeLevel(value: number): value is MistakeLevel {
  return Number.isInteger(value) && value >= 0 && value <= 5
}

export function nextReviewTime(level: MistakeLevel, reviewCount: number, from = new Date()): Date {
  const curve = REVIEW_CURVES[level]
  const days = curve[Math.min(Math.max(0, reviewCount), curve.length - 1)]
  return new Date(from.getTime() + days * 86400000)
}

export interface NewMistakeInput {
  sourceNoteId: string
  sourceNotebookId: string
  sourceNotebookTitle: string
  sourceTitle: string
  sourcePathTitles: string[]
  categoryPath?: string[]
  manualCategory?: string
  answerNotebookId?: string
  answerRootNodeId?: string
  level: MistakeLevel
  legacyMistakeNoteId?: string
}

export function createMistakeRecord(input: NewMistakeInput, now = new Date()): MistakeRecord {
  const at = now.toISOString()
  return {
    ...input,
    recordId: sourceRecordKey(input.sourceNotebookId, input.sourceNoteId),
    categoryPath: input.categoryPath?.length
      ? input.categoryPath
      : [input.sourceNotebookTitle, ...input.sourcePathTitles],
    createdAt: at,
    updatedAt: at,
    nextReviewAt: nextReviewTime(input.level, 0, now).toISOString(),
    reviewCount: 0,
    history: [{ at, level: input.level }]
  }
}

export function reviewMistake(record: MistakeRecord, level: MistakeLevel, now = new Date()): MistakeRecord {
  const reviewCount = level === record.level ? record.reviewCount + 1 : 0
  const at = now.toISOString()
  return {
    ...record,
    level,
    reviewCount,
    updatedAt: at,
    lastReviewedAt: at,
    nextReviewAt: nextReviewTime(level, reviewCount, now).toISOString(),
    history: [...record.history, { at, level }]
  }
}

export function isDue(record: MistakeRecord, now = new Date()): boolean {
  return new Date(record.nextReviewAt).getTime() <= now.getTime()
}
