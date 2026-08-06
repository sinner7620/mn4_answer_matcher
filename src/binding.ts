export interface BindingTarget {
  notebookId: string
  rootNodeId?: string
  rootTitle?: string
}

export type BindingValue = string | BindingTarget
export type Bindings = Record<string, BindingValue>

const ROOT_SEPARATOR = "::root::"

export function bindingKey(notebookId: string, rootNodeId?: string): string {
  return rootNodeId ? `${notebookId}${ROOT_SEPARATOR}${rootNodeId}` : notebookId
}

export function normalizeBinding(value: unknown): BindingTarget | undefined {
  if (typeof value === "string" && value) return { notebookId: value }
  if (!value || typeof value !== "object") return undefined
  const target = value as Partial<BindingTarget>
  if (typeof target.notebookId !== "string" || !target.notebookId) return undefined
  return {
    notebookId: target.notebookId,
    ...(typeof target.rootNodeId === "string" && target.rootNodeId
      ? { rootNodeId: target.rootNodeId }
      : {}),
    ...(typeof target.rootTitle === "string" && target.rootTitle
      ? { rootTitle: target.rootTitle }
      : {})
  }
}

export function getBinding(
  bindings: Bindings,
  notebookId: string,
  rootNodeId?: string
): BindingTarget | undefined {
  const exact = rootNodeId ? normalizeBinding(bindings[bindingKey(notebookId, rootNodeId)]) : undefined
  return exact ?? normalizeBinding(bindings[notebookId])
}

export function getBindingForMode(
  bindings: Bindings,
  notebookId: string,
  rootNodeId: string | undefined,
  scoped: boolean
): BindingTarget | undefined {
  return scoped
    ? getBinding(bindings, notebookId, rootNodeId)
    : normalizeBinding(bindings[notebookId]) ?? getBinding(bindings, notebookId, rootNodeId)
}

export function targetForMode(target: BindingTarget, scoped: boolean): BindingTarget {
  return scoped ? target : { notebookId: target.notebookId }
}

export function setBinding(
  bindings: Bindings,
  notebookId: string,
  rootNodeId: string,
  target: BindingTarget
): void {
  bindings[bindingKey(notebookId, rootNodeId)] = target
}

export function removeBinding(bindings: Bindings, notebookId: string, rootNodeId?: string): void {
  const exactKey = bindingKey(notebookId, rootNodeId)
  if (rootNodeId && Object.prototype.hasOwnProperty.call(bindings, exactKey)) delete bindings[exactKey]
  else delete bindings[notebookId]
}
