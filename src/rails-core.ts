import { MN, NodeNote, showHUD } from "marginnote"
import {
  answerWorkbenchData,
  bindAnswerNotebook,
  eventObservers,
  handlers,
  lifecycle,
  onAnswerCardPan,
  onAnswerCardResize,
  onAnswerToolbarClick,
  onCloseAnswerCard,
  onMistakeLinkToolbarClick,
  onMistakeToolbarClick,
  onMistakeLevelPickerAction,
  onNotebookPickerAction,
  openMenu,
  refreshCurrentIndex,
  unbindCurrent
} from "./plugin"
import {
  markQuestionAsMistake,
  mistakeDetailById,
  mistakeWorkbenchData,
  openSourceByMistakeId,
  removeMistakeById,
  repairAndOrganizeMistakes,
  reviewMistakeById,
  setMistakeCategoryById
} from "./mistake-manager"
import { checkForUpdates } from "./updater"

function selectedNode(): NodeNote | undefined {
  const selected = NodeNote.getSelectedNodes()
  if (selected.length) return selected[0]
  if (self.lastClickedNote) return new NodeNote(self.lastClickedNote)
  const focus = MN.notebookController?.focusNote
  return focus ? new NodeNote(focus) : undefined
}

async function bridge(command: string, payload: any): Promise<any> {
  if (command === "dashboard") {
    return { version: __APP_VERSION__, mistakes: mistakeWorkbenchData() }
  }
  if (command === "answer") return answerWorkbenchData()
  if (command === "mistakes") return mistakeWorkbenchData()
  if (command === "markMistake") {
    return onMistakeToolbarClick()
  }
  if (command === "findCurrentAnswer") return onAnswerToolbarClick()
  if (command === "bindAnswerNotebook") return bindAnswerNotebook()
  if (command === "refreshAnswerIndex") return refreshCurrentIndex()
  if (command === "unbindAnswerNotebook") return unbindCurrent()
  if (command === "openCurrentMistakeSource") return onMistakeLinkToolbarClick()
  if (command === "mistakeDetail") return mistakeDetailById(String(payload?.recordId ?? ""))
  if (command === "openSource") return openSourceByMistakeId(String(payload?.recordId ?? ""))
  if (command === "reviewMistake") return reviewMistakeById(String(payload?.recordId ?? ""), Number(payload?.level) as any)
  if (command === "setMistakeCategory") return setMistakeCategoryById(String(payload?.recordId ?? ""), String(payload?.category ?? ""))
  if (command === "removeMistake") return removeMistakeById(String(payload?.recordId ?? ""))
  if (command === "repairMistakes") return repairAndOrganizeMistakes()
  if (command === "checkUpdates") return checkForUpdates(true)
  if (command === "legacyMenu") return openMenu()
  if (command === "notify") return showHUD(String(payload?.message ?? ""), 3)
  throw new Error(`未知工作台命令：${command}`)
}

;(globalThis as any).__MN_ANSWER_CORE_GLOBAL__ = {
  bridge,
  eventObservers,
  handlers,
  lifecycle,
  instanceMethods: {
    onAnswerToolbarClick,
    onMistakeToolbarClick,
    onMistakeLevelPickerAction,
    onMistakeLinkToolbarClick,
    onNotebookPickerAction,
    onCloseAnswerCard,
    onAnswerCardPan,
    onAnswerCardResize,
    openMenu
  }
}
