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

test("插件根页面固定，仅内容页和专用面板滚动", () => {
  const css = readFileSync(path.join(process.cwd(), "web", "src", "beta-ui.css"), "utf8")
  assert.match(css, /\.shell > main\s*\{\s*overflow:\s*hidden !important/)
  assert.match(css, /\.overviewPage,[\s\S]*?\.exportPage\s*\{[\s\S]*?overflow:\s*auto/)
  assert.doesNotMatch(css, /\.shell > main\s*\{[^}]*overflow-y:\s*scroll/)
})
