import { delay, fetch, genNSURL, MN, popup, showHUD } from "marginnote"
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

async function fetchNewestRelease(): Promise<GitHubRelease | undefined> {
  const response = await fetch(RELEASES_API, { headers: githubHeaders(), timeout: 20 })
  const releases = response.json()
  if (!Array.isArray(releases)) throw new Error("GitHub Releases 返回格式异常")
  return releases
    .filter((release: GitHubRelease) => !release.draft && releaseVersion(release))
    .sort((a: GitHubRelease, b: GitHubRelease) =>
      compareVersions(releaseVersion(b), releaseVersion(a))
    )[0]
}

async function downloadAndInstall(release: GitHubRelease, asset: ReleaseAsset): Promise<void> {
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

  // Persist a second copy outside the add-on-local storage before MarginNote replaces the bundle.
  backupBindings()
  showHUD("更新包已下载，正在交给 MarginNote 安装…", 4)
  let fileURL
  try {
    // Foundation classes are JSBridge globals on iPad, not module exports.
    fileURL = typeof NSURL !== "undefined" && NSURL.fileURLWithPath
      ? NSURL.fileURLWithPath(path)
      : undefined
  } catch {
    fileURL = undefined
  }
  MN.app.openURL(fileURL ?? genNSURL(`file://${path}`, true))
}

export async function checkForUpdates(interactive = true): Promise<void> {
  try {
    if (!interactive && Date.now() - lastCheckTime() < AUTO_CHECK_INTERVAL) return
    rememberCheck()
    if (interactive) showHUD("正在检查 GitHub 更新…", 2)
    const release = await fetchNewestRelease()
    if (!release) {
      if (interactive) showHUD("GitHub 上暂时没有可用版本", 3)
      return
    }
    const version = releaseVersion(release)
    if (compareVersions(version, __APP_VERSION__) <= 0) {
      if (interactive) showHUD(`当前已是最新版本 v${__APP_VERSION__}`, 3)
      return
    }
    const asset = installableAsset(release)
    if (!asset) throw new Error(`v${version} Release 中没有 .mnaddon 安装包`)
    const channel = release.prerelease ? "测试版" : "正式版"
    const notes = String(release.body ?? "暂无更新说明").trim().slice(0, 900)
    const result = await popup({
      title: `发现${channel} v${version}`,
      message: `当前版本：v${__APP_VERSION__}\n\n${notes}`,
      buttons: ["稍后", "下载并安装"],
      canCancel: true,
      multiLine: true
    })
    if (result.buttonIndex === 1) await downloadAndInstall(release, asset)
  } catch (error) {
    MN.error(error)
    if (interactive) showHUD(`检查更新失败：${String(error)}`, 5)
  }
}

export function scheduleAutomaticUpdateCheck(): void {
  void delay(3).then(() => checkForUpdates(false))
}
