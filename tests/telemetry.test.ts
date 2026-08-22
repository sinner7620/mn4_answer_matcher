import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  isTelemetryDue,
  TELEMETRY_EU_ENDPOINT,
  TELEMETRY_FALLBACK_ENDPOINT,
  TELEMETRY_INTERVAL,
  telemetryChannel,
  telemetryStatusCode
} from "../src/telemetry"

test("版本号映射到 stable 与 beta 匿名统计渠道", () => {
  assert.equal(telemetryChannel("1.9.91"), "stable")
  assert.equal(telemetryChannel("2.3.11-beta.1"), "beta")
})

test("优先使用 EU 自定义域名，并保留 workers.dev 备用入口", () => {
  assert.equal(TELEMETRY_EU_ENDPOINT, "https://cardlink.cn.eu.org/ping")
  assert.equal(
    TELEMETRY_FALLBACK_ENDPOINT,
    "https://mnrails-telemetry.mr-wuyzhn.workers.dev/ping"
  )
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
  assert.match(source, /\[TELEMETRY_EU_ENDPOINT, TELEMETRY_FALLBACK_ENDPOINT\]/)
  assert.match(source, /for \(const endpoint of/)
  assert.match(source, /if \(await postTelemetry\(id\)\) rememberSuccess/)
  assert.match(source, /const REQUEST_TIMEOUT_SECONDS = 8/)
  assert.match(source, /setTimeoutInterval\(REQUEST_TIMEOUT_SECONDS\)/)
  assert.match(source, /catch \{\s*\/\/ Best effort only/)
  assert.doesNotMatch(source, /showHUD|popup|MN\.error/)
})

test("POST 测试只在调试模式开放，逐域名发送明确测试内容且不更新正式上报时间", () => {
  const telemetry = readFileSync("src/telemetry.ts", "utf8")
  const ui = readFileSync("web/src/main.jsx", "utf8")
  const bridge = readFileSync("src/rails-core.ts", "utf8")
  assert.match(ui, /"上报 POST 测试"/)
  assert.match(bridge, /command === "testTelemetryPost"[\s\S]*debugModeEnabled/)
  assert.match(telemetry, /content_type: "connectivity-test"/)
  assert.match(telemetry, /不计入正式上报/)
  assert.match(telemetry, /install_id: "00000000-0000-4000-8000-000000000000"/)
  assert.match(telemetry, /version: "test"/)
  assert.match(telemetry, /results\.push\(await postConnectivityTestTo/)
  const testFunction = telemetry.match(/export async function runTelemetryPostConnectivityTest[\s\S]*?\n\}/)?.[0] || ""
  assert.doesNotMatch(testFunction, /rememberSuccess/)
})
