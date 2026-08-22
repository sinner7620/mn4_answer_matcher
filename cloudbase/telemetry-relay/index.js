"use strict"

const http = require("node:http")

const PORT = 9000
const MAX_BODY_BYTES = 1024
const UPSTREAM_TIMEOUT_MS = 3000
const DEFAULT_WORKER_URL =
  "https://mnrails-telemetry.mr-wuyzhn.workers.dev/ping"
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const VERSION_PATTERN = /^[0-9a-z][0-9a-z._+-]{0,39}$/i

function emptyResponse(res, statusCode, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": "0",
    ...extraHeaders
  })
  res.end()
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    let tooLarge = false
    const chunks = []

    req.on("data", chunk => {
      if (tooLarge) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        tooLarge = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      if (tooLarge) {
        const error = new Error("body-too-large")
        error.statusCode = 413
        reject(error)
        return
      }
      resolve(Buffer.concat(chunks).toString("utf8"))
    })
    req.on("error", reject)
  })
}

function sanitizedPayload(raw) {
  const data = JSON.parse(raw)
  const installId = String(data.install_id || "").toLowerCase()

  if (
    data.schema !== 1 ||
    !UUID_PATTERN.test(installId) ||
    typeof data.version !== "string" ||
    !VERSION_PATTERN.test(data.version) ||
    !["stable", "beta"].includes(data.channel)
  ) {
    return undefined
  }

  return {
    schema: 1,
    install_id: installId,
    version: data.version,
    channel: data.channel
  }
}

async function handleRequest(req, res) {
  const pathname = new URL(req.url || "/", "http://localhost").pathname
  if (pathname !== "/ping") return emptyResponse(res, 404)
  if (req.method !== "POST") {
    return emptyResponse(res, 405, { Allow: "POST" })
  }

  const declaredLength = Number(req.headers["content-length"] || 0)
  if (declaredLength > MAX_BODY_BYTES) return emptyResponse(res, 413)

  let payload
  try {
    payload = sanitizedPayload(await readBody(req))
  } catch (error) {
    if (error && error.statusCode === 413) return emptyResponse(res, 413)
    return emptyResponse(res, 400)
  }
  if (!payload) return emptyResponse(res, 400)

  const relaySecret = process.env.TELEMETRY_RELAY_SECRET
  if (!relaySecret) return emptyResponse(res, 500)

  try {
    const upstream = await fetch(
      process.env.TELEMETRY_WORKER_URL || DEFAULT_WORKER_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telemetry-Relay-Secret": relaySecret
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
      }
    )
    return emptyResponse(res, upstream.status === 204 ? 204 : 502)
  } catch (error) {
    const timedOut = error && (error.name === "TimeoutError" || error.name === "AbortError")
    return emptyResponse(res, timedOut ? 504 : 502)
  }
}

if (require.main === module) {
  http.createServer((req, res) => {
    void handleRequest(req, res).catch(() => emptyResponse(res, 500))
  }).listen(PORT, "0.0.0.0")
}

module.exports = { handleRequest, sanitizedPayload }
