const DAY = 86400000
const levelDays = [1, 1, 3, 7, 30, 60]
let customCategories = ["计算题", "概念辨析", "需要重做"]
let debugModeEnabled = false
let experimentalGlassEnabled = false

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
    manualCategories: ["概念辨析", "需要重做"],
    manualCategory: "概念辨析",
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
    migratedFromLegacy: 0,
    reviewCurves: { 0: [1], 1: [1], 2: [3], 3: [7, 14], 4: [30], 5: [60] },
    customCategories
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
  if (command === "dashboard") return {
    version: "2.3.3-beta.1 · 完整界面预览",
    mistakes: workbench(),
    matching: {
      scopedBinding: true,
      mode: "title",
      matchedGroups: 0,
      pairs: 0,
      regexRules: { questionPattern: "", answerPattern: "" },
      debugModeEnabled,
      experimentalGlassEnabled
    }
  }
  if (command === "mistakes") return workbench()
  if (command === "setDebugMode") {
    debugModeEnabled = payload?.enabled === true
    if (!debugModeEnabled) experimentalGlassEnabled = false
    return { enabled: debugModeEnabled }
  }
  if (command === "setExperimentalGlass") {
    if (!debugModeEnabled) throw new Error("请先开启调试模式")
    experimentalGlassEnabled = payload?.enabled === true
    return { enabled: experimentalGlassEnabled }
  }
  if (command === "testTelemetryPost") return {
    test: true,
    testedAt: new Date().toISOString(),
    payload: { test: true, content: "MN4 调试模式 POST 连通性测试内容，不计入正式上报" },
    results: [
      { endpoint: "https://telemetry.2608204.xyz/ping", domain: "telemetry.2608204.xyz", reachable: true, accepted: true, statusCode: 204, durationMs: 61 },
      { endpoint: "https://cardlink.cn.eu.org/ping", domain: "cardlink.cn.eu.org", reachable: true, accepted: true, statusCode: 204, durationMs: 83 },
      { endpoint: "https://mnrails-telemetry.mr-wuyzhn.workers.dev/ping", domain: "mnrails-telemetry.mr-wuyzhn.workers.dev", reachable: true, accepted: true, statusCode: 204, durationMs: 116 }
    ]
  }
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
  if (command === "reviewMistakes") {
    const ids = new Set((payload?.recordIds || []).map(String))
    const changed = []
    for (const record of records) {
      if (!ids.has(record.recordId)) continue
      record.level = Math.max(0, Math.min(5, Number(payload?.level) || 0))
      record.lastReviewedAt = new Date().toISOString()
      record.updatedAt = record.lastReviewedAt
      record.nextReviewAt = dateFromNow(levelDays[record.level])
      record.reviewCount += 1
      changed.push(record)
    }
    return { changed: changed.length, missing: ids.size - changed.length, records: changed }
  }
  if (command === "setMistakeCategory") {
    const record = records.find(item => item.recordId === String(payload?.recordId ?? ""))
    if (record) {
      const next = Array.isArray(payload?.categories) ? payload.categories.map(String) : [String(payload?.category ?? "")].filter(Boolean)
      record.manualCategories = [...new Set(next)]
      record.manualCategory = record.manualCategories[0]
      customCategories = [...new Set([...customCategories, ...record.manualCategories])]
    }
    return record
  }
  if (command === "deleteMistakeTag") {
    const tag = String(payload?.tag ?? "")
    customCategories = customCategories.filter(item => item !== tag)
    let changed = 0
    for (const record of records) {
      const previous = record.manualCategories || (record.manualCategory ? [record.manualCategory] : [])
      if (!previous.includes(tag)) continue
      record.manualCategories = previous.filter(item => item !== tag)
      record.manualCategory = record.manualCategories[0]
      changed++
    }
    return { tag, changed }
  }
  if (command === "removeMistake") {
    const index = records.findIndex(item => item.recordId === String(payload?.recordId ?? ""))
    if (index >= 0) records.splice(index, 1)
    return { removed: true }
  }
  if (command === "removeMistakes") {
    const ids = new Set((payload?.recordIds || []).map(String))
    const removed = []
    for (let index = records.length - 1; index >= 0; index--) {
      if (!ids.has(records[index].recordId)) continue
      removed.push(...records.splice(index, 1))
    }
    return { changed: removed.length, missing: ids.size - removed.length, records: removed }
  }
  if (command === "saveMistakeReviewCurves") return payload?.curves || workbench().reviewCurves
  if (command === "previewMistakeExport") {
    const chosen = records.filter(item => !payload?.recordIds?.length || payload.recordIds.includes(item.recordId))
    if (!chosen.length) throw new Error("当前预览范围没有可用错题")
    if (payload?.format === "md") {
      const markdown = [`# MN4 错题导出`, "", ...chosen.flatMap((item, index) => [`## ${index + 1}. ${item.sourceTitle}`, "", `来源：${item.sourceNotebookTitle} › ${item.sourcePathTitles.join(" › ")}`, "", "### 原题卡片", "", "题目卡片正文", "", "### 实时匹配答案", "", "答案卡片正文", "", "---", ""])]
      return { preview: true, format: "md", count: chosen.length, markdown: markdown.join("\n") }
    }
    const include = { question: true, answer: true, source: true, review: false, ...(payload?.include || {}) }
    const question = (item, index) => `<article class="mistake question-unit"><header><b>${index + 1}.</b><h1>${item.sourceTitle}</h1></header>${include.source ? `<small>来源：${item.sourceNotebookTitle} › ${item.sourcePathTitles.join(" › ")}</small>` : ""}${include.question ? `<div class="card">${questionHtml}</div>` : ""}<div class="writing-space"></div></article>`
    const answer = (item, index) => `<article class="mistake answer-unit"><header><b>答案 ${index + 1}</b><h1>${item.sourceTitle}</h1></header><div class="card">${answerHtml}</div></article>`
    const questions = chosen.map(question)
    const answers = include.answer ? chosen.map(answer) : []
    const perPage = payload?.pageLayout === "one-per-page" ? 1 : payload?.pageLayout === "two-per-page" ? 2 : payload?.pageLayout === "three-per-page" ? 3 : 0
    const flow = (blocks, className) => blocks.length ? `<section class="pdf-flow ${className}">${blocks.map(block => `<div class="pdf-slot">${block}</div>`).join("")}</section>` : ""
    let content
    if (!perPage) {
      const blocks = payload?.answerLayout === "questions-first" ? [...questions, ...answers] : chosen.map((item, index) => `${question(item, index)}${include.answer ? answer(item, index) : ""}`)
      content = flow(blocks, "pdf-compact-flow")
    }
    else {
      const pages = Array.from({ length: Math.ceil(questions.length / perPage) }, (_, page) => {
        const start = page * perPage
        const pageQuestions = questions.slice(start, start + perPage)
        const questionPage = `<section class="pdf-page slots-${perPage}">${pageQuestions.map(block => `<div class="pdf-slot">${block}</div>`).join("")}</section>`
        return payload?.answerLayout === "interleaved" ? questionPage + flow(answers.slice(start, start + pageQuestions.length), "pdf-answer-flow") : questionPage
      })
      content = pages.join("") + (payload?.answerLayout === "questions-first" ? flow(answers, "pdf-answer-flow") : "")
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;background:#fff}body{width:186mm;font:12px/1.55 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#172033}.pdf-flow .pdf-slot+.pdf-slot{margin-top:1.55em}.pdf-flow{width:186mm}.pdf-answer-flow{padding:2mm 1mm}.pdf-page{width:186mm;min-height:273mm;display:grid}.slots-1{grid-template-rows:1fr}.slots-2{grid-template-rows:repeat(2,minmax(0,1fr))}.slots-3{grid-template-rows:repeat(3,minmax(0,1fr))}.pdf-page .pdf-slot{padding:3mm 1mm}.mistake{padding:3mm 1mm}.mistake header{display:flex;align-items:baseline;gap:8px}.mistake h1{font-size:18px;margin:0}.mistake small{color:#7b8494}.card{margin-top:8px;padding:12px;background:#f4f6f9;border-radius:6px}.writing-space{height:${payload?.pageLayout === "one-per-page" ? "80mm" : payload?.pageLayout === "two-per-page" ? "35mm" : payload?.pageLayout === "three-per-page" ? "16mm" : "0"}}.answer-unit{margin-top:8px}</style></head><body class="layout-${payload?.pageLayout || "compact"}">${content}</body></html>`
    return { preview: true, format: "pdf", count: chosen.length, html }
  }
  if (command === "exportMistakes") {
    const chosen = records.filter(item => !payload?.recordIds?.length || payload.recordIds.includes(item.recordId))
    if (!chosen.length) throw new Error("当前导出范围没有可用错题")
    const extension = payload?.format === "md" ? "md" : "pdf"
    const filename = `${String(payload?.filename || "MN4错题导出").replace(/\.(md|pdf)$/i, "")}.${extension}`
    const link = document.createElement("a")
    if (extension === "pdf") return { printPanel: true, printCompleted: true, format: "pdf", filename, count: chosen.length }
    else {
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
