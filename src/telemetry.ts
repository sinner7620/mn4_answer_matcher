export const TELEMETRY_PRIMARY_ENDPOINT = "https://telemetry.2608204.xyz/ping"
export const TELEMETRY_EU_ENDPOINT = "https://cardlink.cn.eu.org/ping"
export const TELEMETRY_FALLBACK_ENDPOINT = "https://mnrails-telemetry.mr-wuyzhn.workers.dev/ping"
export const TELEMETRY_INTERVAL = 12 * 60 * 60 * 1000

const INSTALL_ID_KEY = "marginnote.extension.mn4-answer-matcher.telemetry.install-id"
const LAST_SUCCESS_KEY = "marginnote.extension.mn4-answer-matcher.telemetry.last-success"
const REQUEST_TIMEOUT_SECONDS = 8
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let reportInFlight = false

export interface TelemetryPostTestResult {
  endpoint: string
  domain: string
  reachable: boolean
  accepted: boolean
  statusCode?: number
  durationMs: number
  error?: string
}

export function telemetryChannel(version: string): "stable" | "beta" {
  return version.toLowerCase().includes("-beta") ? "beta" : "stable"
}

export function isTelemetryDue(now: number, lastSuccess: number): boolean {
  return !lastSuccess || now - lastSuccess >= TELEMETRY_INTERVAL
}

export function telemetryStatusCode(response: unknown): number | undefined {
  try {
    const raw = (response as any)?.statusCode
    const value = typeof raw === "function" ? raw.call(response) : raw
    const status = Number(value || 0)
    return Number.isFinite(status) && status > 0 ? status : undefined
  } catch {
    return undefined
  }
}

function installId(): string | undefined {
  try {
    const defaults = NSUserDefaults.standardUserDefaults()
    const stored = String(defaults.stringForKey(INSTALL_ID_KEY) || "").trim()
    if (UUID_PATTERN.test(stored)) return stored.toLowerCase()
    const generated = NSUUID.UUID().UUIDString().toLowerCase()
    if (!UUID_PATTERN.test(generated)) return undefined
    defaults.setObjectForKey(generated, INSTALL_ID_KEY)
    defaults.synchronize()
    return generated
  } catch {
    return undefined
  }
}

function lastSuccessTime(): number {
  try {
    return NSUserDefaults.standardUserDefaults().doubleForKey(LAST_SUCCESS_KEY) || 0
  } catch {
    return 0
  }
}

function rememberSuccess(timestamp: number): void {
  try {
    const defaults = NSUserDefaults.standardUserDefaults()
    defaults.setDoubleForKey(timestamp, LAST_SUCCESS_KEY)
    defaults.synchronize()
  } catch {
    // Persistence is optional; never surface telemetry failures to the user.
  }
}

function postTelemetryTo(endpoint: string, id: string): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const request = NSMutableURLRequest.requestWithURL(NSURL.URLWithString(endpoint))
      request.setHTTPMethod("POST")
      request.setTimeoutInterval(REQUEST_TIMEOUT_SECONDS)
      request.setValueForHTTPHeaderField("application/json", "Content-Type")
      request.setHTTPBody(NSData.dataWithStringEncoding(JSON.stringify({
        schema: 1,
        install_id: id,
        version: __APP_VERSION__,
        channel: telemetryChannel(__APP_VERSION__)
      }), 4))
      NSURLConnection.sendAsynchronousRequestQueueCompletionHandler(
        request,
        NSOperationQueue.mainQueue(),
        (response: any, _data: any, error: any) => {
          const statusCode = telemetryStatusCode(response)
          const errorMessage = error?.localizedDescription
            ? String(error.localizedDescription)
            : statusCode === 204
              ? undefined
              : `HTTP ${statusCode || "无响应"}`
          resolve(!errorMessage && statusCode === 204)
        }
      )
    } catch {
      resolve(false)
    }
  })
}

function postConnectivityTestTo(endpoint: string, payload: Record<string, unknown>): Promise<TelemetryPostTestResult> {
  const startedAt = Date.now()
  let domain = endpoint
  try {
    domain = String(NSURL.URLWithString(endpoint)?.host || endpoint)
  } catch {
    // Keep the full endpoint as a readable fallback.
  }
  return new Promise(resolve => {
    try {
      const request = NSMutableURLRequest.requestWithURL(NSURL.URLWithString(endpoint))
      request.setHTTPMethod("POST")
      request.setTimeoutInterval(REQUEST_TIMEOUT_SECONDS)
      request.setValueForHTTPHeaderField("application/json", "Content-Type")
      request.setHTTPBody(NSData.dataWithStringEncoding(JSON.stringify(payload), 4))
      NSURLConnection.sendAsynchronousRequestQueueCompletionHandler(
        request,
        NSOperationQueue.mainQueue(),
        (response: any, _data: any, error: any) => {
          const statusCode = telemetryStatusCode(response)
          const errorMessage = error?.localizedDescription
            ? String(error.localizedDescription)
            : statusCode === undefined
              ? "无响应"
              : undefined
          resolve({
            endpoint,
            domain,
            reachable: statusCode !== undefined && !errorMessage,
            accepted: statusCode === 204 && !errorMessage,
            statusCode,
            durationMs: Date.now() - startedAt,
            error: errorMessage
          })
        }
      )
    } catch (error) {
      resolve({
        endpoint,
        domain,
        reachable: false,
        accepted: false,
        durationMs: Date.now() - startedAt,
        error: String(error)
      })
    }
  })
}

export async function runTelemetryPostConnectivityTest(): Promise<{
  test: true
  testedAt: string
  payload: Record<string, unknown>
  results: TelemetryPostTestResult[]
}> {
  const testedAt = new Date().toISOString()
  const payload = {
    schema: 1,
    test: true,
    content_type: "connectivity-test",
    content: "MN4 调试模式 POST 连通性测试内容，不计入正式上报",
    install_id: "00000000-0000-4000-8000-000000000000",
    version: "test",
    channel: telemetryChannel(__APP_VERSION__),
    tested_at: testedAt
  }
  const results = [] as TelemetryPostTestResult[]
  for (const endpoint of [
    TELEMETRY_PRIMARY_ENDPOINT,
    TELEMETRY_EU_ENDPOINT,
    TELEMETRY_FALLBACK_ENDPOINT
  ]) {
    results.push(await postConnectivityTestTo(endpoint, payload))
  }
  return { test: true, testedAt, payload, results }
}

async function postTelemetry(id: string): Promise<boolean> {
  for (const endpoint of [
    TELEMETRY_PRIMARY_ENDPOINT,
    TELEMETRY_EU_ENDPOINT,
    TELEMETRY_FALLBACK_ENDPOINT
  ]) {
    if (await postTelemetryTo(endpoint, id)) return true
  }
  return false
}

export async function reportTelemetryIfDue(now = Date.now()): Promise<void> {
  if (reportInFlight || !isTelemetryDue(now, lastSuccessTime())) return
  const id = installId()
  if (!id) return
  reportInFlight = true
  try {
    if (await postTelemetry(id)) rememberSuccess(Date.now())
  } catch {
    // Best effort only: telemetry must never affect plugin behavior.
  } finally {
    reportInFlight = false
  }
}

export function scheduleTelemetryReport(): void {
  void reportTelemetryIfDue()
}
