import { MistakeLevel } from "./mistake-domain"

export function cleanMistakeCategoryTag(value: string): string {
  return String(value ?? "").replace(/[\n\r#]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40)
}

function withoutManagedTags(tags: string[], categories: string[]): string[] {
  const custom = new Set(categories.map(cleanMistakeCategoryTag).filter(Boolean))
  return tags.filter(tag =>
    tag !== "错题" &&
    !/^错题[0-5]级$/.test(tag) &&
    !/^错题状态·S[0-5]$/.test(tag) &&
    !/^错题分类[·.。]/.test(tag) &&
    !custom.has(cleanMistakeCategoryTag(tag))
  )
}

export function mistakeSourceTags(
  tags: string[],
  level: MistakeLevel,
  category?: string,
  previousCategory?: string
): string[] {
  const cleanCategory = cleanMistakeCategoryTag(category ?? "")
  return Array.from(new Set([
    ...withoutManagedTags(tags, [category ?? "", previousCategory ?? ""]),
    "错题",
    `错题${level}级`,
    ...(cleanCategory ? [cleanCategory] : [])
  ]))
}

export function withoutMistakeSourceTags(tags: string[], category?: string): string[] {
  return withoutManagedTags(tags, [category ?? ""])
}
