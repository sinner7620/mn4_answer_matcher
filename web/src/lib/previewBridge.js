const DAY = 86400000
const levelDays = [1, 1, 3, 7, 30, 60]

function dateFromNow(days) {
  return new Date(Date.now() + days * DAY).toISOString()
}

const records = [
  {
    recordId: "questions:q1",
    sourceNoteId: "q1",
    sourceNotebookId: "questions",
    sourceNotebookTitle: "多元微分",
    sourceTitle: "1994数一",
    sourcePathTitles: ["基本概念题", "偏导与连续"],
    categoryPath: ["多元微分", "基本概念题", "偏导与连续"],
    categoryLabel: "多元微分 › 基本概念题 › 偏导与连续",
    categoryKeys: [],
    level: 1,
    createdAt: dateFromNow(-6),
    updatedAt: dateFromNow(-2),
    lastReviewedAt: dateFromNow(-2),
    nextReviewAt: dateFromNow(-1),
    reviewCount: 1,
    history: [],
    noteAvailable: true
  },
  {
    recordId: "questions:q2",
    sourceNoteId: "q2",
    sourceNotebookId: "questions",
    sourceNotebookTitle: "多元微分",
    sourceTitle: "2002数一 · 条件极值",
    sourcePathTitles: ["极值问题", "条件极值"],
    categoryPath: ["多元微分", "极值问题", "条件极值"],
    categoryLabel: "多元微分 › 极值问题 › 条件极值",
    categoryKeys: [],
    level: 2,
    createdAt: dateFromNow(-4),
    updatedAt: dateFromNow(-3),
    lastReviewedAt: dateFromNow(-3),
    nextReviewAt: dateFromNow(-0.1),
    reviewCount: 0,
    history: [],
    noteAvailable: true
  },
  {
    recordId: "practice:q3",
    sourceNoteId: "q3",
    sourceNotebookId: "practice",
    sourceNotebookTitle: "强化练习",
    sourceTitle: "26版660第239题 · 方向导数",
    sourcePathTitles: ["多元微分", "方向导数"],
    categoryPath: ["强化练习", "多元微分", "方向导数"],
    categoryLabel: "强化练习 › 多元微分 › 方向导数",
    categoryKeys: [],
    level: 3,
    createdAt: dateFromNow(-3),
    updatedAt: dateFromNow(-1),
    lastReviewedAt: dateFromNow(-1),
    nextReviewAt: dateFromNow(5),
    reviewCount: 0,
    history: [],
    noteAvailable: true
  },
  {
    recordId: "questions:q4",
    sourceNoteId: "q4",
    sourceNotebookId: "questions",
    sourceNotebookTitle: "多元微分",
    sourceTitle: "2010数一 · 隐函数二阶偏导",
    sourcePathTitles: ["隐函数", "高阶偏导"],
    categoryPath: ["多元微分", "隐函数", "高阶偏导"],
    categoryLabel: "多元微分 › 隐函数 › 高阶偏导",
    categoryKeys: [],
    level: 4,
    createdAt: dateFromNow(-20),
    updatedAt: dateFromNow(-10),
    lastReviewedAt: dateFromNow(-10),
    nextReviewAt: dateFromNow(20),
    reviewCount: 1,
    history: [],
    noteAvailable: true
  },
  {
    recordId: "past:q5",
    sourceNoteId: "q5",
    sourceNotebookId: "past",
    sourceNotebookTitle: "真题分类",
    sourceTitle: "2018数一 · 二重积分换元",
    sourcePathTitles: ["重积分", "变量替换"],
    categoryPath: ["真题分类", "重积分", "变量替换"],
    categoryLabel: "真题分类 › 重积分 › 变量替换",
    categoryKeys: [],
    level: 5,
    createdAt: dateFromNow(-80),
    updatedAt: dateFromNow(-18),
    lastReviewedAt: dateFromNow(-18),
    nextReviewAt: dateFromNow(42),
    reviewCount: 2,
    history: [],
    noteAvailable: true
  }
]

function workbench() {
  const now = Date.now()
  return {
    records,
    dueCount: records.filter(record => record.noteAvailable && new Date(record.nextReviewAt).getTime() <= now).length,
    levelCounts: [0, 1, 2, 3, 4, 5].map(level => records.filter(record => record.level === level).length),
    categories: [],
    migratedFromLegacy: 0
  }
}

const questionHtml = `<!doctype html><html><body style="font-family:-apple-system;padding:24px;color:#1f2937"><h2>1994数一</h2><p>设二元函数 f(x,y) 在点 (x₀,y₀) 处的两个偏导数存在，判断该函数在该点连续的充分性与必要性。</p><div style="margin-top:20px;padding:18px;background:#f5f7fb;border-radius:12px">这里显示 MarginNote 原题卡片的完整摘录、图片、评论与手写内容。</div></body></html>`
const answerHtml = `<!doctype html><html><body style="font-family:-apple-system;padding:24px;color:#1f2937"><h2>实时答案</h2><p>两个偏导数存在，既不是函数在该点连续的充分条件，也不是必要条件。</p><div style="margin-top:20px;padding:18px;background:#f4f8f5;border-radius:12px">实际插件会从原题脑图当前绑定的答案脑图读取完整答案卡片。</div></body></html>`

function detail(recordId) {
  const record = records.find(item => item.recordId === recordId)
  if (!record) throw new Error("错题记录不存在")
  return {
    record,
    questionHtml,
    answers: [{ id: `answer:${record.sourceNoteId}`, title: `${record.sourceTitle} · 标准答案`, path: "答案脑图 › 标准答案", html: answerHtml }],
    answerStatus: "ready"
  }
}

export async function previewSend(command, payload = null) {
  if (command === "dashboard") return { version: "2.2.0-beta.7 · 浏览器预览", mistakes: workbench() }
  if (command === "mistakes") return workbench()
  if (command === "mistakeDetail") return detail(String(payload?.recordId ?? ""))
  if (command === "reviewMistake") {
    const record = records.find(item => item.recordId === String(payload?.recordId ?? ""))
    if (!record) throw new Error("错题记录不存在")
    record.level = Math.max(0, Math.min(5, Number(payload?.level) || 0))
    record.lastReviewedAt = new Date().toISOString()
    record.updatedAt = record.lastReviewedAt
    record.nextReviewAt = dateFromNow(levelDays[record.level])
    record.reviewCount += 1
    return record
  }
  if (command === "setMistakeCategory") {
    const record = records.find(item => item.recordId === String(payload?.recordId ?? ""))
    if (record) record.manualCategory = String(payload?.category ?? "")
    return record
  }
  if (command === "removeMistake") {
    const index = records.findIndex(item => item.recordId === String(payload?.recordId ?? ""))
    if (index >= 0) records.splice(index, 1)
    return { removed: true }
  }
  if (command === "exportMistakes") {
    const chosen = records.filter(item => !payload?.recordIds?.length || payload.recordIds.includes(item.recordId))
    if (!chosen.length) throw new Error("当前导出范围没有可用错题")
    const extension = payload?.format === "md" ? "md" : "pdf"
    const filename = `${String(payload?.filename || "MN4错题导出").replace(/\.(md|pdf)$/i, "")}.${extension}`
    const link = document.createElement("a")
    if (extension === "pdf") {
      link.href = "/export-demo/sample/mn4-mistakes-demo.pdf"
    } else {
      const markdown = [`# MN4 错题导出`, "", ...chosen.flatMap((item, index) => [`## ${index + 1}. ${item.sourceTitle}`, "", `**错题${item.level}级** · ${item.categoryLabel}`, "", `来源：${item.sourceNotebookTitle} › ${item.sourcePathTitles.join(" › ")}`, "", "### 原题卡片", "", questionHtml, "", "### 实时匹配答案", "", answerHtml, "", "---", ""])]
      link.href = URL.createObjectURL(new Blob([markdown.join("\n")], { type: "text/markdown;charset=utf-8" }))
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    }
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    return { saved: true, format: extension, filename, count: chosen.length }
  }
  return { preview: true }
}
