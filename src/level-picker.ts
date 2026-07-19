import { delay, select } from "marginnote"
import { LEVEL_DESCRIPTIONS, MistakeLevel } from "./mistake-domain"

/**
 * Use MarginNote's own selector instead of mounting a second native overlay.
 * Presenting a UIView from a UIWebView delegate callback can crash on iPad.
 */
export async function chooseMistakeLevel(current?: MistakeLevel): Promise<MistakeLevel | undefined> {
  await delay(0.08)
  const options = ([0, 1, 2, 3, 4, 5] as MistakeLevel[]).map(level =>
    `${level}级 · ${LEVEL_DESCRIPTIONS[level]}${current === level ? "（当前）" : ""}`
  )
  const result = await select(options, "标记错题等级", "请选择当前掌握程度", true)
  return result.index >= 0 && result.index <= 5 ? result.index as MistakeLevel : undefined
}

// Kept as compatibility no-ops for older cached Rails instance method tables.
export function onMistakeLevelPickerAction(): void {}
export function closeMistakeLevelPicker(): void {}
