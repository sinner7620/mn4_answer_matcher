import { MistakeLevel } from "./mistake-domain"

export function cleanMistakeCategoryTag(value: string): string {
  return String(value ?? "").replace(/[\n\r#]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40)
}

/** 归一化标签列表：接受单个字符串或数组，去 #、去空白、去重。 */
export function cleanMistakeTags(value: string | string[] | undefined | null): string[] {
  const list = Array.isArray(value) ? value : [value ?? ""]
  return Array.from(new Set(list.map(cleanMistakeCategoryTag).filter(Boolean)))
}

export function isManagedMistakeTag(value: string): boolean {
  const tag = cleanMistakeCategoryTag(value)
  return tag === "错题" ||
    /^错题[0-5]级$/.test(tag) ||
    /^错题状态·S[0-5]$/.test(tag) ||
    /^错题分类[·.。]/.test(tag)
}

/** 从 MarginNote 卡片标签解析出的可恢复错题状态。 */
export interface MistakeSourceTagState {
  isMistake: boolean
  level?: MistakeLevel
  customTags: string[]
}

/**
 * 从 MarginNote 卡片标签恢复错题身份与等级。
 * 新版优先识别「错题N级」，同时兼容早期「错题状态·SN」标签。
 */
export function mistakeStateFromSourceTags(tags: string[] | undefined | null): MistakeSourceTagState {
  const clean = cleanMistakeTags(tags)
  let level: MistakeLevel | undefined

  for (const tag of clean) {
    const match = /^错题([0-5])级$/.exec(tag)
    if (match) {
      level = Number(match[1]) as MistakeLevel
      break
    }
  }
  if (level === undefined) {
    for (const tag of clean) {
      const match = /^错题状态·S([0-5])$/.exec(tag)
      if (match) {
        level = Number(match[1]) as MistakeLevel
        break
      }
    }
  }

  return {
    isMistake: clean.includes("错题") || level !== undefined,
    level,
    customTags: clean.filter(tag => !isManagedMistakeTag(tag))
  }
}

/** 从 MarginNote 卡片当前标签反向提取用户标签，系统维护的错题标签不进入自定义标签。 */
export function customMistakeTagsFromSource(tags: string[] | undefined | null): string[] {
  return mistakeStateFromSourceTags(tags).customTags
}

function withoutManagedTags(tags: string[], categories: string[]): string[] {
  const custom = new Set(categories.map(cleanMistakeCategoryTag).filter(Boolean))
  return tags.filter(tag => !isManagedMistakeTag(tag) && !custom.has(cleanMistakeCategoryTag(tag)))
}

export function mistakeSourceTags(
  tags: string[],
  level: MistakeLevel,
  categories?: string | string[],
  previousCategories?: string | string[]
): string[] {
  const clean = cleanMistakeTags(categories)
  const managed = cleanMistakeTags([
    ...(Array.isArray(categories) ? categories : [categories ?? ""]),
    ...(Array.isArray(previousCategories) ? previousCategories : [previousCategories ?? ""])
  ])
  return Array.from(new Set([
    ...withoutManagedTags(tags, managed),
    "错题",
    `错题${level}级`,
    ...clean
  ]))
}

export function withoutMistakeSourceTags(tags: string[], categories?: string | string[]): string[] {
  return withoutManagedTags(tags, cleanMistakeTags(categories))
}
