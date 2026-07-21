import { getLocalDataByKey, setLocalDataByKey } from "marginnote"

const SETTINGS_KEY = "mn4-answer-matcher.settings.v1"

export interface MatcherSettings {
  allowSameStudySetMindMap: boolean
}

export function loadMatcherSettings(): MatcherSettings {
  const value = getLocalDataByKey(SETTINGS_KEY) as Partial<MatcherSettings> | undefined
  return { allowSameStudySetMindMap: value?.allowSameStudySetMindMap === true }
}

export function saveMatcherSettings(settings: MatcherSettings): void {
  setLocalDataByKey(settings, SETTINGS_KEY)
}
