import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import {
  isTelemetryDue,
  TELEMETRY_EU_ENDPOINT,
  TELEMETRY_FALLBACK_ENDPOINT,
  TELEMETRY_INTERVAL,
  telemetryChannel,
  telemetryStatusCode
} from "../src/telemetry"

const require = createRequire(import.meta.url)
const { sanitizedPayload } = require("../cloudbase/telemetry-relay/index.js")

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

test("CloudBase 中转只保留四个通过校验的匿名字段", () => {
  const payload = sanitizedPayload(JSON.stringify({
    schema: 1,
    install_id: "00000000-0000-4000-8000-000000000000",
    version: "1.9.11",
    channel: "stable",
    ignored: "must-not-be-forwarded"
  }))
  assert.deepEqual(payload, {
    schema: 1,
    install_id: "00000000-0000-4000-8000-000000000000",
    version: "1.9.11",
    channel: "stable"
  })
  assert.equal(sanitizedPayload(JSON.stringify({ schema: 1 })), undefined)
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
  assert.match(source, /telemetryStatusCode\(response\) === 204/)
  assert.match(source, /\[TELEMETRY_EU_ENDPOINT, TELEMETRY_FALLBACK_ENDPOINT\]/)
  assert.match(source, /for \(const endpoint of \[TELEMETRY_EU_ENDPOINT, TELEMETRY_FALLBACK_ENDPOINT\]\)/)
  assert.match(source, /if \(await postTelemetry\(id\)\) rememberSuccess/)
  assert.match(source, /const REQUEST_TIMEOUT_SECONDS = 8/)
  assert.match(source, /setTimeoutInterval\(REQUEST_TIMEOUT_SECONDS\)/)
  assert.match(source, /catch \{\s*\/\/ Best effort only/)
  assert.doesNotMatch(source, /showHUD|popup|MN\.error/)
})
