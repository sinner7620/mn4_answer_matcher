import type { RegexMatchingRules } from "./binding"

const MAX_PATTERN_LENGTH = 240
const MAX_INPUT_LENGTH = 500

export interface RegexRuleValidation {
  valid: boolean
  error?: string
}

function compilePattern(pattern: string, label: string): RegExp {
  const value = pattern.trim()
  if (!value) throw new Error(`${label}不能为空`)
  if (value.length > MAX_PATTERN_LENGTH) {
    throw new Error(`${label}不能超过 ${MAX_PATTERN_LENGTH} 个字符`)
  }
  if (/\\[1-9]/.test(value)) {
    throw new Error(`${label}不能使用反向引用，请改用普通捕获组提取匹配键`)
  }
  const structural = value
    .replace(/\\./g, "x")
    .replace(/\[[^\]]*\]/g, "x")
  if (
    /\((?:\?:)?[^()]*(?:[+*]|\{\d+(?:,\d*)?\})[^()]*\)\s*(?:[+*]|\{\d+(?:,\d*)?\})/.test(
      structural
    )
  ) {
    throw new Error(`${label}包含可能导致卡顿的嵌套重复`)
  }
  try {
    return new RegExp(value, "iu")
  } catch (error) {
    throw new Error(`${label}无效：${error instanceof Error ? error.message : String(error)}`)
  }
}

function normalizeKeyPart(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, "")
    .replace(/[？?。．.!！：:，,；;、]/g, "")
  return /^\d+$/.test(normalized)
    ? normalized.replace(/^0+(?=\d)/, "")
    : normalized
}

function extractWithCompiledPattern(value: string, pattern: RegExp): string | undefined {
  const matched = pattern.exec(value.normalize("NFKC").slice(0, MAX_INPUT_LENGTH))
  if (!matched) return undefined
  const parts = matched.length > 1 ? matched.slice(1) : [matched[0]]
  const key = parts.map(part => normalizeKeyPart(part ?? "")).join("\u001f")
  return key.replace(/\u001f+$/g, "") || undefined
}

export function createRegexKeyExtractor(
  pattern: string,
  label: "题目规则" | "答案规则"
): (title: string) => string | undefined {
  const compiled = compilePattern(pattern, label)
  return title => extractWithCompiledPattern(title, compiled)
}

export function validateRegexMatchingRules(rules: RegexMatchingRules): RegexRuleValidation {
  try {
    compilePattern(rules.questionPattern, "题目规则")
    compilePattern(rules.answerPattern, "答案规则")
    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export function extractQuestionRegexKey(
  title: string,
  rules: RegexMatchingRules
): string | undefined {
  return createRegexKeyExtractor(rules.questionPattern, "题目规则")(title)
}

export function extractAnswerRegexKey(
  title: string,
  rules: RegexMatchingRules
): string | undefined {
  return createRegexKeyExtractor(rules.answerPattern, "答案规则")(title)
}

export function regexRulePreview(
  title: string,
  pattern: string,
  label: "题目规则" | "答案规则"
): string | undefined {
  return createRegexKeyExtractor(pattern, label)(title)
}
