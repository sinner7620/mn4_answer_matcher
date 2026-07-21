import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

Object.assign(globalThis, {
  Application: { sharedInstance: () => ({ appVersion: "4.0.0", osType: 1 }) },
  Database: { sharedInstance: () => ({}) },
  NSLocale: { preferredLanguages: () => ["zh-CN"] },
  UIColor: { colorWithHexString: (value: string) => value }
})

const exportModule = import("../src/mistake-export")

const detail: any = {
  record: {
    recordId: "book:question",
    sourceNoteId: "question",
    sourceNotebookId: "book",
    sourceNotebookTitle: "多元微分",
    sourceTitle: "1994数一",
    sourcePathTitles: ["基本概念题"],
    categoryPath: ["多元微分", "基本概念题"],
    categoryLabel: "多元微分 › 基本概念题",
    level: 1,
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: "2026-07-02T08:00:00.000Z",
    lastReviewedAt: "2026-07-02T08:00:00.000Z",
    nextReviewAt: "2026-07-03T08:00:00.000Z",
    reviewCount: 1,
    history: [{ at: "2026-07-02T08:00:00.000Z", level: 1 }]
  },
  questionHtml: '<html><body><article><img src="data:image/png;base64,abc"><p>原题评论</p><canvas data-drawing="drawing"></canvas></article><script>renderDrawing()</script></body></html>',
  answers: [
    { title: "答案一", path: "答案脑图 › 第一解", html: "<html><body><p>第一种答案</p></body></html>" },
    { title: "答案二", path: "答案脑图 › 第二解", html: "<html><body><p>第二种答案</p></body></html>" }
  ],
  answerStatus: "ready"
}

const options: any = { format: "md", include: { question: true, answer: true, source: true, review: true } }

test("Markdown 导出使用标准 Markdown，不再泄露卡片 HTML、脚本或 drawing 原始数据", async () => {
  const { buildMistakeMarkdown } = await exportModule
  const markdown = buildMistakeMarkdown([detail], options)
  for (const value of ["多元微分", "![卡片图片](data:image/png;base64,abc)", "原题评论", "手写内容解析失败", "第一种答案", "第二种答案", "复习记录"]) {
    assert.match(markdown, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
  assert.doesNotMatch(markdown, /<script|data-drawing=|renderDrawing\(\)/)
})

test("PDF HTML 是分页、自包含且保留卡片绘制脚本", async () => {
  const { buildMistakePdfHtml } = await exportModule
  const html = buildMistakePdfHtml([detail], { ...options, format: "pdf" })
  assert.match(html, /@page\{size:A4/)
  assert.match(html, /page-break-before:always/)
  assert.match(html, /renderDrawing\(\)/)
  assert.match(html, /第一种答案/)
  assert.match(html, /第二种答案/)
})

test("Markdown 压缩包会把 data URI 改写为有限长度的 assets 路径", async () => {
  const { extractMarkdownAssets } = await exportModule
  const bundle = extractMarkdownAssets("![题图](data:image/png;base64,aGVsbG8=)\n![手写](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)")
  assert.equal(bundle.assets.length, 2)
  assert.equal(bundle.assets[0].fileName, "asset-0001.png")
  assert.equal(bundle.assets[1].fileName, "asset-0002.svg")
  assert.match(bundle.markdown, /!\[题图\]\(assets\/asset-0001\.png\)/)
  assert.match(bundle.markdown, /!\[手写\]\(assets\/asset-0002\.svg\)/)
  assert.doesNotMatch(bundle.markdown, /data:image|base64/)
})

test("图片扩展名按真实文件头识别，不信任错误的 jpeg MIME", async () => {
  const { extractMarkdownAssets } = await exportModule
  const bundle = extractMarkdownAssets("![题图](data:image/jpeg;base64,iVBORw0KGgo=)")
  assert.equal(bundle.assets[0].fileName, "asset-0001.png")
  assert.match(bundle.markdown, /assets\/asset-0001\.png/)
})

test("MarginNote 图片使用媒体 ID 写出，不调用 NSData base64 解码", async () => {
  const { extractMarkdownAssets } = await exportModule
  const bundle = extractMarkdownAssets("![题图](mnmedia://png/abc123)")
  assert.equal(bundle.assets[0].mediaId, "abc123")
  assert.equal(bundle.assets[0].fileName, "asset-0001.png")
  assert.match(bundle.markdown, /assets\/asset-0001\.png/)
})

test("PDF 导出使用系统打印面板，不再依赖未开放的 UIGraphics C 函数", () => {
  const bridge = readFileSync("rails-native/WebBridgeCommands.js", "utf8")
  assert.match(bridge, /UIPrintInteractionController\.sharedPrintController/)
  assert.match(bridge, /viewPrintFormatter/)
  assert.doesNotMatch(bridge, /UIGraphicsBeginPDF|UIGraphicsEndPDF/)
})

test("ZIP 导出调用 MN4 全局 ZipArchive，而不是 marginnote 模块属性", () => {
  const source = readFileSync("src/mistake-export.ts", "utf8")
  assert.doesNotMatch(source, /import\s*\{[^}]*ZipArchive[^}]*\}\s*from\s*["']marginnote["']/)
  assert.match(source, /ZipArchive\.createZipFileAtPathWithContentsOfDirectory/)
})
