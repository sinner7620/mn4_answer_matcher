import { mountLiquidGlassTopbarOptics, unmountLiquidGlassTopbarOptics } from "./liquid-glass-topbar-optics"

// The selected-tab liquid lens interaction is copied from the local
// MN-liquid-glass-demo web-overlay/glass-runtime.js implementation.
var cleanup = []
var syncLens = null
var allowProgrammaticClick = false
var suppressClickUntil = 0

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function cssNumber(name, fallback) {
  var raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  var value = parseFloat(raw)
  return isFinite(value) ? value : fallback
}

function navButtons(nav) {
  return Array.prototype.filter.call(nav.children, function (node) {
    return node && node.tagName === "BUTTON"
  })
}

function clearPredict(nav) {
  navButtons(nav).forEach(function (button) { button.classList.remove("lg-predict") })
}

function setPredict(nav, button) {
  var previous = nav.querySelector("button.lg-predict")
  if (previous === button) return
  clearPredict(nav)
  if (button) button.classList.add("lg-predict")
  nav.classList.remove("lg-target-pulse")
  void nav.offsetWidth
  nav.classList.add("lg-target-pulse")
  setTimeout(function () { nav.classList.remove("lg-target-pulse") }, 110)
}

function nearestButton(nav, localX) {
  var buttons = navButtons(nav)
  var best = buttons[0] || null
  var distance = Infinity
  buttons.forEach(function (button) {
    var center = button.offsetLeft + button.offsetWidth / 2
    var next = Math.abs(center - localX)
    if (next < distance) { distance = next; best = button }
  })
  return best
}

function setLensGeometry(nav, left, width, energy, velocity) {
  energy = clamp(energy || 0, 0, 1)
  velocity = velocity || 0
  var direction = velocity === 0 ? 0 : (velocity > 0 ? 1 : -1)
  nav.style.setProperty("--lg-lens-left", left.toFixed(2) + "px")
  nav.style.setProperty("--lg-lens-width", width.toFixed(2) + "px")
  nav.style.setProperty("--lg-drag-energy", energy.toFixed(3))
  nav.style.setProperty("--lg-drag-dir", String(direction))
  nav.style.setProperty("--lg-lens-skew", clamp(velocity * 2.8, -4.5, 4.5).toFixed(2) + "deg")
  nav.style.setProperty("--lg-tail-shift", clamp(velocity * -10, -11, 11).toFixed(2) + "px")
  var round = 14 + energy * 5
  var lead = round + energy * 10
  var trail = Math.max(11, round - energy * 3.5)
  var radius = direction > 0
    ? trail.toFixed(1) + "px " + lead.toFixed(1) + "px " + lead.toFixed(1) + "px " + trail.toFixed(1) + "px"
    : direction < 0
      ? lead.toFixed(1) + "px " + trail.toFixed(1) + "px " + trail.toFixed(1) + "px " + lead.toFixed(1) + "px"
      : round.toFixed(1) + "px"
  nav.style.setProperty("--lg-lens-radius", radius)
  nav.style.setProperty("--lg-lens-scale-y", (1 - energy * .075).toFixed(4))
  nav.style.setProperty("--lg-lens-saturate", (100 + energy * 28).toFixed(1) + "%")
  nav.style.setProperty("--lg-lens-brightness", (1 + energy * .065).toFixed(4))
  nav.style.setProperty("--lg-lens-glare-pos", (44 + direction * 34).toFixed(1) + "%")
  nav.style.setProperty("--lg-caustic-x", (direction > 0 ? 86 : direction < 0 ? 14 : 26) + "%")
  nav.style.setProperty("--lg-caustic-y", (18 + energy * 8).toFixed(1) + "%")
  nav.style.setProperty("--lg-tail-opacity", (.34 + energy * .56).toFixed(3))
  nav.style.setProperty("--lg-tail-blur", (energy * .55).toFixed(2) + "px")
}

function snapToButton(nav, button, releasedVelocity) {
  if (!button) return
  var baseWidth = button.offsetWidth
  var energy = clamp(Math.abs(releasedVelocity || 0) * 1.8, 0, 1)
  var overshoot = clamp((releasedVelocity || 0) * 34, -14, 14)
  nav.classList.remove("lg-dragging")
  nav.classList.add("lg-releasing")
  setLensGeometry(nav, button.offsetLeft + overshoot, baseWidth * (1 + energy * .055), energy, releasedVelocity || 0)
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { setLensGeometry(nav, button.offsetLeft, baseWidth, 0, 0) })
  })
  setTimeout(function () {
    nav.classList.remove("lg-releasing")
    nav.style.setProperty("--lg-lens-skew", "0deg")
    nav.style.setProperty("--lg-tail-shift", "0px")
  }, 430)
}

function makeLens(nav) {
  var drag = null
  function sync() {
    if (drag) return
    var active = nav.querySelector("button.active")
    if (active) setLensGeometry(nav, active.offsetLeft, active.offsetWidth, 0, 0)
  }
  function begin(clientX) {
    var rect = nav.getBoundingClientRect()
    var localX = clamp(clientX - rect.left, 0, rect.width)
    var target = nearestButton(nav, localX)
    drag = { rect: rect, lastX: localX, lastTime: Date.now(), velocity: 0, target: target }
    nav.classList.add("lg-dragging", "lg-pressing")
    setPredict(nav, target)
    update(clientX)
  }
  function update(clientX) {
    if (!drag) return
    var now = Date.now()
    var rect = nav.getBoundingClientRect()
    var x = clamp(clientX - rect.left, 0, rect.width)
    var dt = Math.max(8, now - drag.lastTime)
    var instantaneous = (x - drag.lastX) / dt
    drag.velocity = drag.velocity * .58 + instantaneous * .42
    var predictedX = clamp(x + drag.velocity * cssNumber("--lg-predict-ms", 68), 0, rect.width)
    var target = nearestButton(nav, predictedX)
    drag.target = target
    setPredict(nav, target)
    var targetCenter = target ? target.offsetLeft + target.offsetWidth / 2 : predictedX
    var distance = Math.abs(predictedX - targetCenter)
    var capture = clamp(1 - distance / Math.max(48, target ? target.offsetWidth : 72), .18, .62)
    var lensCenter = predictedX * (1 - capture) + targetCenter * capture
    var baseWidth = target ? target.offsetWidth : 72
    var energy = clamp(Math.abs(drag.velocity) * 2.25, 0, 1)
    var stretchMax = cssNumber("--lg-stretch-max", .34)
    var elastic = clamp(Math.abs(predictedX - lensCenter) / Math.max(42, baseWidth), 0, 1)
    var width = baseWidth * (1 + energy * stretchMax + elastic * stretchMax * .42)
    var leadBias = clamp(drag.velocity * 12, -10, 10)
    var left = clamp(lensCenter - width / 2 + leadBias, 0, Math.max(0, rect.width - width))
    setLensGeometry(nav, left, width, energy, drag.velocity)
    drag.lastX = x; drag.lastTime = now
  }
  function commit() {
    if (!drag) return
    var target = drag.target || nav.querySelector("button.active")
    var velocity = drag.velocity
    drag = null
    nav.classList.remove("lg-pressing")
    clearPredict(nav)
    snapToButton(nav, target, velocity)
    if (target) {
      suppressClickUntil = Date.now() + 420
      allowProgrammaticClick = true
      try { target.click() } finally { allowProgrammaticClick = false }
      setTimeout(sync, 0); setTimeout(sync, 80)
    }
  }
  function cancel() { if (!drag) return; drag = null; nav.classList.remove("lg-dragging", "lg-pressing"); clearPredict(nav); sync() }
  function onClick(event) { if (!allowProgrammaticClick && Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); return } setTimeout(sync, 0) }
  function touchStart(event) { if (!event.touches || event.touches.length !== 1) return; if (event.cancelable) event.preventDefault(); begin(event.touches[0].clientX) }
  function touchMove(event) { if (!drag || !event.touches || event.touches.length !== 1) return; if (event.cancelable) event.preventDefault(); update(event.touches[0].clientX) }
  function touchEnd(event) { if (!drag) return; if (event.cancelable) event.preventDefault(); commit() }
  function mouseDown(event) { if (event.button !== 0) return; event.preventDefault(); begin(event.clientX) }
  function mouseMove(event) { if (!drag) return; event.preventDefault(); update(event.clientX) }
  function mouseUp(event) { if (!drag || event.button !== 0) return; event.preventDefault(); commit() }
  nav.addEventListener("click", onClick, true)
  nav.addEventListener("touchstart", touchStart, { passive: false })
  nav.addEventListener("touchmove", touchMove, { passive: false })
  nav.addEventListener("touchend", touchEnd, { passive: false })
  nav.addEventListener("touchcancel", cancel, false)
  nav.addEventListener("mousedown", mouseDown, false)
  document.addEventListener("mousemove", mouseMove, false)
  document.addEventListener("mouseup", mouseUp, false)
  window.addEventListener("resize", sync, false)
  cleanup.push(function () {
    nav.removeEventListener("click", onClick, true); nav.removeEventListener("touchstart", touchStart, false); nav.removeEventListener("touchmove", touchMove, false); nav.removeEventListener("touchend", touchEnd, false); nav.removeEventListener("touchcancel", cancel, false); nav.removeEventListener("mousedown", mouseDown, false); document.removeEventListener("mousemove", mouseMove, false); document.removeEventListener("mouseup", mouseUp, false); window.removeEventListener("resize", sync, false)
  })
  sync()
  return sync
}

export function mountLiquidGlassTopbar() {
  if (syncLens) return
  var nav = document.querySelector(".mn-liquid-glass-topbar .topNav")
  if (!nav) return
  syncLens = makeLens(nav)
  var lastKey = ""
  var timer = setInterval(function () {
    var active = nav.querySelector("button.active")
    var key = active ? active.textContent : ""
    if (key !== lastKey) { lastKey = key; syncLens() }
  }, 120)
  cleanup.push(function () { clearInterval(timer) })
  mountLiquidGlassTopbarOptics()
}

export function unmountLiquidGlassTopbar() {
  unmountLiquidGlassTopbarOptics()
  cleanup.splice(0).forEach(function (fn) { fn() })
  var nav = document.querySelector(".topNav")
  if (nav) {
    clearPredict(nav)
    nav.classList.remove("lg-dragging", "lg-pressing", "lg-releasing", "lg-target-pulse")
    ;["--lg-lens-left", "--lg-lens-width", "--lg-drag-energy", "--lg-drag-dir", "--lg-lens-skew", "--lg-tail-shift", "--lg-lens-radius", "--lg-lens-scale-y", "--lg-lens-saturate", "--lg-lens-brightness", "--lg-lens-glare-pos", "--lg-caustic-x", "--lg-caustic-y", "--lg-tail-opacity", "--lg-tail-blur"].forEach(function (name) { nav.style.removeProperty(name) })
  }
  syncLens = null
  allowProgrammaticClick = false
  suppressClickUntil = 0
}
