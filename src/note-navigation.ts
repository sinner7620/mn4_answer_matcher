import {
  delay,
  getLocalDataByKey,
  MN,
  openURL,
  saveFile,
  setLocalDataByKey,
  writeTextFile
} from "marginnote"
import { noteReferenceUrl } from "./note-link"
import { loadMatcherSettings } from "./settings"

const NAVIGATION_RETRY_INTERVAL = 0.25
const NAVIGATION_RETRY_ATTEMPTS = 60
const NAVIGATION_VERIFY_DELAY = 0.08
const RUNTIME_DEBUG_MAX_LINES = 2000
const RUNTIME_DEBUG_STORAGE_KEY = "mn4-answer-matcher.runtime-debug.v1"

interface NavigationDebugState {
  runId: string
  startedAtMs: number
  noteId: string
  notebookId?: string
  focusCalls: number
  lines: string[]
}

interface PendingNavigation {
  runId: string
  noteId: string
  notebookId?: string
}

function noteIdOf(value: any): string {
  return String(value?.noteId ?? value?.noteid ?? value?.id ?? value?.note?.noteId ?? "").trim()
}

function currentControllerState(): {
  currentNotebookId: string
  controllerNotebookId: string
  focusNoteId: string
  visibleFocusNoteId: string
} {
  const controller = MN.notebookController
  return {
    currentNotebookId: String(MN.currnetNotebookId ?? ""),
    controllerNotebookId: String(controller?.notebookId ?? ""),
    focusNoteId: noteIdOf(controller?.focusNote),
    visibleFocusNoteId: noteIdOf(controller?.visibleFocusNote)
  }
}

function debugState(): NavigationDebugState | undefined {
  return self.mistakeNavigationDebug as NavigationDebugState | undefined
}

function runtimeDebugLines(): string[] {
  try {
    const stored = getLocalDataByKey(RUNTIME_DEBUG_STORAGE_KEY)
    if (typeof stored !== "string" || !stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed)
      ? parsed.filter((line): line is string => typeof line === "string")
      : []
  } catch {
    return []
  }
}

function pushRuntimeDebugLine(scope: string, message: string): void {
  if (!loadMatcherSettings().debugModeEnabled) return
  try {
    const lines = runtimeDebugLines()
    lines.push(`${new Date().toISOString()} [${scope}] ${message}`)
    if (lines.length > RUNTIME_DEBUG_MAX_LINES) {
      lines.splice(0, lines.length - RUNTIME_DEBUG_MAX_LINES)
    }
    setLocalDataByKey(JSON.stringify(lines), RUNTIME_DEBUG_STORAGE_KEY)
  } catch {
    // Diagnostic recording must never affect plugin behavior.
  }
}

export function recordRuntimeState(scope: string, label: string, detail = ""): void {
  if (!loadMatcherSettings().debugModeEnabled) return
  try {
    const state = currentControllerState()
    const message =
      `${label}` +
      ` currentNotebook=${state.currentNotebookId || "(空)"}` +
      ` controllerNotebook=${state.controllerNotebookId || "(空)"}` +
      ` focus=${state.focusNoteId || "(空)"}` +
      ` visibleFocus=${state.visibleFocusNoteId || "(空)"}` +
      (detail ? ` ${detail}` : "")
    pushRuntimeDebugLine(scope, message)
    try {
      console.log(`[MN4 运行诊断][${scope}] ${message}`)
    } catch {
      // Console logging is optional.
    }
  } catch (error) {
    pushRuntimeDebugLine(scope, `${label} 状态读取失败=${String(error)}${detail ? ` ${detail}` : ""}`)
  }
}

function debugLog(message: string): void {
  if (!loadMatcherSettings().debugModeEnabled) return
  const state = debugState()
  const elapsed = state ? Math.max(0, Date.now() - state.startedAtMs) : 0
  const line = `[+${elapsed}ms]${state?.runId ? ` [run=${state.runId}]` : ""} ${message}`
  if (state) state.lines.push(line)
  pushRuntimeDebugLine("跳转", line)
  try {
    console.log(`[MN4 错题跳转] ${line}`)
  } catch {
    // Runtime debug logging must never affect navigation.
  }
}

function logControllerState(label: string): void {
  const state = currentControllerState()
  debugLog(
    `${label} currentNotebook=${state.currentNotebookId || "(空)"}` +
    ` controllerNotebook=${state.controllerNotebookId || "(空)"}` +
    ` focus=${state.focusNoteId || "(空)"}` +
    ` visibleFocus=${state.visibleFocusNoteId || "(空)"}`
  )
}

function activeNavigationRunId(): string {
  try {
    return String(self.mn4NavigationRunId ?? "")
  } catch {
    return ""
  }
}

function isNavigationRunActive(runId: string): boolean {
  return Boolean(runId) && activeNavigationRunId() === runId
}

function startNavigationDebug(noteId: string, notebookId?: string): string {
  const previousRunId = activeNavigationRunId()
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  self.mn4NavigationRunId = runId
  if (previousRunId && previousRunId !== runId) {
    pushRuntimeDebugLine("跳转", `[run=${previousRunId}] 旧定位请求被新请求取消`)
  }
  if (loadMatcherSettings().debugModeEnabled) {
    self.mistakeNavigationDebug = {
      runId,
      startedAtMs: Date.now(),
      noteId,
      notebookId,
      focusCalls: 0,
      lines: []
    } satisfies NavigationDebugState
  } else {
    self.mistakeNavigationDebug = undefined
  }
  debugLog(`开始定位 version=${__APP_VERSION__} noteId=${noteId} notebookId=${notebookId || "(未指定)"}`)
  debugLog(`目标卡片存在=${Boolean(MN.db.getNoteById(noteId))}`)
  logControllerState("初始状态")
  return runId
}

function isTargetFocused(noteId: string): boolean {
  const state = currentControllerState()
  return state.focusNoteId === noteId || state.visibleFocusNoteId === noteId
}

async function focusPendingNote(noteId: string, reason: string, runId: string): Promise<boolean> {
  if (!isNavigationRunActive(runId)) return false
  const state = debugState()
  if (state) state.focusCalls++
  const callNo = state?.focusCalls ?? 0
  logControllerState(`focus#${callNo} 前 reason=${reason} target=${noteId}`)
  try {
    MN.studyController.focusNoteInMindMapById(noteId)
    debugLog(`focus#${callNo} focusNoteInMindMapById 调用完成 target=${noteId}`)
  } catch (error) {
    debugLog(`focus#${callNo} 调用抛错=${String(error)} target=${noteId}`)
    return false
  }

  await delay(NAVIGATION_VERIFY_DELAY)
  if (!isNavigationRunActive(runId)) return false
  logControllerState(`focus#${callNo} 后 target=${noteId}`)
  const focused = isTargetFocused(noteId)
  debugLog(`focus#${callNo} verified=${focused} target=${noteId}`)
  if (!focused) return false

  self.pendingMistakeNavigation = undefined
  return true
}

async function retryPendingNavigation(
  noteId: string,
  notebookId: string | undefined,
  runId: string
): Promise<boolean> {
  for (let attempt = 0; attempt < NAVIGATION_RETRY_ATTEMPTS; attempt++) {
    if (!isNavigationRunActive(runId)) return false
    const currentNotebookId = MN.currnetNotebookId
    if (!notebookId || currentNotebookId === notebookId) {
      if (await focusPendingNote(noteId, `retry-${attempt + 1}`, runId)) return true
    } else {
      debugLog(
        `retry-${attempt + 1} 等待目标学习集 current=${currentNotebookId || "(空)"} target=${notebookId}`
      )
    }
    await delay(NAVIGATION_RETRY_INTERVAL)
  }
  if (!isNavigationRunActive(runId)) return false
  debugLog(`重试耗尽 attempts=${NAVIGATION_RETRY_ATTEMPTS}`)
  return false
}

export async function openNoteInMindMap(noteId: string, notebookId?: string): Promise<void> {
  if (!noteId) throw new Error("目标卡片缺少 noteId")
  if (!MN.db.getNoteById(noteId)) throw new Error("目标卡片不存在或尚未同步")

  const runId = startNavigationDebug(noteId, notebookId)
  if (!notebookId || MN.currnetNotebookId === notebookId) {
    debugLog("当前已在目标学习集，直接尝试聚焦")
    self.pendingMistakeNavigation = { runId, noteId, notebookId } satisfies PendingNavigation
    if (
      await focusPendingNote(noteId, "direct", runId) ||
      await retryPendingNavigation(noteId, notebookId, runId)
    ) {
      debugLog("定位成功")
      return
    }
    if (!isNavigationRunActive(runId)) return
    self.pendingMistakeNavigation = undefined
    debugLog("定位失败：目标学习集已打开，但始终未验证到目标焦点")
    throw new Error("原题脑图尚未加载完成，请稍后重试")
  }

  self.pendingMistakeNavigation = { runId, noteId, notebookId } satisfies PendingNavigation
  const url = noteReferenceUrl(noteId)
  debugLog(`跨学习集，调用 openURL=${url}`)
  try {
    openURL(url, true)
    debugLog("openURL 调用完成")
  } catch (error) {
    debugLog(`openURL 抛错=${String(error)}`)
    throw error
  }

  if (await retryPendingNavigation(noteId, notebookId, runId)) {
    debugLog("定位成功")
    return
  }
  if (!isNavigationRunActive(runId)) return
  self.pendingMistakeNavigation = undefined
  debugLog("定位失败：openURL 后仍未验证到目标焦点")
  throw new Error("打开了原题链接，但脑图加载超时，请再次点击定位原题")
}

export async function completePendingNoteNavigation(openedNotebookId?: string): Promise<void> {
  const target = self.pendingMistakeNavigation as PendingNavigation | undefined
  debugLog(`notebookWillOpen openedNotebookId=${openedNotebookId || "(空)"}`)
  if (!target) {
    debugLog("notebookWillOpen 时没有 pending 目标")
    return
  }
  if (target.notebookId && openedNotebookId && target.notebookId !== openedNotebookId) {
    debugLog(`忽略非目标学习集 opened=${openedNotebookId} target=${target.notebookId}`)
    return
  }
  if (!isNavigationRunActive(target.runId)) {
    debugLog(`忽略已取消的 pending 定位 run=${target.runId}`)
    return
  }

  await delay(0.2)
  // The originating bridge call keeps retrying too. This extra attempt handles
  // notebook-open events that arrive before the mind-map view is ready.
  await focusPendingNote(target.noteId, "notebookWillOpen", target.runId)
}

function runtimeLogText(): string {
  const state = debugState()
  const current = currentControllerState()
  const runtimeLines = runtimeDebugLines().slice()
  const header = [
    "MN4 插件运行调试日志",
    `version=${__APP_VERSION__}`,
    `exportedAt=${new Date().toISOString()}`,
    `currentNotebookId=${current.currentNotebookId}`,
    `controllerNotebookId=${current.controllerNotebookId}`,
    `currentFocusNoteId=${current.focusNoteId}`,
    `currentVisibleFocusNoteId=${current.visibleFocusNoteId}`
  ]
  const output = [
    ...header,
    "",
    "=== 全局运行事件时间线 ===",
    ...(runtimeLines.length ? runtimeLines : ["暂无运行事件记录。"])
  ]
  if (!state) {
    return [...output, "", "=== 最近一次定位原题 ===", "暂无定位原题运行记录。"].join("\n")
  }
  return [
    ...output,
    "",
    "=== 最近一次定位原题 ===",
    `startedAt=${new Date(state.startedAtMs).toISOString()}`,
    `targetNoteId=${state.noteId}`,
    `targetNotebookId=${state.notebookId || ""}`,
    `focusCalls=${state.focusCalls}`,
    "",
    ...state.lines
  ].join("\n")
}

export function exportNavigationRuntimeLog(): { saved: true; filename: string } {
  if (!loadMatcherSettings().debugModeEnabled) throw new Error("请先开启调试模式")
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)
  const filename = `MN4运行日志-${__APP_VERSION__}-${stamp}.txt`
  const path = `${MN.app.documentPath}/${filename}`
  writeTextFile(path, `\uFEFF${runtimeLogText()}`)
  saveFile(path, "public.plain-text")
  return { saved: true, filename }
}

export function clearNavigationRuntimeLog(): void {
  try {
    setLocalDataByKey("", RUNTIME_DEBUG_STORAGE_KEY)
    self.mistakeNavigationDebug = undefined
  } catch {
    // Clearing diagnostics must never affect plugin behavior.
  }
}
