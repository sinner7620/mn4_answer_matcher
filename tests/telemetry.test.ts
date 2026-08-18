import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  isTelemetryDue,
  TELEMETRY_INTERVAL,
  telemetryChannel,
  telemetryStatusCode
} from "../src/telemetry"

test("版本号映射到 stable 与 beta 匿名统计渠道", () => {
  assert.equal(telemetryChannel("1.9.91"), "stable")
  assert.equal(telemetryChannel("2.3.11-beta.1"), "beta")
})

test("兼容 MarginNote HTTP 响应的 statusCode 属性与方法两种桥接形式", () => {
  assert.equal(telemetryStatusCode({ statusCode: 204 }), 204)
  assert.equal(telemetryStatusCode({ statusCode() { return 204 } }), 204)
  assert.equal(telemetryStatusCode({ statusCode() { return 500 } }), 500)
  assert.equal(telemetryStatusCode({}), undefined)
})

test("匿名统计按成功时间节流 12 小时", () => {
  const now = 2_000_000_000_000
  assert.equal(isTelemetryDue(now, 0), true)
  assert.equal(isTelemetryDue(now, now - TELEMETRY_INTERVAL + 1), false)
  assert.equal(isTelemetryDue(now, now - TELEMETRY_INTERVAL), true)
})

test("上报只接受 204，并在成功后记录时间且失败全程静默", () => {
  const source = readFileSync("src/telemetry.ts", "utf8")
  assert.match(source, /statusCode === 204/)
  assert.match(source, /if \(await postTelemetry\(id\)\) rememberSuccess/)
  assert.match(source, /const REQUEST_TIMEOUT_SECONDS = 8/)
  assert.match(source, /setTimeoutInterval\(REQUEST_TIMEOUT_SECONDS\)/)
  assert.match(source, /catch \{\s*\/\/ Best effort only/)
  assert.doesNotMatch(source, /showHUD|popup|MN\.error/)
})

test("生产源码不再暴露强制调试更新与 telemetry POST 入口", () => {
  const telemetry = readFileSync("src/telemetry.ts", "utf8")
  const updater = readFileSync("src/updater.ts", "utf8")
  const ui = readFileSync("web/src/main.jsx", "utf8")
  const bridge = readFileSync("src/rails-core.ts", "utf8")
  assert.doesNotMatch(ui, /调试 12 小时自动检查|debugUpdateTelemetry/)
  assert.doesNotMatch(bridge, /debugUpdateTelemetry|debugAutomaticUpdateCheck|debugForceTelemetryReport/)
  assert.doesNotMatch(updater, /debugAutomaticUpdateCheck|UpdateDebugResult/)
  assert.doesNotMatch(telemetry, /debugForceTelemetryReport|TelemetryDebugResult|postTelemetryWithResult/)
})
