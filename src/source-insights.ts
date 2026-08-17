export interface SourceInsightRecord {
  recordId: string
  sourceNotebookId: string
  sourceNotebookTitle: string
  sourceRootNodeId?: string
  sourceRootTitle?: string
  sourceTitle?: string
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

export interface MindMapOption {
  key: string
  rootNodeId?: string
  name: string
  notebook: string
  count: number
  weak: number
}

export interface ParentInsight {
  key: string
  mapKey: string
  mapName: string
  name: string
  notebook: string
  path: string[]
  count: number
  weak: number
}

export interface ParentInsightResult {
  groups: ParentInsight[]
  selectedRecords: number
  classifiedRecords: number
  unclassifiedRecords: number
  selectedMapCount: number
  validMapCount: number
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

/**
 * Legacy root-level summary retained for existing callers/tests. New overview UI
 * uses buildMindMapOptions + buildParentInsights instead.
 */
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

export function buildMindMapOptions(records: SourceInsightRecord[]): MindMapOption[] {
  const grouped = new Map<string, {
    key: string
    rootNodeId?: string
    title: string
    notebook: string
    count: number
    weak: number
  }>()

  for (const record of records) {
    const key = sourceInsightKey(record)
    const current = grouped.get(key) ?? {
      key,
      rootNodeId: clean(record.sourceRootNodeId) || undefined,
      title: clean(record.sourceRootTitle) || fallbackRootTitle(record),
      notebook: clean(record.sourceNotebookTitle) || "未命名学习集",
      count: 0,
      weak: 0
    }
    current.count += 1
    if (record.level <= 1) current.weak += 1
    grouped.set(key, current)
  }

  const entries = [...grouped.values()].sort((a, b) =>
    b.count - a.count || a.title.localeCompare(b.title, "zh-CN") || a.key.localeCompare(b.key)
  )
  const titleCounts = new Map<string, number>()
  for (const entry of entries) titleCounts.set(entry.title, (titleCounts.get(entry.title) ?? 0) + 1)
  const titleIndexes = new Map<string, number>()

  return entries.map(entry => {
    const duplicateIndex = (titleIndexes.get(entry.title) ?? 0) + 1
    titleIndexes.set(entry.title, duplicateIndex)
    const duplicate = (titleCounts.get(entry.title) ?? 0) > 1
    return {
      key: entry.key,
      rootNodeId: entry.rootNodeId,
      name: duplicate ? `${entry.title}（${duplicateIndex}）` : entry.title,
      notebook: entry.notebook,
      count: entry.count,
      weak: entry.weak
    }
  })
}

/** Normalize ancestor titles to root -> ... -> direct-parent order, excluding the mind-map root itself. */
function parentBranchPath(record: SourceInsightRecord): string[] {
  let path = (record.sourcePathTitles ?? []).map(clean).filter(Boolean)
  if (!path.length) {
    path = (record.categoryPath ?? []).map(clean).filter(Boolean)
    const notebookTitle = clean(record.sourceNotebookTitle)
    if (path[0] === notebookTitle) path = path.slice(1)
  }

  const sourceTitle = clean(record.sourceTitle)
  if (sourceTitle && path[path.length - 1] === sourceTitle) path = path.slice(0, -1)

  const rootTitle = clean(record.sourceRootTitle)
  if (!rootTitle || !path.length) return path

  if (path[0] === rootTitle) return path.slice(1)
  if (path[path.length - 1] === rootTitle) return path.slice(0, -1).reverse()

  const rootIndex = path.indexOf(rootTitle)
  if (rootIndex >= 0) {
    const after = path.slice(rootIndex + 1)
    const before = path.slice(0, rootIndex).reverse()
    return after.length >= before.length ? after : before
  }
  return path
}

interface ParentCandidate {
  groups: ParentInsight[]
  covered: number
  singletonRecords: number
  largest: number
}

function filterPathForParent(record: SourceInsightRecord, parentName: string, distanceFromDirectParent: number): string[] {
  const categoryPath = (record.categoryPath ?? []).map(clean).filter(Boolean)
  if (!categoryPath.length) return []
  const ancestors = (record.sourcePathTitles ?? []).map(clean).filter(Boolean)
  const rootTitle = clean(record.sourceRootTitle)
  const directFirst = Boolean(rootTitle && ancestors[ancestors.length - 1] === rootTitle)
  if (distanceFromDirectParent > 0 && directFirst) return []
  const index = categoryPath.lastIndexOf(parentName)
  return index >= 0 ? categoryPath.slice(0, index + 1) : []
}

function candidateAtDistance(
  records: SourceInsightRecord[],
  map: MindMapOption,
  distanceFromDirectParent: number
): ParentCandidate {
  const buckets = new Map<string, ParentInsight>()
  let covered = 0

  for (const record of records) {
    const branch = parentBranchPath(record)
    const index = branch.length - 1 - distanceFromDirectParent
    if (index < 0 || index >= branch.length) continue
    const parentName = branch[index]
    if (!parentName) continue
    const parentPath = branch.slice(0, index + 1)
    const key = `${map.key}\u001fparent:${parentPath.join("\u001f")}`
    const current = buckets.get(key) ?? {
      key,
      mapKey: map.key,
      mapName: map.name,
      name: parentName,
      notebook: map.notebook,
      path: filterPathForParent(record, parentName, distanceFromDirectParent),
      count: 0,
      weak: 0
    }
    current.count += 1
    if (record.level <= 1) current.weak += 1
    buckets.set(key, current)
    covered += 1
  }

  const groups = [...buckets.values()].sort((a, b) =>
    b.count - a.count || a.name.localeCompare(b.name, "zh-CN") || a.key.localeCompare(b.key)
  )
  return {
    groups,
    covered,
    singletonRecords: groups.filter(group => group.count === 1).reduce((sum, group) => sum + group.count, 0),
    largest: Math.max(0, ...groups.map(group => group.count))
  }
}

function isUsefulCandidate(candidate: ParentCandidate, total: number): boolean {
  if (total < 3 || candidate.covered < Math.max(2, Math.ceil(total * 0.6))) return false
  if (candidate.groups.length < 2) return false
  if (candidate.groups.length >= candidate.covered) return false
  if (candidate.largest >= candidate.covered) return false
  if (candidate.largest / candidate.covered > 0.85) return false
  if (candidate.singletonRecords / candidate.covered > 0.5) return false
  return true
}

function usefulGroupsForMap(records: SourceInsightRecord[], map: MindMapOption): ParentInsight[] {
  const maxDepth = Math.max(0, ...records.map(record => parentBranchPath(record).length))
  // Start at the direct parent. If it fragments into one category per question,
  // progressively move upward until a meaningful aggregation level is found.
  for (let distance = 0; distance < maxDepth; distance++) {
    const candidate = candidateAtDistance(records, map, distance)
    if (isUsefulCandidate(candidate, records.length)) return candidate.groups
  }
  return []
}

/**
 * Build an adaptive parent-node distribution for the selected mind maps.
 * A map is omitted when its hierarchy cannot produce a meaningful split
 * (all questions in one bucket, or essentially one bucket per question).
 */
export function buildParentInsights(
  records: SourceInsightRecord[],
  selectedMapKeys?: Iterable<string>
): ParentInsightResult {
  const maps = buildMindMapOptions(records)
  const selected = selectedMapKeys ? new Set(selectedMapKeys) : new Set(maps.map(map => map.key))
  const selectedMaps = maps.filter(map => selected.has(map.key))
  const selectedRecords = records.filter(record => selected.has(sourceInsightKey(record)))
  const groups: ParentInsight[] = []
  let validMapCount = 0
  let classifiedRecords = 0

  for (const map of selectedMaps) {
    const mapRecords = selectedRecords.filter(record => sourceInsightKey(record) === map.key)
    const mapGroups = usefulGroupsForMap(mapRecords, map)
    if (!mapGroups.length) continue
    validMapCount += 1
    classifiedRecords += mapGroups.reduce((sum, group) => sum + group.count, 0)
    groups.push(...mapGroups)
  }

  const duplicateNames = new Map<string, number>()
  for (const group of groups) duplicateNames.set(group.name, (duplicateNames.get(group.name) ?? 0) + 1)
  const disambiguated = groups
    .map(group => (duplicateNames.get(group.name) ?? 0) > 1
      ? { ...group, name: `${group.name} · ${group.mapName}` }
      : group)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN") || a.key.localeCompare(b.key))

  return {
    groups: disambiguated,
    selectedRecords: selectedRecords.length,
    classifiedRecords,
    unclassifiedRecords: Math.max(0, selectedRecords.length - classifiedRecords),
    selectedMapCount: selectedMaps.length,
    validMapCount
  }
}
