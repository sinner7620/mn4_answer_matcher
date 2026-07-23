import { NodeNote } from "marginnote"
import { BindingTarget } from "./binding"
import {
  findAnswerByReference,
  findAnswers,
  findAnswersByRegex,
  IndexedAnswer
} from "./matcher"
import { pairedAnswerReference } from "./ordered-pairing"

export function findAnswersForQuestion(
  target: BindingTarget,
  question: NodeNote,
  titles: string[],
  path: string[]
): IndexedAnswer[] {
  if (target.matchMode === "regex") {
    return target.regexRules
      ? findAnswersByRegex(target, titles, target.regexRules)
      : []
  }
  const paired = pairedAnswerReference(target, question)
  if (paired) {
    const answer = findAnswerByReference(target, paired.noteId, paired.nodeId)
    if (answer) return [answer]
  }
  return findAnswers(target, titles, path)
}
