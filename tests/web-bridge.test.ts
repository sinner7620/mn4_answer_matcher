import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

test("MarginNote 的 file 页面使用原生桥接而不是预览数据", () => {
  const source = readFileSync(path.join(process.cwd(), "web", "src", "lib", "mnBridge.js"), "utf8")
  assert.match(source, /__MN_FULL_UI_PREVIEW__/)
  assert.match(source, /mnaddon:\/\/bridge/)
  assert.doesNotMatch(source, /location\.protocol\s*===\s*["']file:/)
})

test("插件面板不再包含液态玻璃原生调用或透明联动", () => {
  const panel = readFileSync(path.join(process.cwd(), "rails-native", "WebPanelController.js"), "utf8")
  assert.doesNotMatch(panel, /UIGlassEffect|UIVisualEffectView|nativeLiquidGlass|nativeGlassMounted/)
})

test("跨脑图定位原题时只使用稳定会话尺寸，不采样切换过程中的临时 frame", () => {
  const addon = readFileSync(path.join(process.cwd(), "rails-native", "WebAddon.js"), "utf8")
  const panel = readFileSync(path.join(process.cwd(), "rails-native", "WebPanelController.js"), "utf8")
  assert.match(addon, /self\.pendingMistakeNavigation[\s\S]*preservePanelForNotebookSwitch/)
  assert.match(addon, /preserveAcrossNotebookSwitch[\s\S]*restorePanelAfterNotebookSwitch/)
  const preserve = panel.match(/function preservePanelForNotebookSwitch[\s\S]*?\n  \}/)?.[0] || ""
  assert.match(preserve, /controller\.view\.frame = savedFrame\(controller\)/)
  assert.doesNotMatch(preserve, /saveFrame\(controller\)|removeFromSuperview/)
  const restore = panel.match(/function restorePanelAfterNotebookSwitch[\s\S]*?\n  \}/)?.[0] || ""
  assert.match(restore, /var frame = savedFrame\(controller\)/)
  assert.doesNotMatch(restore, /__onPanelShow/)
  assert.match(panel, /controller\.view\.autoresizingMask = 0/)
  assert.match(panel, /function ensureLayout[\s\S]*controller\.view\.frame = savedFrame\(controller\)/)
  const close = panel.match(/function closePanel[\s\S]*?\n  \}/)?.[0] || ""
  assert.doesNotMatch(close, /saveFrame\(controller\)/)
})

test("插件根页面固定，仅内容页和专用面板滚动", () => {
  const css = readFileSync(path.join(process.cwd(), "web", "src", "ui-reference-final.css"), "utf8")
  assert.match(css, /\.shell > main\s*\{\s*overflow:\s*hidden !important/)
  assert.match(css, /\.overviewPage,[\s\S]*?\.exportPage\s*\{[\s\S]*?overflow:\s*auto/)
  assert.doesNotMatch(css, /\.shell > main\s*\{[^}]*overflow-y:\s*scroll/)
})

test("默认构建完全由开发源码生成，不再依赖 runtime baseline", () => {
  const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"))
  const build = readFileSync(path.join(process.cwd(), "build.mjs"), "utf8")
  assert.equal(pkg.scripts.build, "node build.mjs")
  assert.equal(pkg.scripts["build:source"], "node build.mjs")
  assert.doesNotMatch(JSON.stringify(pkg.scripts), /legacy-runtime|build-runtime/)
  assert.match(build, /src["'],\s*["']rails-core\.ts/)
  assert.match(build, /web["'],\s*["']vite\.config\.js/)
})

test("错题详情 UI 由源码实现并保持批准预览的工具栏结构", () => {
  const source = readFileSync(path.join(process.cwd(), "web", "src", "main.jsx"), "utf8")
  const css = readFileSync(path.join(process.cwd(), "web", "src", "ui-reference-final.css"), "utf8")
  assert.match(source, /ui-reference-final\.css/)
  assert.match(source, /previewLevelSelect/)
  assert.match(source, /detailTagPicker/)
  assert.match(source, /detailRemoveMistake/)
  assert.match(source, /detailTabRightGroup detailTabAux/)
  assert.match(source, /onLoad=\{wirePreviewFrame\}/)
  assert.match(css, /@container detailPane \(max-width: 430px\)/)
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1\.16fr\) 62px 74px/)
  assert.match(css, /preview-level-0[^}]*#d85f4b/)
  assert.match(css, /preview-level-5[^}]*#4f735e/)
})

test("2.3.2 详情交互修复进入源码构建", () => {
  const source = readFileSync(path.join(process.cwd(), "web", "src", "main.jsx"), "utf8")
  const css = readFileSync(path.join(process.cwd(), "web", "src", "ui-reference-final.css"), "utf8")
  const icons = readFileSync(path.join(process.cwd(), "web", "src", "icons.jsx"), "utf8")
  const core = readFileSync(path.join(process.cwd(), "src", "rails-core.ts"), "utf8")
  const manager = readFileSync(path.join(process.cwd(), "src", "mistake-manager.ts"), "utf8")
  const cardHtml = readFileSync(path.join(process.cwd(), "src", "card-html.ts"), "utf8")
  const build = readFileSync(path.join(process.cwd(), "build.mjs"), "utf8")

  assert.match(source, /__mnPinchZoomBound/)
  assert.match(source, /gesturechange/)
  assert.match(source, /touchmove/)
  assert.match(source, /card\.style\.transform = `scale\(\$\{scale\}\)`/)
  assert.match(source, /card\.style\.width = `\$\{baseWidth\}px`/)
  assert.doesNotMatch(source, /documentElement\.style\.zoom/)
  assert.match(cardHtml, /maximum-scale=1,user-scalable=no/)
  assert.match(source, /目前没有到期错题[^\n]*icon=\{false\}/)
  assert.match(source, /previewLevelSelect[^\n]*\{index\}级<\/option>/)
  assert.match(source, /detailTagDelete/)
  assert.match(source, /tagDeleteConfirmOverlay/)
  assert.match(source, /deleteMistakeTag/)
  assert.match(icons, /trash:/)
  assert.match(core, /command === "deleteMistakeTag"/)
  assert.match(manager, /export async function deleteMistakeTag/)
  assert.match(build, /webDist, "logo\.png"/)
  assert.match(source, /src="\.\/logo\.png"/)
  assert.match(source, /MindMapMultiSelect/)
  assert.match(source, /buildParentInsights/)
  assert.match(source, /mindMapSelectTrigger/)
  assert.match(css, /\.mindMapSelect/)
  assert.match(source, /<MistakeDetail key=\{detail\.record\.recordId\}/)
  assert.match(source, /key=\{`\$\{detail\.record\.recordId\}:question`\}/)
  assert.match(source, /key=\{`\$\{detail\.record\.recordId\}:answer:/)
  assert.match(css, /\.listToolbar > \.batchToggle/)
  assert.match(css, /text-overflow: ellipsis !important/)
})
