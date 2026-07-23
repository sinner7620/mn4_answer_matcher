import {
  OrderedPairEntry,
  OrderedPairing
} from "./binding"
import { normalizeTitle } from "./domain"

export interface PairingChild {
  nodeId: string
  noteId: string
  title: string
}

export interface PairingGroup {
  nodeId: string
  title: string
  children: PairingChild[]
}

export interface PairingIssue {
  title: string
  sourceCount: number
  answerCount: number
  reason: "missing" | "count" | "ambiguous"
}

export interface PairingBuildResult {
  pairing: OrderedPairing
  sourceGroups: number
  answerGroups: number
  previews: PairingPreview[]
  issues: PairingIssue[]
}

export interface PairingPreview {
  parentTitle: string
  position: number
  questionTitle: string
  answerTitle: string
}

export function normalizeParentTitle(value: string): string {
  const normalized = value.normalize("NFKC").trim()
  const withoutChapterPrefix = normalized.replace(
    /^第[\d一二三四五六七八九十百零〇两]+(?:部分|章|节|篇|单元)\s*/,
    ""
  )
  return normalizeTitle(withoutChapterPrefix) || normalizeTitle(normalized)
}

function uniqueGroups(groups: PairingGroup[]): Map<string, PairingGroup[]> {
  const result = new Map<string, PairingGroup[]>()
  for (const group of groups) {
    const key = normalizeParentTitle(group.title)
    if (!key) continue
    result.set(key, [...(result.get(key) ?? []), group])
  }
  return result
}

export function buildOrderedPairing(
  sourceGroups: PairingGroup[],
  answerGroups: PairingGroup[],
  scope: {
    sourceNotebookId: string
    sourceRootNodeId: string
    answerNotebookId: string
    answerRootNodeId: string
    createdAt?: string
  }
): PairingBuildResult {
  const sourceByTitle = uniqueGroups(sourceGroups)
  const answerByTitle = uniqueGroups(answerGroups)
  const answerKeys = [...answerByTitle.keys()]
  const candidatesBySource = new Map<string, string[]>()
  for (const sourceKey of sourceByTitle.keys()) {
    const candidates = answerByTitle.has(sourceKey)
      ? [sourceKey]
      : answerKeys.filter(answerKey =>
          sourceKey.length >= 2 &&
          answerKey.length >= 2 &&
          (sourceKey.includes(answerKey) || answerKey.includes(sourceKey))
        )
    candidatesBySource.set(sourceKey, candidates)
  }
  const uniquelyClaimedAnswers = new Map<string, number>()
  for (const [sourceKey, candidates] of candidatesBySource) {
    if (candidates.length !== 1 || sourceByTitle.get(sourceKey)?.length !== 1) continue
    const answerKey = candidates[0]
    uniquelyClaimedAnswers.set(answerKey, (uniquelyClaimedAnswers.get(answerKey) ?? 0) + 1)
  }
  const pairs: OrderedPairEntry[] = []
  const previews: PairingPreview[] = []
  const issues: PairingIssue[] = []
  let matchedGroups = 0

  for (const [key, sourceMatches] of sourceByTitle) {
    const candidateKeys = candidatesBySource.get(key) ?? []
    const answerKey = candidateKeys.length === 1 ? candidateKeys[0] : ""
    const answerMatches = answerKey ? answerByTitle.get(answerKey) ?? [] : []
    const title = sourceMatches[0]?.title || key
    if (!candidateKeys.length) {
      issues.push({
        title,
        sourceCount: sourceMatches[0]?.children.length ?? 0,
        answerCount: 0,
        reason: "missing"
      })
      continue
    }
    if (
      candidateKeys.length !== 1 ||
      sourceMatches.length !== 1 ||
      answerMatches.length !== 1 ||
      uniquelyClaimedAnswers.get(answerKey) !== 1
    ) {
      issues.push({
        title,
        sourceCount: sourceMatches[0]?.children.length ?? 0,
        answerCount: answerMatches[0]?.children.length ?? 0,
        reason: "ambiguous"
      })
      continue
    }
    const source = sourceMatches[0]
    const answer = answerMatches[0]
    if (source.children.length !== answer.children.length) {
      issues.push({
        title,
        sourceCount: source.children.length,
        answerCount: answer.children.length,
        reason: "count"
      })
      continue
    }
    if (!source.children.length) continue
    matchedGroups++
    for (let position = 0; position < source.children.length; position++) {
      const question = source.children[position]
      const solution = answer.children[position]
      pairs.push({
        questionNodeId: question.nodeId,
        questionNoteId: question.noteId,
        answerNodeId: solution.nodeId,
        answerNoteId: solution.noteId,
        parentTitle: source.title,
        position
      })
      previews.push({
        parentTitle: source.title,
        position,
        questionTitle: question.title,
        answerTitle: solution.title
      })
    }
  }

  return {
    pairing: {
      sourceNotebookId: scope.sourceNotebookId,
      sourceRootNodeId: scope.sourceRootNodeId,
      answerNotebookId: scope.answerNotebookId,
      answerRootNodeId: scope.answerRootNodeId,
      createdAt: scope.createdAt ?? new Date().toISOString(),
      matchedGroups,
      pairs
    },
    sourceGroups: sourceGroups.length,
    answerGroups: answerGroups.length,
    previews,
    issues
  }
}
