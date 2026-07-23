export type AnswerMatchMode = "title" | "parent-order" | "regex"

export interface RegexMatchingRules {
  questionPattern: string
  answerPattern: string
}

export interface OrderedPairEntry {
  questionNodeId: string
  questionNoteId: string
  answerNodeId: string
  answerNoteId: string
  parentTitle: string
  position: number
}

export interface OrderedPairing {
  sourceNotebookId: string
  sourceRootNodeId: string
  answerNotebookId: string
  answerRootNodeId: string
  createdAt: string
  matchedGroups: number
  pairs: OrderedPairEntry[]
}

export interface BindingTarget {
  notebookId: string
  rootNodeId?: string
  rootTitle?: string
  matchMode?: AnswerMatchMode
  orderedPairing?: OrderedPairing
  regexRules?: RegexMatchingRules
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
  const orderedPairing = normalizeOrderedPairing(target.orderedPairing)
  const regexRules = normalizeRegexMatchingRules(target.regexRules)
  return {
    notebookId: target.notebookId,
    ...(typeof target.rootNodeId === "string" && target.rootNodeId
      ? { rootNodeId: target.rootNodeId }
      : {}),
    ...(typeof target.rootTitle === "string" && target.rootTitle
      ? { rootTitle: target.rootTitle }
      : {}),
    ...(target.matchMode === "parent-order" ? { matchMode: "parent-order" as const } : {}),
    ...(target.matchMode === "regex" ? { matchMode: "regex" as const } : {}),
    ...(orderedPairing ? { orderedPairing } : {}),
    ...(regexRules ? { regexRules } : {})
  }
}

function cleanId(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeRegexMatchingRules(value: unknown): RegexMatchingRules | undefined {
  if (!value || typeof value !== "object") return undefined
  const rules = value as Partial<RegexMatchingRules>
  const questionPattern = typeof rules.questionPattern === "string"
    ? rules.questionPattern.trim()
    : ""
  const answerPattern = typeof rules.answerPattern === "string"
    ? rules.answerPattern.trim()
    : ""
  if (!questionPattern || !answerPattern) return undefined
  return { questionPattern, answerPattern }
}

function normalizeOrderedPairing(value: unknown): OrderedPairing | undefined {
  if (!value || typeof value !== "object") return undefined
  const pairing = value as Partial<OrderedPairing>
  const sourceNotebookId = cleanId(pairing.sourceNotebookId)
  const sourceRootNodeId = cleanId(pairing.sourceRootNodeId)
  const answerNotebookId = cleanId(pairing.answerNotebookId)
  const answerRootNodeId = cleanId(pairing.answerRootNodeId)
  if (!sourceNotebookId || !sourceRootNodeId || !answerNotebookId || !answerRootNodeId) {
    return undefined
  }
  const pairs = Array.isArray(pairing.pairs)
    ? pairing.pairs.flatMap(value => {
        if (!value || typeof value !== "object") return []
        const pair = value as Partial<OrderedPairEntry>
        const questionNodeId = cleanId(pair.questionNodeId)
        const questionNoteId = cleanId(pair.questionNoteId)
        const answerNodeId = cleanId(pair.answerNodeId)
        const answerNoteId = cleanId(pair.answerNoteId)
        if ((!questionNodeId && !questionNoteId) || (!answerNodeId && !answerNoteId)) return []
        return [{
          questionNodeId,
          questionNoteId,
          answerNodeId,
          answerNoteId,
          parentTitle: typeof pair.parentTitle === "string" ? pair.parentTitle.trim() : "",
          position: Number.isInteger(pair.position) && Number(pair.position) >= 0
            ? Number(pair.position)
            : 0
        }]
      })
    : []
  if (!pairs.length) return undefined
  return {
    sourceNotebookId,
    sourceRootNodeId,
    answerNotebookId,
    answerRootNodeId,
    createdAt: typeof pairing.createdAt === "string" ? pairing.createdAt : "",
    matchedGroups: Number.isInteger(pairing.matchedGroups)
      ? Math.max(0, Number(pairing.matchedGroups))
      : 0,
    pairs
  }
}

export function getBinding(bindings: Bindings, notebookId: string, rootNodeId?: string): BindingTarget | undefined {
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
  if (scoped) return target
  return {
    notebookId: target.notebookId,
    ...(target.matchMode === "regex"
      ? {
          matchMode: "regex" as const,
          ...(target.regexRules ? { regexRules: target.regexRules } : {})
        }
      : {})
  }
}

export function setBinding(bindings: Bindings, notebookId: string, rootNodeId: string, target: BindingTarget): void {
  bindings[bindingKey(notebookId, rootNodeId)] = target
}

export function removeBinding(bindings: Bindings, notebookId: string, rootNodeId?: string): void {
  const exactKey = bindingKey(notebookId, rootNodeId)
  if (rootNodeId && Object.prototype.hasOwnProperty.call(bindings, exactKey)) delete bindings[exactKey]
  else delete bindings[notebookId]
}
