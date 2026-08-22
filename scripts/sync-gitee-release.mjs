// scripts/sync-gitee-release.mjs
// 将 GitHub Release 自动同步到 Gitee 发布镜像（release-only 仓库，不含源代码）。
// 由 .github/workflows/release.yml 在打 tag 发布后调用；也可本地手动执行。
//
// 环境变量：
//   GITEE_TOKEN   Gitee 私人令牌（必须，需 projects + releases 权限）
//   GITEE_REPO    目标仓库，默认 baidreams/CardLink
//   RELEASE_TAG   版本标签，如 v1.9.10
//
// 行为：
//   - 若 Gitee 上已存在同名 release，则跳过（幂等，可安全重跑）
//   - 标签创建在 Gitee 默认分支 main 上（该分支仅为 README 提交，不含源代码）
//   - 上传 dist/mn4-answer-matcher-${RELEASE_TAG}.mnaddon 作为附件
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"

const token = process.env.GITEE_TOKEN
const repo = process.env.GITEE_REPO || "baidreams/CardLink"
const tag = process.env.RELEASE_TAG
const notesFile = process.env.RELEASE_NOTES_FILE || `RELEASE_NOTES_${tag}.md`

if (!token) {
  console.log("SKIP: GITEE_TOKEN 未配置，跳过 Gitee 同步")
  process.exit(0)
}
if (!tag) {
  console.error("错误：缺少 RELEASE_TAG 环境变量")
  process.exit(1)
}

const api = `https://gitee.com/api/v5/repos/${repo}`
const jsonHeaders = { "Content-Type": "application/json;charset=UTF-8" }

async function findArtifact() {
  const dist = path.join(process.cwd(), "dist")
  const exact = path.join(dist, `mn4-answer-matcher-${tag}.mnaddon`)
  try {
    await readFile(exact)
    return exact
  } catch {
    /* fallthrough */
  }
  let files = []
  try {
    files = (await readdir(dist)).filter((f) => f.endsWith(".mnaddon"))
  } catch {
    /* dist 不存在 */
  }
  throw new Error(`找不到构建产物 ${exact}；dist 现有文件：${files.join(", ") || "(空)"}`)
}

async function releaseBody() {
  try {
    return await readFile(path.join(process.cwd(), notesFile), "utf8")
  } catch {
    return "MN4 跨脑图答案匹配插件安装包"
  }
}

const body = await releaseBody()

// 1) 幂等检查：同名 release 已存在则跳过
const listResp = await fetch(`${api}/releases?per_page=100&access_token=${token}`)
const list = await listResp.json().catch(() => null)
if (Array.isArray(list)) {
  const existing = list.find((r) => r.tag_name === tag)
  if (existing) {
    const updateResp = await fetch(`${api}/releases/${existing.id}?access_token=${token}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ tag_name: tag, name: `CardLink ${tag}`, body, prerelease: tag.includes("-") })
    })
    if (!updateResp.ok) throw new Error(`更新 Gitee release 说明失败 (${updateResp.status})`)
    console.log(`UPDATE: Gitee release ${tag} 已更新说明 (id=${existing.id})`)
    process.exit(0)
  }
} else {
  console.warn(`警告：查询 releases 返回异常（${listResp.status}），继续尝试创建`)
}

// 2) 创建 release（tag 自动创建在 main 上，main 仅含 README，不含源代码）
const prerelease = tag.includes("-")
const createResp = await fetch(`${api}/releases?access_token=${token}`, {
  method: "POST",
  headers: jsonHeaders,
  body: JSON.stringify({
    tag_name: tag,
    target_commitish: "main",
    name: `CardLink ${tag}`,
    body,
    prerelease,
  }),
})
if (!createResp.ok) {
  const detail = await createResp.text().catch(() => "")
  throw new Error(`创建 Gitee release 失败 (${createResp.status})：${detail}`)
}
const created = await createResp.json()
console.log(`Gitee release ${tag} 已创建 (id=${created.id})`)

// 3) 上传 .mnaddon 附件
const artifact = await findArtifact()
const form = new FormData()
form.append("file", new Blob([await readFile(artifact)]), path.basename(artifact))
const uploadResp = await fetch(`${api}/releases/${created.id}/attach_files?access_token=${token}`, {
  method: "POST",
  body: form,
})
if (!uploadResp.ok) {
  const detail = await uploadResp.text().catch(() => "")
  throw new Error(`上传附件失败 (${uploadResp.status})：${detail}`)
}
const uploaded = await uploadResp.json()
console.log(`附件已上传: ${uploaded.name}`)
