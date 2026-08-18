import { readFile, readdir } from "node:fs/promises"
import path from "node:path"

const token = process.env.GITEE_TOKEN
const repo = process.env.GITEE_REPO || "baidreams/CardLink"
const tag = process.env.RELEASE_TAG
const notesFile = process.env.RELEASE_NOTES_FILE || (tag ? `RELEASE_NOTES_${tag}.md` : "")

if (!token) {
  console.log("SKIP: GITEE_TOKEN 未配置，跳过 Gitee 同步")
  process.exit(0)
}
if (!tag) throw new Error("缺少 RELEASE_TAG 环境变量")

function apiUrl(suffix) {
  const url = new URL(`https://gitee.com/api/v5/repos/${repo}${suffix}`)
  url.searchParams.set("access_token", token)
  return url
}

async function findArtifact() {
  const dist = path.join(process.cwd(), "dist")
  const exact = path.join(dist, `mn4-answer-matcher-${tag}.mnaddon`)
  try {
    await readFile(exact)
    return exact
  } catch {}
  const files = await readdir(dist).catch(() => [])
  throw new Error(`找不到构建产物 ${exact}；dist 现有文件：${files.join(", ") || "(空)"}`)
}

async function releaseBody() {
  if (!notesFile) return ""
  try {
    return await readFile(path.join(process.cwd(), notesFile), "utf8")
  } catch {
    return "MN4 跨脑图答案匹配插件安装包"
  }
}

async function uploadArtifact(releaseId) {
  const artifact = await findArtifact()
  const fileName = path.basename(artifact)
  const attachmentsResp = await fetch(apiUrl(`/releases/${releaseId}/attach_files`))
  if (!attachmentsResp.ok) {
    throw new Error(`查询 Gitee Release 附件失败 (${attachmentsResp.status})：${await attachmentsResp.text().catch(() => "")}`)
  }
  const attachments = await attachmentsResp.json().catch(() => [])
  if (Array.isArray(attachments)) {
    const existingAssets = attachments.filter(item => item?.name === fileName && item?.id)
    for (const asset of existingAssets) {
      const deleteResp = await fetch(apiUrl(`/releases/${releaseId}/attach_files/${asset.id}`), { method: "DELETE" })
      if (!deleteResp.ok) {
        throw new Error(`删除旧 Gitee Release 附件失败 (${deleteResp.status})：${await deleteResp.text().catch(() => "")}`)
      }
      console.log(`旧附件已删除: ${fileName}`)
    }
  }
  const form = new FormData()
  form.append("file", new Blob([await readFile(artifact)]), fileName)
  const uploadResp = await fetch(apiUrl(`/releases/${releaseId}/attach_files`), {
    method: "POST",
    body: form,
  })
  if (!uploadResp.ok) {
    throw new Error(`上传附件失败 (${uploadResp.status})：${await uploadResp.text().catch(() => "")}`)
  }
  const uploaded = await uploadResp.json()
  console.log(`附件已上传: ${uploaded.name}`)
}

const listResp = await fetch(apiUrl("/releases?per_page=100"))
const list = await listResp.json().catch(() => null)
if (Array.isArray(list)) {
  const existing = list.find(item => item.tag_name === tag)
  if (existing) {
    console.log(`UPDATE: Gitee release ${tag} 已存在 (id=${existing.id})，保留说明并替换安装包附件`)
    await uploadArtifact(existing.id)
    process.exit(0)
  }
}

const body = await releaseBody()
const createResp = await fetch(apiUrl("/releases"), {
  method: "POST",
  headers: { "Content-Type": "application/json;charset=UTF-8" },
  body: JSON.stringify({
    tag_name: tag,
    target_commitish: "main",
    name: `CardLink ${tag}`,
    body,
    prerelease: tag.includes("-"),
  }),
})
if (!createResp.ok) {
  throw new Error(`创建 Gitee release 失败 (${createResp.status})：${await createResp.text().catch(() => "")}`)
}
const created = await createResp.json()
console.log(`Gitee release ${tag} 已创建 (id=${created.id})`)
await uploadArtifact(created.id)
