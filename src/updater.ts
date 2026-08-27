import { delay, fetch, MN, popup, saveFile, showHUD } from "marginnote"
import { backupBindings } from "./store"
import { compareVersions } from "./version"

const GITHUB_RELEASES_API = `https://api.github.com/repos/${__GITHUB_REPOSITORY__}/releases?per_page=10`
const GITEE_RELEASES_API = "https://gitee.com/api/v5/repos/baidreams/CardLink/releases?per_page=10"
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
  source?: "github" | "gitee"
}

function releaseHeaders(source: "github" | "gitee"): Record<string, string> {
  return {
    Accept: source === "github" ? "application/vnd.github+json" : "application/json",
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

function newestRelease(releases: GitHubRelease[], source: "github" | "gitee"): GitHubRelease | undefined {
  const currentUsesPrereleaseChannel = __APP_VERSION__.includes("-")
  const release = releases
    .filter((item: GitHubRelease) =>
      !item.draft && releaseVersion(item) &&
      (currentUsesPrereleaseChannel || !item.prerelease)
    )
    .sort((a: GitHubRelease, b: GitHubRelease) =>
      compareVersions(releaseVersion(b), releaseVersion(a))
    )[0]
  return release ? { ...release, source } : undefined
}

async function fetchReleases(source: "github" | "gitee"): Promise<GitHubRelease[]> {
  const url = source === "github" ? GITHUB_RELEASES_API : GITEE_RELEASES_API
  const response = await fetch(url, { headers: releaseHeaders(source), timeout: 20 })
  const releases = response.json()
  if (!Array.isArray(releases)) throw new Error(`${source === "github" ? "GitHub" : "Gitee"} Releases 返回格式异常`)
  return releases
}

async function fetchNewestRelease(onGitHubFailure?: () => void): Promise<GitHubRelease | undefined> {
  try {
    return newestRelease(await fetchReleases("github"), "github")
  } catch (githubError) {
    MN.error(githubError)
    onGitHubFailure?.()
    try {
      return newestRelease(await fetchReleases("gitee"), "gitee")
    } catch (giteeError) {
      throw new Error(`GitHub 与 Gitee 均检查失败：${String(giteeError)}`)
    }
  }
}

async function downloadAsset(release: GitHubRelease, asset: ReleaseAsset): Promise<string> {
  const url = asset.browser_download_url
  const tempPath = MN.app.tempPath
  if (!url || !tempPath) throw new Error("更新包地址或临时目录不可用")
  showHUD("正在下载插件更新…", 3)
  const response = await fetch(url, {
    headers: { ...releaseHeaders(release.source ?? "github"), Accept: "application/octet-stream" },
    timeout: 60
  })
  const fileName = asset.name || `mn4-answer-matcher-v${releaseVersion(release)}.mnaddon`
  const path = `${tempPath.replace(/\/$/, "")}/${fileName}`
  if (!response.data?.length() || !response.data.writeToFileAtomically(path, true)) {
    throw new Error("更新包下载或写入失败")
  }
  return path
}

async function downloadUpdate(release: GitHubRelease, asset: ReleaseAsset): Promise<string> {
  try {
    return await downloadAsset(release, asset)
  } catch (githubError) {
    if (release.source === "gitee") throw githubError
    MN.error(githubError)
    const version = releaseVersion(release)
    const giteeRelease = (await fetchReleases("gitee"))
      .find(item => releaseVersion(item) === version)
    const giteeAsset = giteeRelease && installableAsset(giteeRelease)
    if (!giteeRelease || !giteeAsset) throw githubError
    showHUD("GitHub 下载失败，正在从 Gitee 下载…", 3)
    return downloadAsset({ ...giteeRelease, source: "gitee" }, giteeAsset)
  }
}

async function downloadAndSave(release: GitHubRelease, asset: ReleaseAsset): Promise<void> {
  const path = await downloadUpdate(release, asset)
  backupBindings()
  showHUD("更新包已下载，请选择保存位置；之后点开 .mnaddon 文件手动安装", 5)
  saveFile(path, "public.data")
}

export async function checkForUpdates(interactive = true): Promise<void> {
  try {
    if (!interactive && Date.now() - lastCheckTime() < AUTO_CHECK_INTERVAL) return
    rememberCheck()
    if (interactive) showHUD("正在检查 GitHub 更新…", 2)
    const release = await fetchNewestRelease(() => {
      if (interactive) showHUD("GitHub 检查失败，正在检查 Gitee…", 3)
    })
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
    const sourceLabel = release.source === "gitee" ? "Gitee 备用源" : "GitHub"
    const result = await popup({
      title: `发现${channel} v${version}`,
      message: `当前版本：v${__APP_VERSION__}\n来源：${sourceLabel}\n\n${notes}`,
      buttons: ["下载并手动安装"],
      canCancel: true,
      multiLine: true
    })
    if (result.buttonIndex === 0) await downloadAndSave(release, asset)
  } catch (error) {
    MN.error(error)
    if (interactive) showHUD(`检查更新失败：${String(error)}`, 5)
  }
}

export function scheduleAutomaticUpdateCheck(): void {
  void delay(3).then(() => checkForUpdates(false))
}
