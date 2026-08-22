import { getLocalDataByKey, setLocalDataByKey } from "marginnote"
import { MistakeLevel, MistakeReviewCurves, REVIEW_CURVES } from "./mistake-domain"

const SETTINGS_KEY = "mn4-answer-matcher.settings.v1"

export interface MatcherSettings {
  allowSameStudySetMindMap: boolean
  mistakeReviewCurves: MistakeReviewCurves
  mistakeCustomCategories: string[]
  debugModeEnabled: boolean
  experimentalGlassEnabled: boolean
}

const levels: MistakeLevel[] = [0, 1, 2, 3, 4, 5]

export function normalizeMistakeReviewCurves(value: unknown): MistakeReviewCurves {
  const input = value && typeof value === "object" ? value as Record<number, unknown> : {}
  return Object.fromEntries(levels.map(level => {
    const expectedLength = REVIEW_CURVES[level].length
    const candidate = Array.isArray(input[level]) ? input[level] : []
    const curve = REVIEW_CURVES[level].map((fallback, index) => {
      const days = Number(candidate[index])
      return Number.isInteger(days) && days >= 1 && days <= 3650 ? days : fallback
    })
    return [level, curve.slice(0, expectedLength)]
  })) as MistakeReviewCurves
}

export function normalizeMistakeCustomCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value
    .map(item => String(item ?? "").replace(/\s+/g, " ").trim().slice(0, 80))
    .filter(Boolean)))
    .slice(-100)
}

export function loadMatcherSettings(): MatcherSettings {
  const value = getLocalDataByKey(SETTINGS_KEY) as Partial<MatcherSettings> | undefined
  return {
    allowSameStudySetMindMap: value?.allowSameStudySetMindMap === true,
    mistakeReviewCurves: normalizeMistakeReviewCurves(value?.mistakeReviewCurves),
    mistakeCustomCategories: normalizeMistakeCustomCategories(value?.mistakeCustomCategories),
    debugModeEnabled: value?.debugModeEnabled === true,
    experimentalGlassEnabled: value?.debugModeEnabled === true && value?.experimentalGlassEnabled === true
  }
}

export function saveMatcherSettings(settings: Partial<MatcherSettings>): void {
  const current = loadMatcherSettings()
  setLocalDataByKey({
    ...current,
    ...settings,
    mistakeReviewCurves: normalizeMistakeReviewCurves(settings.mistakeReviewCurves ?? current.mistakeReviewCurves),
    mistakeCustomCategories: normalizeMistakeCustomCategories(settings.mistakeCustomCategories ?? current.mistakeCustomCategories)
  }, SETTINGS_KEY)
}
