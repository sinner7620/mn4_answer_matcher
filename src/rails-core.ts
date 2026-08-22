import { MN, NodeNote, showHUD } from "marginnote"
import {
  answerMatchingSettingsData,
  answerWorkbenchData,
  bindAnswerNotebook,
  configureAnswerMatching,
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
  saveRegexMatchingRules,
  setScopedBindingEnabled,
  unbindCurrent
} from "./plugin"
import {
  deleteMistakeTag,
  markQuestionAsMistake,
  mistakeDetailById,
  mistakeWorkbenchData,
  openSourceByMistakeId,
  removeMistakesByIds,
  removeMistakeById,
  repairAndOrganizeMistakes,
  reviewMistakeById,
  reviewMistakesByIds,
  saveMistakeReviewCurves,
  setMistakeCategoryById
} from "./mistake-manager"
import { checkForUpdates } from "./updater"
import { exportMistakes } from "./mistake-export"
import { clearNavigationRuntimeLog, exportNavigationRuntimeLog } from "./note-navigation"
import { loadMatcherSettings, saveMatcherSettings } from "./settings"
import { runTelemetryPostConnectivityTest } from "./telemetry"

function selectedNode(): NodeNote | undefined {
  const selected = NodeNote.getSelectedNodes()
  if (selected.length) return selected[0]
  if (self.lastClickedNote) return new NodeNote(self.lastClickedNote)
  const focus = MN.notebookController?.focusNote
  return focus ? new NodeNote(focus) : undefined
}

async function bridge(command: string, payload: any): Promise<any> {
  if (command === "dashboard") {
    return {
      version: __APP_VERSION__,
      mistakes: mistakeWorkbenchData(),
      matching: answerMatchingSettingsData()
    }
  }
  if (command === "answer") return answerWorkbenchData()
  if (command === "mistakes") return mistakeWorkbenchData()
  if (command === "markMistake") {
    return onMistakeToolbarClick()
  }
  if (command === "findCurrentAnswer") return onAnswerToolbarClick()
  if (command === "bindAnswerNotebook") return bindAnswerNotebook()
  if (command === "setScopedBinding") {
    return setScopedBindingEnabled(payload?.enabled === true)
  }
  if (command === "configureAnswerMatching") return configureAnswerMatching()
  if (command === "saveRegexMatchingRules") {
    return saveRegexMatchingRules(
      String(payload?.questionPattern ?? ""),
      String(payload?.answerPattern ?? "")
    )
  }
  if (command === "refreshAnswerIndex") return refreshCurrentIndex()
  if (command === "unbindAnswerNotebook") return unbindCurrent()
  if (command === "openCurrentMistakeSource") return onMistakeLinkToolbarClick()
  if (command === "mistakeDetail") return mistakeDetailById(String(payload?.recordId ?? ""))
  if (command === "openSource") return openSourceByMistakeId(String(payload?.recordId ?? ""))
  if (command === "reviewMistake") return reviewMistakeById(String(payload?.recordId ?? ""), Number(payload?.level) as any)
  if (command === "reviewMistakes") return reviewMistakesByIds(payload?.recordIds, Number(payload?.level) as any)
  if (command === "saveMistakeReviewCurves") return saveMistakeReviewCurves(payload?.curves)
  if (command === "setMistakeCategory") {
    return setMistakeCategoryById(
      String(payload?.recordId ?? ""),
      payload?.categories ?? String(payload?.category ?? "")
    )
  }
  if (command === "deleteMistakeTag") return deleteMistakeTag(String(payload?.tag ?? ""))
  if (command === "removeMistake") {
    await removeMistakeById(String(payload?.recordId ?? ""))
    return { removed: true }
  }
  if (command === "removeMistakes") return removeMistakesByIds(payload?.recordIds)
  if (command === "repairMistakes") return repairAndOrganizeMistakes()
  if (command === "exportMistakes") return exportMistakes(payload || { format: "md" })
  if (command === "exportRuntimeLog") return exportNavigationRuntimeLog()
  if (command === "setDebugMode") {
    const enabled = payload?.enabled === true
    saveMatcherSettings({
      debugModeEnabled: enabled,
      experimentalGlassEnabled: enabled && loadMatcherSettings().experimentalGlassEnabled
    })
    if (!enabled) clearNavigationRuntimeLog()
    showHUD(enabled ? "调试模式已开启" : "调试模式已关闭，运行日志已清空", 3)
    return { enabled }
  }
  if (command === "setExperimentalGlass") {
    if (!loadMatcherSettings().debugModeEnabled) throw new Error("请先开启调试模式")
    const enabled = payload?.enabled === true
    saveMatcherSettings({ experimentalGlassEnabled: enabled })
    return { enabled }
  }
  if (command === "testTelemetryPost") {
    if (!loadMatcherSettings().debugModeEnabled) throw new Error("请先开启调试模式")
    return runTelemetryPostConnectivityTest()
  }
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
