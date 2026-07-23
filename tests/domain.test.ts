import assert from "node:assert/strict"
import test from "node:test"
import {
  buildIndex,
  extractAnswer,
  normalizeTitle,
  pathMatchScore,
  rankAnswers
} from "../src/domain"
import { readSafeNote } from "../src/safe-note"
import { renderCardHtml } from "../src/card-html"
import { compareVersions } from "../src/version"
import { freePositionFrame, isFrameFullyOutside } from "../src/answer-card-layout"
import { noteReferenceUrl } from "../src/note-link"
import {
  bindingKey,
  getBinding,
  getBindingForMode,
  normalizeBinding,
  setBinding,
  targetForMode
} from "../src/binding"
import {
  buildOrderedPairing,
  normalizeParentTitle
} from "../src/ordered-pairing-domain"
import {
  extractAnswerRegexKey,
  extractQuestionRegexKey,
  validateRegexMatchingRules
} from "../src/regex-matching"
import { scopeKey } from "../src/scope-key"
import { isSelectableMindMapRoot } from "../src/mindmap-candidate"
import { buildSourceInsights } from "../src/source-insights"
import {
  categoryPathPrefixes,
  createMistakeRecord,
  compareMistakeRecords,
  isDue,
  mistakeCategoryLabel,
  nextReviewTime,
  reviewMistake
} from "../src/mistake-domain"

test("同一学习集中的不同脑图可保存独立答案绑定并兼容旧绑定", () => {
  const bindings: any = { questions: "legacy-answers" }
  assert.deepEqual(getBinding(bindings, "questions", "root-a"), { notebookId: "legacy-answers" })
  setBinding(bindings, "questions", "root-a", {
    notebookId: "same-study-set",
    rootNodeId: "answer-root-a"
  })
  assert.deepEqual(getBinding(bindings, "questions", "root-a"), {
    notebookId: "same-study-set",
    rootNodeId: "answer-root-a"
  })
  assert.deepEqual(getBinding(bindings, "questions", "root-b"), { notebookId: "legacy-answers" })
  assert.equal(bindingKey("questions", "root-a"), "questions::root::root-a")
  assert.equal(scopeKey({ notebookId: "same-study-set", rootNodeId: "answer-root-a" }), "same-study-set::root::answer-root-a")
})

test("绑定模式关闭时使用整个学习集，开启时限定具体脑图", () => {
  const bindings: any = {
    questions: "whole-answer-set",
    [bindingKey("questions", "question-root")]: {
      notebookId: "scoped-answer-set",
      rootNodeId: "answer-root"
    }
  }
  assert.deepEqual(getBindingForMode(bindings, "questions", "question-root", false), {
    notebookId: "whole-answer-set"
  })
  const scoped = getBindingForMode(bindings, "questions", "question-root", true)!
  assert.equal(scoped.rootNodeId, "answer-root")
  assert.deepEqual(targetForMode(scoped, false), { notebookId: "scoped-answer-set" })
})

test("绑定记录可保存章节顺序匹配方式和固定卡片 ID", () => {
  const target = normalizeBinding({
    notebookId: "answers",
    rootNodeId: "answer-root",
    matchMode: "parent-order",
    orderedPairing: {
      sourceNotebookId: "questions",
      sourceRootNodeId: "question-root",
      answerNotebookId: "answers",
      answerRootNodeId: "answer-root",
      createdAt: "2026-07-23T00:00:00.000Z",
      matchedGroups: 1,
      pairs: [{
        questionNodeId: "q1",
        questionNoteId: "qn1",
        answerNodeId: "a1",
        answerNoteId: "an1",
        parentTitle: "绪论",
        position: 0
      }]
    }
  })
  assert.equal(target?.matchMode, "parent-order")
  assert.equal(target?.orderedPairing?.pairs[0].answerNoteId, "an1")
})

test("绑定记录可保存独立正则模式和题目、答案规则", () => {
  const target = normalizeBinding({
    notebookId: "answers",
    matchMode: "regex",
    regexRules: {
      questionPattern: String.raw`第(\d+)题`,
      answerPattern: String.raw`答案-(\d+)`
    }
  })
  assert.equal(target?.matchMode, "regex")
  assert.equal(target?.regexRules?.questionPattern, String.raw`第(\d+)题`)
  assert.deepEqual(targetForMode(target!, false), target)
})

test("正则模式未填写规则时仍保留待配置状态", () => {
  const target = normalizeBinding({
    notebookId: "answers",
    matchMode: "regex"
  })
  assert.equal(target?.matchMode, "regex")
  assert.equal(target?.regexRules, undefined)
  assert.deepEqual(targetForMode(target!, false), target)
})

test("正则题目规则和答案规则独立提取相同匹配键", () => {
  const rules = {
    questionPattern: String.raw`第\s*(\d+)\s*章.*?第\s*(\d+)\s*题`,
    answerPattern: String.raw`答案\s*(\d+)-0*(\d+)`
  }
  assert.equal(extractQuestionRegexKey("第 3 章 第 12 题：弯曲", rules), "3\u001f12")
  assert.equal(extractAnswerRegexKey("答案 3-012", rules), "3\u001f12")
})

test("正则规则没有捕获组时使用完整匹配且无效表达式会被拒绝", () => {
  const fullMatchRules = {
    questionPattern: String.raw`Q-\d+`,
    answerPattern: String.raw`Q-\d+`
  }
  assert.equal(extractQuestionRegexKey("题目 Q-17", fullMatchRules), "q-17")
  assert.equal(validateRegexMatchingRules(fullMatchRules).valid, true)
  assert.equal(validateRegexMatchingRules({
    questionPattern: "(",
    answerPattern: String.raw`(\d+)`
  }).valid, false)
  assert.equal(validateRegexMatchingRules({
    questionPattern: String.raw`(a+)+`,
    answerPattern: String.raw`(\d+)`
  }).valid, false)
})

test("纯章节名与带标题章节名都能规范化用于父节点匹配", () => {
  assert.equal(normalizeParentTitle("第一章"), normalizeTitle("第一章"))
  assert.equal(normalizeParentTitle("第一章 绪论"), normalizeTitle("绪论"))
})

test("同名父节点仅在两侧直接子卡片数量相同时按顺序配对", () => {
  const child = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => ({
      nodeId: `${prefix}-node-${index}`,
      noteId: `${prefix}-note-${index}`,
      title: `${prefix}${index + 1}`
    }))
  const result = buildOrderedPairing(
    [
      { nodeId: "q-intro", title: "绪论与基本变形概念", children: child("q", 2) },
      { nodeId: "q-twist", title: "扭转", children: child("qt", 2) }
    ],
    [
      { nodeId: "a-intro", title: "第一部分 绪论", children: child("a", 2) },
      { nodeId: "a-twist", title: "扭转", children: child("at", 3) }
    ],
    {
      sourceNotebookId: "questions",
      sourceRootNodeId: "question-root",
      answerNotebookId: "answers",
      answerRootNodeId: "answer-root",
      createdAt: "2026-07-23T00:00:00.000Z"
    }
  )
  assert.equal(result.pairing.matchedGroups, 1)
  assert.deepEqual(
    result.pairing.pairs.map(pair => [pair.questionNodeId, pair.answerNodeId]),
    [["q-node-0", "a-node-0"], ["q-node-1", "a-node-1"]]
  )
  assert.deepEqual(
    result.previews.map(preview => [preview.parentTitle, preview.position, preview.questionTitle, preview.answerTitle]),
    [["绪论与基本变形概念", 0, "q1", "a1"], ["绪论与基本变形概念", 1, "q2", "a2"]]
  )
  assert.deepEqual(
    result.issues.map(issue => [issue.title, issue.reason, issue.sourceCount, issue.answerCount]),
    [["扭转", "count", 2, 3]]
  )
})

test("父节点标题重复时不进行不确定的顺序配对", () => {
  const group = (nodeId: string, title: string) => ({
    nodeId,
    title,
    children: [{
      nodeId: `${nodeId}-child`,
      noteId: `${nodeId}-note`,
      title: "卡片"
    }]
  })
  const result = buildOrderedPairing(
    [group("q1", "第一章 绪论"), group("q2", "绪论")],
    [group("a1", "第一部分 绪论")],
    {
      sourceNotebookId: "questions",
      sourceRootNodeId: "question-root",
      answerNotebookId: "answers",
      answerRootNodeId: "answer-root"
    }
  )
  assert.equal(result.pairing.pairs.length, 0)
  assert.equal(result.issues[0].reason, "ambiguous")
})

test("绑定候选排除无标题内部节点，只保留有标题的顶层脑图", () => {
  assert.equal(isSelectableMindMapRoot(false, "一元微分"), true)
  assert.equal(isSelectableMindMapRoot(false, "答案"), true)
  assert.equal(isSelectableMindMapRoot(false, "  "), false)
  assert.equal(isSelectableMindMapRoot(true, "普通子卡片"), false)
  assert.equal(isSelectableMindMapRoot(false, "🐙1000第九章基础22", "source", ["source", "group"]), false)
})

test("父级错题分类包含路径下的全部子级", () => {
  const options = categoryPathPrefixes(["多元微分", "基本概念题", "概念题"])
  assert.deepEqual(options.map(item => item.label), [
    "多元微分",
    "多元微分 › 基本概念题",
    "多元微分 › 基本概念题 › 概念题"
  ])
  assert.equal(options[0].key, "path:多元微分")
  assert.equal(options[2].depth, 2)
})

test("标题标准化忽略全半角、空白、常见中英文标点和大小写", () => {
  assert.equal(normalizeTitle(" Ａbc ？\n"), "abc")
  assert.equal(normalizeTitle("什么是 FFT："), normalizeTitle("什么是fft?"))
})

test("错题按来源章节和自然题号稳定排序", () => {
  const base = createMistakeRecord({
    sourceNoteId: "s2",
    sourceNotebookId: "questions",
    sourceNotebookTitle: "多元微分",
    sourceTitle: "第10题",
    sourcePathTitles: ["基本概念题"],
    categoryPath: ["多元微分", "基本概念题"],
    level: 1
  }, new Date("2026-07-17T00:00:00.000Z"))
  const first = { ...base, recordId: "questions:s1", sourceNoteId: "s1", sourceTitle: "第2题" }
  const other = {
    ...base,
    recordId: "questions:s3",
    sourceNoteId: "s3",
    sourceTitle: "第1题",
    categoryPath: ["多元微分", "计算题"]
  }
  assert.deepEqual([base, other, first].sort(compareMistakeRecords).map(item => item.recordId), ["questions:s1", "questions:s2", "questions:s3"])
  assert.equal(mistakeCategoryLabel(first), "多元微分 › 基本概念题")
})

test("错题来源分布按题目脑图根节点而不是学习集名称分组", () => {
  const records = [
    {
      recordId: "r1",
      sourceNotebookId: "study-set",
      sourceNotebookTitle: "材料力学",
      sourceRootNodeId: "root-a",
      sourceRootTitle: "第一章 拉伸",
      categoryPath: ["材料力学", "第一章 拉伸", "练习"],
      level: 0
    },
    {
      recordId: "r2",
      sourceNotebookId: "study-set",
      sourceNotebookTitle: "材料力学",
      sourceRootNodeId: "root-b",
      sourceRootTitle: "第二章 扭转",
      categoryPath: ["材料力学", "第二章 扭转", "练习"],
      level: 3
    },
    {
      recordId: "r3",
      sourceNotebookId: "study-set",
      sourceNotebookTitle: "材料力学",
      sourceRootNodeId: "root-a",
      sourceRootTitle: "第一章 拉伸",
      categoryPath: ["材料力学", "第一章 拉伸", "计算题"],
      level: 1
    }
  ]
  const sources = buildSourceInsights(records)
  assert.deepEqual(
    sources.map(source => [source.name, source.count, source.weak]),
    [["第一章 拉伸", 2, 2], ["第二章 扭转", 1, 0]]
  )
  assert.equal(sources.reduce((sum, source) => sum + source.count, 0), records.length)
  assert.deepEqual(sources[0].path, ["材料力学", "第一章 拉伸"])
})

test("同一学习集中的同名题目脑图按根节点 ID 分开显示", () => {
  const sources = buildSourceInsights([
    {
      recordId: "r1",
      sourceNotebookId: "study-set",
      sourceNotebookTitle: "题库",
      sourceRootNodeId: "root-a",
      sourceRootTitle: "习题",
      level: 0
    },
    {
      recordId: "r2",
      sourceNotebookId: "study-set",
      sourceNotebookTitle: "题库",
      sourceRootNodeId: "root-b",
      sourceRootTitle: "习题",
      level: 0
    }
  ])
  assert.equal(sources.length, 2)
  assert.deepEqual(sources.map(source => source.name), ["习题（1）", "习题（2）"])
  assert.notEqual(sources[0].key, sources[1].key)
})

test("索引同一卡片的重复标题只收录一次", () => {
  const answer = { id: "1", titles: ["问题？", "问题?"] }
  const index = buildIndex([answer])
  assert.equal(index.get("问题")?.length, 1)
})

test("标准答案标签排在普通匹配前", () => {
  const answers = [{ tags: [] }, { tags: ["标准答案"] }]
  assert.equal(rankAnswers(answers)[0], answers[1])
})

test("答案按评论、摘录、子卡片的优先级回退", () => {
  const base = { id: "1", titles: ["题"], tags: [], comments: [], excerpts: [], children: [] }
  assert.equal(extractAnswer({ ...base, comments: ["评论"], excerpts: ["摘录"] }), "评论")
  assert.equal(extractAnswer({ ...base, excerpts: ["摘录"] }), "摘录")
  assert.equal(
    extractAnswer({ ...base, children: [{ title: "定义", text: "内容" }] }),
    "【定义】\n内容"
  )
})

test("失效的合并卡片引用不会中断答案读取", () => {
  const note = {
    noteTitle: "测试题",
    excerptText: "摘录",
    comments: [
      { type: "LinkNote", noteid: "missing" },
      { type: "TextNote", text: "标准答案" }
    ],
    childNotes: []
  }
  const result = readSafeNote(note, () => undefined)
  assert.deepEqual(result.comments, ["标准答案"])
  assert.deepEqual(result.excerpts, ["摘录"])
  assert.equal(result.brokenLinks, 1)
})

test("完整卡片 HTML 包含图片摘录、图片评论和子卡片", () => {
  const note = {
    noteTitle: "答案",
    excerptPic: { paint: "excerpt-image" },
    excerptText: "OCR 文本",
    comments: [{ type: "PaintNote", paint: "comment-image" }],
    childNotes: [{ noteTitle: "子卡片", excerptText: "子卡片内容", comments: [] }]
  }
  const html = renderCardHtml(note, "问题", () => undefined, hash => `base64-${hash}`)
  assert.match(html, /base64-excerpt-image/)
  assert.match(html, /base64-comment-image/)
  assert.match(html, /子卡片内容/)
  assert.doesNotMatch(html, /OCR 文本/)
})

test("合并卡片会递归展示全部有效内容并阻止循环引用", () => {
  const first: any = {
    noteId: "first",
    noteTitle: "主卡片",
    excerptText: "主摘录",
    comments: [{ type: "LinkNote", noteid: "second" }]
  }
  const second: any = {
    noteId: "second",
    noteTitle: "合并摘录二",
    excerptText: "第二段摘录",
    comments: [
      { type: "TextNote", text: "第二段评论" },
      { type: "LinkNote", noteid: "first" }
    ]
  }
  const notes: Record<string, any> = { first, second }
  const html = renderCardHtml(first, "问题", id => notes[id], () => undefined)
  assert.match(html, /主摘录/)
  assert.match(html, /第二段摘录/)
  assert.match(html, /第二段评论/)
  assert.equal((html.match(/第二段摘录/g) ?? []).length, 1)
})

test("MN4 LinkNote 内嵌的全部合并文字、图片及评论会被展示", () => {
  const note = {
    noteTitle: "答案卡片",
    comments: [
      { type: "LinkNote", noteid: "unresolvable-1", q_htext: "合并文字摘录" },
      {
        type: "LinkNote",
        noteid: "unresolvable-2",
        q_htext: "图片 OCR",
        q_hpic: { paint: "merged-picture" }
      },
      { type: "TextNote", noteid: "unresolvable-1", text: "合并卡片文字评论" },
      {
        type: "HtmlNote",
        noteid: "unresolvable-2",
        text: "HTML 评论",
        html: "<strong>HTML 评论</strong>"
      },
      { type: "PaintNote", paint: "comment-picture" }
    ]
  }
  const html = renderCardHtml(note, "问题", () => undefined, hash => `data-${hash}`)
  assert.match(html, /合并文字摘录/)
  assert.match(html, /data-merged-picture/)
  assert.match(html, /合并卡片文字评论/)
  assert.match(html, /<strong>HTML 评论<\/strong>/)
  assert.match(html, /data-comment-picture/)
  assert.doesNotMatch(html, /图片 OCR/)
  assert.doesNotMatch(html, /class="merged"|合并摘录/)
})

test("同名卡片可通过最近祖先路径区分", () => {
  const questionPath = ["基本概念题", "概念题", "多元微分"]
  assert.ok(
    pathMatchScore(questionPath, ["基本概念题", "概念题", "答案脑图"]) >
      pathMatchScore(questionPath, ["常规", "概念题", "答案脑图"])
  )
})

test("手写评论兼容实际 marginpkg 中的 drawing 字段", () => {
  const note = {
    noteTitle: "1994数一",
    comments: [{ type: "PaintNote", drawing: "handwriting-media" }]
  }
  const html = renderCardHtml(
    note,
    "问题",
    () => undefined,
    () => undefined,
    hash => `drawing-${hash}`
  )
  assert.match(html, /canvas data-drawing-id="handwriting-media" data-drawing="drawing-handwriting-media"/)
  assert.doesNotMatch(html, /data:image\/jpeg;base64,drawing-handwriting-media/)
  assert.doesNotMatch(html, /手写内容不可用/)
})

test("PaintNote 同时包含底图和 drawing 时会叠加显示手写层", () => {
  const note = {
    noteTitle: "北京市2015年竞赛题",
    comments: [{ type: "PaintNote", paint: "question-image", drawing: "answer-drawing" }]
  }
  const html = renderCardHtml(
    note,
    "北京市2015年竞赛题",
    () => undefined,
    hash => `media-${hash}`,
    hash => `drawing-${hash}`
  )
  assert.match(html, /class="paint-note"/)
  assert.match(html, /media-question-image/)
  assert.match(html, /drawing-answer-drawing/)
  assert.match(html, /data-drawing-overlay="true"/)
  assert.match(html, /Math\.max\(img\.naturalHeight,Math\.ceil\(maxY\+pad\)\)/)
})

test("OTA 版本比较支持正式版和 GitHub 测试版标签", () => {
  assert.equal(compareVersions("v1.9.0", "1.8.9"), 1)
  assert.equal(compareVersions("1.9.1-beta.2", "1.9.1-beta.1"), 1)
  assert.equal(compareVersions("1.9.1", "1.9.1-beta.2"), 1)
  assert.equal(compareVersions("v1.9.0", "1.9.0"), 0)
})

test("答案窗口位置不再被屏幕边界限制", () => {
  assert.deepEqual(
    freePositionFrame({ x: -640, y: 900, width: 600, height: 500 }),
    { x: -640, y: 900, width: 600, height: 500 }
  )
  assert.equal(
    isFrameFullyOutside(
      { x: -640, y: 100, width: 600, height: 500 },
      { x: 0, y: 0, width: 1024, height: 768 }
    ),
    true
  )
})

test("跨脑图定位使用 MN4 兼容的标准卡片链接", () => {
  assert.equal(noteReferenceUrl("note id"), "marginnote3app://note/note%20id")
})

test("S0–S5 掌握状态采用 Markdown 规定的复习间隔", () => {
  const now = new Date("2026-07-17T00:00:00.000Z")
  assert.equal(nextReviewTime(0, 0, now).toISOString(), "2026-07-18T00:00:00.000Z")
  assert.equal(nextReviewTime(2, 0, now).toISOString(), "2026-07-20T00:00:00.000Z")
  assert.equal(nextReviewTime(4, 0, now).toISOString(), "2026-08-16T00:00:00.000Z")
  assert.equal(nextReviewTime(5, 0, now).toISOString(), "2026-09-15T00:00:00.000Z")
})

test("错题记录保存首次时间、复习历史和下次到期时间", () => {
  const createdAt = new Date("2026-07-17T00:00:00.000Z")
  const record = createMistakeRecord({
    sourceNoteId: "source",
    sourceNotebookId: "questions",
    sourceNotebookTitle: "题目脑图",
    sourceTitle: "1994数一",
    sourcePathTitles: ["基本概念题"],
    answerNotebookId: "answers",
    level: 1
  }, createdAt)
  const reviewed = reviewMistake(record, 1, new Date("2026-07-18T00:00:00.000Z"))
  assert.equal(reviewed.reviewCount, 1)
  assert.equal(reviewed.history.length, 2)
  assert.equal(reviewed.nextReviewAt, "2026-07-19T00:00:00.000Z")
  assert.equal(isDue(reviewed, new Date("2026-07-19T00:00:00.000Z")), true)
})
