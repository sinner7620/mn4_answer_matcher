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
import { scopeKey } from "../src/scope-key"
import {
  bindingKey,
  getBinding,
  getBindingForMode,
  setBinding,
  targetForMode
} from "../src/binding"
import { isSelectableMindMapRoot } from "../src/mindmap-candidate"

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
  assert.equal(
    scopeKey({ notebookId: "same-study-set", rootNodeId: "answer-root-a" }),
    "same-study-set::root::answer-root-a"
  )
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

test("绑定候选排除无标题内部节点，只保留有标题的顶层脑图", () => {
  assert.equal(isSelectableMindMapRoot(false, "一元微分"), true)
  assert.equal(isSelectableMindMapRoot(false, "答案"), true)
  assert.equal(isSelectableMindMapRoot(false, "  "), false)
  assert.equal(isSelectableMindMapRoot(true, "普通子卡片"), false)
  assert.equal(isSelectableMindMapRoot(false, "🐙1000第九章基础22", "source", ["source", "group"]), false)
})

test("标题标准化忽略全半角、空白、常见中英文标点和大小写", () => {
  assert.equal(normalizeTitle(" Ａbc ？\n"), "abc")
  assert.equal(normalizeTitle("什么是 FFT："), normalizeTitle("什么是fft?"))
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
  assert.match(html, /canvas data-drawing="drawing-handwriting-media"/)
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
