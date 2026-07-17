interface VersionParts {
  core: number[]
  prerelease: Array<number | string>
}

function parseVersion(value: string): VersionParts {
  const normalized = value.trim().replace(/^v/i, "").split("+")[0]
  const [coreText, prereleaseText = ""] = normalized.split("-", 2)
  return {
    core: coreText.split(".").map(part => Number.parseInt(part, 10) || 0),
    prerelease: prereleaseText
      ? prereleaseText.split(".").map(part => (/^\d+$/.test(part) ? Number(part) : part))
      : []
  }
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (let index = 0; index < Math.max(a.core.length, b.core.length); index++) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0)
    if (difference) return difference > 0 ? 1 : -1
  }
  if (!a.prerelease.length && !b.prerelease.length) return 0
  if (!a.prerelease.length) return 1
  if (!b.prerelease.length) return -1
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    const av = a.prerelease[index]
    const bv = b.prerelease[index]
    if (av === undefined) return -1
    if (bv === undefined) return 1
    if (av === bv) continue
    if (typeof av === "number" && typeof bv !== "number") return -1
    if (typeof av !== "number" && typeof bv === "number") return 1
    return av > bv ? 1 : -1
  }
  return 0
}
