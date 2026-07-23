export interface SourceInsightRecord {
  recordId: string
  sourceNotebookId: string
  sourceNotebookTitle: string
  sourceRootNodeId?: string
  sourceRootTitle?: string
  sourcePathTitles?: string[]
  categoryPath?: string[]
  level: number
}

export interface SourceInsight {
  key: string
  rootNodeId?: string
  name: string
  notebook: string
  path: string[]
  count: number
  weak: number
}

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim()
}

function fallbackRootTitle(record: SourceInsightRecord): string {
  const path = (record.sourcePathTitles ?? []).map(clean).filter(Boolean)
  return path[path.length - 1] || clean(record.sourceNotebookTitle) || "未命名题目脑图"
}

export function sourceInsightKey(record: SourceInsightRecord): string {
  const notebookId = clean(record.sourceNotebookId)
  const rootNodeId = clean(record.sourceRootNodeId)
  if (rootNodeId) return `${notebookId}\u001froot:${rootNodeId}`
  return `${notebookId}\u001ftitle:${clean(record.sourceRootTitle) || fallbackRootTitle(record)}`
}

export function buildSourceInsights(records: SourceInsightRecord[]): SourceInsight[] {
  const groups = new Map<string, {
    key: string
    rootNodeId?: string
    title: string
    notebook: string
    records: SourceInsightRecord[]
    path: string[]
  }>()
  for (const record of records) {
    const key = sourceInsightKey(record)
    const title = clean(record.sourceRootTitle) || fallbackRootTitle(record)
    const categoryPath = (record.categoryPath ?? []).map(clean).filter(Boolean)
    const rootIndex = categoryPath.lastIndexOf(title)
    const path = rootIndex >= 0
      ? categoryPath.slice(0, rootIndex + 1)
      : categoryPath.length === 1
        ? categoryPath
        : []
    const group = groups.get(key) ?? {
      key,
      rootNodeId: clean(record.sourceRootNodeId) || undefined,
      title,
      notebook: clean(record.sourceNotebookTitle) || "未命名学习集",
      records: [],
      path
    }
    group.records.push(record)
    if (!group.path.length && path.length) group.path = path
    groups.set(key, group)
  }

  const grouped = [...groups.values()].sort(
    (a, b) =>
      b.records.length - a.records.length ||
      a.title.localeCompare(b.title, "zh-CN") ||
      a.key.localeCompare(b.key)
  )
  const titleTotals = new Map<string, number>()
  for (const group of grouped) {
    titleTotals.set(group.title, (titleTotals.get(group.title) ?? 0) + 1)
  }
  const titleIndexes = new Map<string, number>()
  return grouped.map(group => {
    const duplicateIndex = (titleIndexes.get(group.title) ?? 0) + 1
    titleIndexes.set(group.title, duplicateIndex)
    return {
      key: group.key,
      rootNodeId: group.rootNodeId,
      name: (titleTotals.get(group.title) ?? 0) > 1
        ? `${group.title}（${duplicateIndex}）`
        : group.title,
      notebook: group.notebook,
      path: group.path,
      count: group.records.length,
      weak: group.records.filter(record => record.level <= 1).length
    }
  })
}
