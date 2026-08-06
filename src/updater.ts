import { delay, fetch, MN, popup, saveFile, showHUD } from "marginnote"
import { backupBindings } from "./store"
import { compareVersions } from "./version"

const RELEASES_API = `https://api.github.com/repos/${__GITHUB_REPOSITORY__}/releases?per_page=10`
const LAST_CHECK_KEY = "marginnote.extension.mn4-answer-matcher.update.last-check"
const AUTO_CHECK_INTERVAL = 12 * 60 * 60 * 1000

interface ReleaseAsset {
  name?: string
  browser_download_url?: string
}

interface GitHubRelease {
  tag_name?: string
  name?: string
  body?: string
  draft?: boolean
  prerelease?: boolean
  html_url?: string
  assets?: ReleaseAsset[]
}

export type UpdateCheckResult = "none" | "cancel" | "back" | "saved"

function githubHeaders(): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "MN4-Answer-Matcher"
  }
}

function releaseVersion(release: GitHubRelease): string {
  return String(release.tag_name ?? "").trim().replace(/^v/i, "")
}

function installableAsset(release: GitHubRelease): ReleaseAsset | undefined {
  const expected = `mn4-answer-matcher-v${releaseVersion(release)}.mnaddon`.toLowerCase()
  return release.assets?.find(asset => asset.name?.toLowerCase() === expected) ??
    release.assets?.find(asset => asset.name?.toLowerCase().endsWith(".mnaddon"))
}

function lastCheckTime(): number {
  try {
    return NSUserDefaults.standardUserDefaults().doubleForKey(LAST_CHECK_KEY) || 0
  } catch {
    return 0
  }
}

function rememberCheck(): void {
  try {
    const defaults = NSUserDefaults.standardUserDefaults()
    defaults.setDoubleForKey(Date.now(), LAST_CHECK_KEY)
    defaults.synchronize()
  } catch {
    // Automatic throttling is optional; update checks still work without it.
  }
}

async function fetchReleases(): Promise<GitHubRelease[]> {
  const response = await fetch(RELEASES_API, { headers: githubHeaders(), timeout: 20 })
  const releases = response.json()
  if (!Array.isArray(releases)) throw new Error("GitHub Releases 返回格式异常")
  return releases
    .filter((release: GitHubRelease) => !release.draft && releaseVersion(release))
    .sort((a: GitHubRelease, b: GitHubRelease) =>
      compareVersions(releaseVersion(b), releaseVersion(a))
    )
}

function newestForChannel(releases: GitHubRelease[], prerelease: boolean): GitHubRelease | undefined {
  return releases.find(release => Boolean(release.prerelease) === prerelease)
}

async function downloadUpdate(release: GitHubRelease, asset: ReleaseAsset): Promise<string> {
  const url = asset.browser_download_url
  const tempPath = MN.app.tempPath
  if (!url || !tempPath) throw new Error("更新包地址或临时目录不可用")
  showHUD("正在下载插件更新…", 3)
  const response = await fetch(url, {
    headers: { ...githubHeaders(), Accept: "application/octet-stream" },
    timeout: 60
  })
  const fileName = asset.name || `mn4-answer-matcher-v${releaseVersion(release)}.mnaddon`
  const path = `${tempPath.replace(/\/$/, "")}/${fileName}`
  if (!response.data?.length() || !response.data.writeToFileAtomically(path, true)) {
    throw new Error("更新包下载或写入失败")
  }
  return path
}

async function downloadAndSave(release: GitHubRelease, asset: ReleaseAsset): Promise<void> {
  const path = await downloadUpdate(release, asset)
  // The user may install this file later, so create the persistent binding backup now.
  backupBindings()
  showHUD("更新包已下载，请选择保存位置；之后点开 .mnaddon 文件手动安装", 5)
  saveFile(path, "public.data")
}

export async function checkForUpdates(interactive = true): Promise<UpdateCheckResult> {
  try {
    if (!interactive && Date.now() - lastCheckTime() < AUTO_CHECK_INTERVAL) return "none"
    rememberCheck()
    if (interactive) showHUD("正在检查 GitHub 更新…", 2)
    const releases = await fetchReleases()
    const stableRelease = newestForChannel(releases, false)
    const betaRelease = newestForChannel(releases, true)
    const stableUpdate = stableRelease && compareVersions(releaseVersion(stableRelease), __APP_VERSION__) > 0
      ? stableRelease
      : undefined
    const betaUpdate = betaRelease && compareVersions(releaseVersion(betaRelease), __APP_VERSION__) > 0
      ? betaRelease
      : undefined

    if (!interactive) {
      if (!stableUpdate) return "none"
      const version = releaseVersion(stableUpdate)
      const asset = installableAsset(stableUpdate)
      if (!asset) throw new Error(`v${version} Release 中没有 .mnaddon 安装包`)
      const notes = String(stableUpdate.body ?? "暂无更新说明").trim().slice(0, 900)
      const result = await popup({
        title: `发现正式版 v${version}`,
        message: `当前版本：v${__APP_VERSION__}\n\n${notes}`,
        buttons: ["取消", "返回", "下载并保存"],
        canCancel: false,
        multiLine: true
      })
      if (result.buttonIndex === 0) return "cancel"
      if (result.buttonIndex === 1) return "back"
      if (result.buttonIndex === 2) {
        await downloadAndSave(stableUpdate, asset)
        return "saved"
      }
      return "none"
    }

    if (!stableUpdate && !betaUpdate) {
      if (interactive) showHUD("GitHub 上暂时没有可用版本", 3)
      return "none"
    }

    const buttons = ["取消", "返回"]
    const actions: Array<undefined | { release: GitHubRelease; asset: ReleaseAsset }> = [undefined, undefined]
    const message = [`当前版本：v${__APP_VERSION__}`]
    if (stableUpdate) {
      const version = releaseVersion(stableUpdate)
      const asset = installableAsset(stableUpdate)
      if (!asset) throw new Error(`正式版 v${version} Release 中没有 .mnaddon 安装包`)
      message.push(`正式版 v${version}\n${String(stableUpdate.body ?? "暂无更新说明").trim().slice(0, 500)}`)
      buttons.push("下载并保存")
      actions.push({ release: stableUpdate, asset })
    } else {
      message.push("正式版：当前已是最新版本")
    }
    if (betaUpdate) {
      const version = releaseVersion(betaUpdate)
      const asset = installableAsset(betaUpdate)
      if (!asset) throw new Error(`Beta v${version} Release 中没有 .mnaddon 安装包`)
      message.push(`Beta v${version}\nBeta 版增加了错题功能，可体验错题标记、分类和到期复习。`)
      buttons.push("下载 Beta 版")
      actions.push({ release: betaUpdate, asset })
    }
    const result = await popup({
      title: stableUpdate ? "发现插件更新" : "Beta 版可用",
      message: message.join("\n\n"),
      buttons,
      canCancel: false,
      multiLine: true
    })
    if (result.buttonIndex === 0) return "cancel"
    if (result.buttonIndex === 1) return "back"
    const action = actions[result.buttonIndex]
    if (action) {
      await downloadAndSave(action.release, action.asset)
      return "saved"
    }
    return "none"
  } catch (error) {
    MN.error(error)
    if (interactive) showHUD(`检查更新失败：${String(error)}`, 5)
    return "none"
  }
}

export function scheduleAutomaticUpdateCheck(): void {
  void delay(3).then(() => checkForUpdates(false))
}
