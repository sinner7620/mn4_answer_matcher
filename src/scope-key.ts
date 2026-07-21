export interface IndexScope {
  notebookId: string
  rootNodeId?: string
}

export function scopeKey(scope: string | IndexScope): string {
  const normalized = typeof scope === "string" ? { notebookId: scope } : scope
  return normalized.rootNodeId
    ? `${normalized.notebookId}::root::${normalized.rootNodeId}`
    : normalized.notebookId
}
