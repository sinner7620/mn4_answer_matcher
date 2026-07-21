import { previewSend } from "./previewBridge"

const BRIDGE_URL = "mnaddon://bridge?payload="

const isBrowserPreview = ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname)

function receive() {
  window.__MNBridgePending = window.__MNBridgePending || {}
  if (window.__MN_WEB_BRIDGE_RECEIVE_FN__) return
  window.__MN_WEB_BRIDGE_RECEIVE_FN__ = raw => {
    const response = JSON.parse(raw)
    const pending = window.__MNBridgePending[response.requestId]
    if (!pending) return
    delete window.__MNBridgePending[response.requestId]
    response.error ? pending.reject(response.error) : pending.resolve(response.payload)
  }
}

function send(command, payload = null) {
  if (isBrowserPreview) return previewSend(command, payload)
  receive()
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return new Promise((resolve, reject) => {
    window.__MNBridgePending[requestId] = { resolve, reject }
    const frame = document.createElement("iframe")
    frame.style.display = "none"
    frame.src = BRIDGE_URL + encodeURIComponent(JSON.stringify({ command, requestId, payload }))
    document.body.appendChild(frame)
    setTimeout(() => frame.remove(), 700)
  })
}

export default { send }
