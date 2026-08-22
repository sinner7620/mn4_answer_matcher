import { getLocalDataByKey, setLocalDataByKey } from "marginnote"

const SETTINGS_KEY = "mn4-answer-matcher.settings.v1"

export interface MatcherSettings {
  allowSameStudySetMindMap: boolean
  answerCardCloseButtonSide: "left" | "right"
}

export function loadMatcherSettings(): MatcherSettings {
  const value = getLocalDataByKey(SETTINGS_KEY) as Partial<MatcherSettings> | undefined
  return {
    allowSameStudySetMindMap: value?.allowSameStudySetMindMap === true,
    answerCardCloseButtonSide: value?.answerCardCloseButtonSide === "left" ? "left" : "right"
  }
}

export function saveMatcherSettings(settings: Partial<MatcherSettings>): void {
  setLocalDataByKey({ ...loadMatcherSettings(), ...settings }, SETTINGS_KEY)
}
