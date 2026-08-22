import html2canvas from "html2canvas"
import { getLiquidGlassComposedScene, setLiquidGlassCustomBackground } from "./liquid-glass-topbar-optics"
import { GLASS_PRESETS, applyGlassPreset, glassOptics, setGlassOptic } from "./glass-optics-settings"

// Optical preset, lens markup, drag interaction and fragment shader are copied
// from the local Just Glass v0.3.1 project. The host adapter only replaces its
// mock scene canvas with a snapshot of the live plugin UI.
var state = { dragEnergy: 0 }
var renderer = null
var cleanup = []
var captureTimer = 0
var captureRunning = false
var captureQueued = false
var lastCaptureAt = 0
var lastScrollSignature = ""

function eventPoint(e) { var t; if (e.touches && e.touches.length) t = e.touches[0]; else if (e.changedTouches && e.changedTouches.length) t = e.changedTouches[0]; else t = e; return { x: Number(t.clientX), y: Number(t.clientY) }; }
function makeDraggable(handle, target, isLens) { if (!handle || !target) return; var active = false, startX = 0, startY = 0, originX = 0, originY = 0, lastX = 0, lastY = 0, lastT = 0, moved = false;
  function start(e) { var p = eventPoint(e); active = true; moved = false; startX = p.x; startY = p.y; lastX = p.x; lastY = p.y; lastT = (new Date()).getTime(); originX = target.offsetLeft; originY = target.offsetTop; if (isLens) target.className = "mn-debug-lens glass-shell dragging"; if (e.preventDefault) e.preventDefault(); }
  function move(e) { if (!active) return; var p = eventPoint(e), now = (new Date()).getTime(), dt = Math.max(1, now - lastT), dx = p.x - startX, dy = p.y - startY, maxX = Math.max(0, window.innerWidth - target.offsetWidth), maxY = Math.max(0, window.innerHeight - target.offsetHeight), x = Math.max(0, Math.min(maxX, originX + dx)), y = Math.max(0, Math.min(maxY, originY + dy)), vx = (p.x - lastX) / dt, vy = (p.y - lastY) / dt, speed = Math.sqrt(vx * vx + vy * vy); target.style.left = x + "px"; target.style.top = y + "px"; state.dragEnergy = Math.min(1.45, Math.max(state.dragEnergy, speed * 1.75)); lastX = p.x; lastY = p.y; lastT = now; moved = true; if (isLens) updateShadow(); if (renderer) { renderer.syncRects(); renderer.draw(); } if (e.preventDefault) e.preventDefault(); }
  function end(e) { if (!active) return; active = false; if (isLens) target.className = "mn-debug-lens glass-shell"; if (renderer) { renderer.syncRects(); renderer.draw(); } if (moved && e && e.preventDefault) e.preventDefault(); }
  handle.addEventListener("touchstart", start, false); document.addEventListener("touchmove", move, false); document.addEventListener("touchend", end, false); document.addEventListener("touchcancel", end, false); handle.addEventListener("mousedown", start, false); document.addEventListener("mousemove", move, false); document.addEventListener("mouseup", end, false);
  cleanup.push(function () { handle.removeEventListener("touchstart", start, false); document.removeEventListener("touchmove", move, false); document.removeEventListener("touchend", end, false); document.removeEventListener("touchcancel", end, false); handle.removeEventListener("mousedown", start, false); document.removeEventListener("mousemove", move, false); document.removeEventListener("mouseup", end, false); });
}

function updateShadow() { var lens = document.getElementById("mnDebugLens"), shadow = document.getElementById("mnDebugLensShadow"); if (!lens || !shadow) return; shadow.style.left = (lens.offsetLeft + lens.offsetWidth / 2) + "px"; shadow.style.top = (lens.offsetTop + lens.offsetHeight + 12) + "px"; shadow.style.marginLeft = "-115px"; shadow.style.marginTop = "0"; }

function rangeRow(label,key,min,max,step,digits) { return '<div class="mn-glass-control-row"><label>'+label+'</label><input type="range" data-glass-optic="'+key+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+glassOptics[key]+'"><output data-glass-output="'+key+'">'+Number(glassOptics[key]).toFixed(digits)+'</output></div>' }
function presetButtons() { return ["balanced","control","frosted","lens"].map(function(key){return '<button class="mn-glass-preset '+(glassOptics.preset===key?'active':'')+'" data-glass-preset="'+key+'">'+GLASS_PRESETS[key].name+'</button>'}).join("") }
function syncOpticsControls() {
  Array.prototype.forEach.call(document.querySelectorAll("[data-glass-preset]"),function(button){button.classList.toggle("active",button.getAttribute("data-glass-preset")===glassOptics.preset)})
  Array.prototype.forEach.call(document.querySelectorAll("[data-glass-optic]"),function(input){var key=input.getAttribute("data-glass-optic"),output=document.querySelector('[data-glass-output="'+key+'"]');input.value=glassOptics[key];if(output)output.textContent=Number(glassOptics[key]).toFixed(key==="dispersion"||key==="blur"?1:key==="ior"?2:2)})
}
function bindOpticsControls() {
  Array.prototype.forEach.call(document.querySelectorAll("[data-glass-preset]"),function(button){var click=function(){applyGlassPreset(button.getAttribute("data-glass-preset"));syncOpticsControls()};button.addEventListener("click",click);cleanup.push(function(){button.removeEventListener("click",click)})})
  Array.prototype.forEach.call(document.querySelectorAll("[data-glass-optic]"),function(input){var change=function(){setGlassOptic(input.getAttribute("data-glass-optic"),input.value);syncOpticsControls()};input.addEventListener("input",change);cleanup.push(function(){input.removeEventListener("input",change)})})
  var upload=document.getElementById("mnGlassBackgroundUpload"),reset=document.getElementById("mnGlassBackgroundReset")
  if(upload){var uploadChange=function(){var file=upload.files&&upload.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(){setLiquidGlassCustomBackground(String(reader.result||""))};reader.readAsDataURL(file)};upload.addEventListener("change",uploadChange);cleanup.push(function(){upload.removeEventListener("change",uploadChange)})}
  if(reset){var resetClick=function(){if(upload)upload.value="";setLiquidGlassCustomBackground("")};reset.addEventListener("click",resetClick);cleanup.push(function(){reset.removeEventListener("click",resetClick)})}
}

async function captureScene() {
  if (!renderer || !document.getElementById("mnJustGlassDebug")) return
  if (captureRunning) { captureQueued = true; return }
  captureRunning = true
  captureQueued = false
  if (window.__MN_GLASS_CAPTURE_STATS) window.__MN_GLASS_CAPTURE_STATS.started++
  var debugRoot = document.getElementById("mnJustGlassDebug")
  if (debugRoot) debugRoot.dataset.captureStarted = String(Number(debugRoot.dataset.captureStarted || 0) + 1)
  try {
    const scale = renderer.scale
    const scene = await html2canvas(document.body, {
      backgroundColor: "#ffffff",
      scale,
      width: window.innerWidth,
      height: window.innerHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      scrollX: 0,
      scrollY: 0,
      logging: false,
      useCORS: true,
      ignoreElements: element => element.id === "mnJustGlassDebug" || element.id === "mnLiquidTopbarOptics"
    })
    renderer.uploadScene(scene)
  } catch {
    // Experimental rendering must not interfere with the plugin UI.
  } finally {
    captureRunning = false
    lastCaptureAt = Date.now()
    if (window.__MN_GLASS_CAPTURE_STATS) {
      window.__MN_GLASS_CAPTURE_STATS.completed++
      window.__MN_GLASS_CAPTURE_STATS.lastCompletedAt = lastCaptureAt
    }
    if (debugRoot) {
      debugRoot.dataset.captureCompleted = String(Number(debugRoot.dataset.captureCompleted || 0) + 1)
      debugRoot.dataset.captureLastCompletedAt = String(lastCaptureAt)
    }
    if (captureQueued) scheduleCapture(true)
  }
}

function scheduleCapture(immediate) {
  captureQueued = true
  if (captureRunning || captureTimer) return
  var elapsed = Date.now() - lastCaptureAt
  var delay = immediate ? 0 : Math.max(0, 48 - elapsed)
  captureTimer = window.setTimeout(function () {
    captureTimer = 0
    captureScene()
  }, delay)
}

function makeRenderer() {
  var canvas = document.getElementById("mnDebugScene"), gl = null; try { gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false }) || canvas.getContext("experimental-webgl"); } catch (e) { gl = null; } if (!gl) return null;
  var vs = 'attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.0,1.0);}';
  var fs = [
  'precision mediump float;',
  'uniform sampler2D uScene; uniform vec2 uResolution; uniform vec4 uRect0; uniform vec4 uRect1; uniform float uRadius0; uniform float uRadius1;',
  'uniform float uTime; uniform float uEnergy; uniform float uRefraction; uniform float uDispersion; uniform float uBlur; uniform float uIor; uniform float uFresnel; uniform float uGlare; uniform float uScale;',
  'float rr(vec2 p,vec4 r,float rad){vec2 c=r.xy+r.zw*.5;vec2 q=abs(p-c)-r.zw*.5+rad;return min(max(q.x,q.y),0.0)+length(max(q,vec2(0.0)))-rad;}',
  'float sdf(vec2 p){return min(rr(p,uRect0,uRadius0),rr(p,uRect1,uRadius1));}',
  'vec2 normalAt(vec2 p){float e=1.25*uScale;vec2 g=vec2(sdf(p+vec2(e,0.0))-sdf(p-vec2(e,0.0)),sdf(p+vec2(0.0,e))-sdf(p-vec2(0.0,e)));return normalize(g+vec2(.00001));}',
  'vec3 tex(vec2 p){vec2 uv=clamp(p/uResolution,vec2(.001),vec2(.999));return texture2D(uScene,uv).rgb;}',
  'vec3 blurTex(vec2 p,float r){vec3 c=tex(p)*.30;c+=tex(p+vec2(r,0.0))*.12;c+=tex(p-vec2(r,0.0))*.12;c+=tex(p+vec2(0.0,r))*.12;c+=tex(p-vec2(0.0,r))*.12;c+=tex(p+vec2(r*.72,r*.72))*.055;c+=tex(p-vec2(r*.72,r*.72))*.055;c+=tex(p+vec2(-r*.72,r*.72))*.055;c+=tex(p+vec2(r*.72,-r*.72))*.055;return c;}',
  'void main(){vec2 p=vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y);float s=max(uScale,.001);float d0=rr(p,uRect0,uRadius0);float d1=rr(p,uRect1,uRadius1);float d=min(d0,d1);vec3 color=tex(p);',
  'float f0=(uIor-1.0)/(uIor+1.0);f0=f0*f0;float ss=(1.6*s)*(1.6*s);float contact=exp(-d*d/ss);',
  'if(d>0.0){',
  'if(d<34.0*s){float sh=exp(-.5*d*d/((11.0*s)*(11.0*s)))*.18;color*=1.0-sh;}',
  'color+=vec3(.90,.95,1.0)*contact*.11;}',
  'float aa=max(1.2*s,.75);float inside=1.0-smoothstep(-aa,aa,d);',
  'if(inside>0.0){',
  'float lensMask=step(d1,d0);float depth=min(max(-d,0.0),46.0*s);float edge=clamp(1.0-depth/(46.0*s),0.0,1.0);vec2 n=normalAt(p);',
  'float incident=asin(clamp(edge*edge,-1.0,1.0));float transmitted=asin(clamp(sin(incident)/max(uIor,1.001),-1.0,1.0));float snell=max(-tan(transmitted-incident),0.0);',
  'vec2 edgeOffset=-n*((9.0+snell*70.0)*s)*uRefraction*edge*edge;',
  'vec2 center1=uRect1.xy+uRect1.zw*.5;vec2 local=(p-center1)/max(uRect1.zw*.5,vec2(1.0));float radial=clamp(1.0-dot(local,local),0.0,1.0);vec2 bulge=-local*vec2(26.0*s,19.0*s)*radial*uRefraction*lensMask;',
  'float wobble=sin((p.x+p.y)*(.045/s)+uTime*8.0)*uEnergy*5.5*s*edge;vec2 off=edgeOffset+bulge+n*wobble;',
  'float cap=60.0*s;float ol=length(off);if(ol>cap)off*=cap/ol;',
  'float br=max(.25*s,uBlur*(.30+.70*depth/(46.0*s)));vec2 chrom=n*(0.8+uDispersion*.34)*s*pow(edge,1.35)+normalize(off+vec2(.001))*uDispersion*.10*s;',
  'br*=1.0+min(length(chrom)/(8.0*s),1.2)*.45;',
  'vec3 glass=vec3(blurTex(p+off+chrom,br).r,blurTex(p+off,br).g,blurTex(p+off-chrom,br).b);',
  'glass=mix(glass,vec3(.94,.975,1.0),.03);',
  'float ci=clamp(cos(incident),0.0,1.0);float fres=f0+(1.0-f0)*pow(1.0-ci,5.0);',
  'float rim=pow(edge,5.0);float rimGlow=rim*(uFresnel*.40+fres*.50);glass=glass*(1.0+rimGlow*.65)+vec3(.58,.70,.86)*rimGlow*.26;',
  'glass+=vec3(1.0,.99,.96)*contact*(.08+.13*fres);',
  'vec2 light=normalize(vec2(-.75,-.66));float hi=pow(max(dot(n,light),0.0),24.0)*pow(edge,3.0)*uGlare;glass=mix(glass,vec3(1.0,.995,.975),clamp(hi,0.0,.30));float shade=pow(max(dot(n,-light),0.0),3.0)*edge*.07;glass*=1.0-shade;',
  'color=mix(color,glass,inside);}',
  'gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);}'
  ].join('');
  function compile(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null; return s; }
  var v = compile(gl.VERTEX_SHADER, vs), f = compile(gl.FRAGMENT_SHADER, fs); if (!v || !f) return null; var program = gl.createProgram(); gl.attachShader(program, v); gl.attachShader(program, f); gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null; gl.useProgram(program);
  var buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW); var pos = gl.getAttribLocation(program, "aPosition"); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  var texture = gl.createTexture(), textureWidth = 0, textureHeight = 0; gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  var U = { scene: gl.getUniformLocation(program, "uScene"), res: gl.getUniformLocation(program, "uResolution"), r0: gl.getUniformLocation(program, "uRect0"), r1: gl.getUniformLocation(program, "uRect1"), rad0: gl.getUniformLocation(program, "uRadius0"), rad1: gl.getUniformLocation(program, "uRadius1"), time: gl.getUniformLocation(program, "uTime"), energy: gl.getUniformLocation(program, "uEnergy"), refraction: gl.getUniformLocation(program, "uRefraction"), dispersion: gl.getUniformLocation(program, "uDispersion"), blur: gl.getUniformLocation(program, "uBlur"), ior: gl.getUniformLocation(program, "uIor"), fresnel: gl.getUniformLocation(program, "uFresnel"), glare: gl.getUniformLocation(program, "uGlare"), scale: gl.getUniformLocation(program, "uScale") }; gl.uniform1i(U.scene, 0);
  var api = { ready: true, scale: 1, rect0: [-10000, -10000, 1, 1], rect1: [0, 0, 1, 1], uploadScene: function (scene) { gl.bindTexture(gl.TEXTURE_2D, texture); if(textureWidth===scene.width&&textureHeight===scene.height){gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,scene)}else{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,scene);textureWidth=scene.width;textureHeight=scene.height} api.draw(); }, resize: function () { var w = Math.max(1, document.documentElement.clientWidth), h = Math.max(1, document.documentElement.clientHeight), dpr = window.devicePixelRatio || 1, scale = Math.min(1.15, dpr, 1280 / w); if (scale < .78) scale = .78; api.scale = scale; canvas.width = Math.max(1, Math.floor(w * scale)); canvas.height = Math.max(1, Math.floor(h * scale)); gl.viewport(0, 0, canvas.width, canvas.height); api.syncRects(); scheduleCapture(); }, syncRects: function () { var lens = document.getElementById("mnDebugLens"), r; if (lens) { r = lens.getBoundingClientRect(); api.rect1 = [r.left * api.scale, r.top * api.scale, r.width * api.scale, r.height * api.scale]; canvas.style.clipPath = "inset(" + r.top + "px " + Math.max(0, window.innerWidth - r.right) + "px " + Math.max(0, window.innerHeight - r.bottom) + "px " + r.left + "px round 46px)"; } }, draw: function () { var a = api.rect0, b = api.rect1; gl.useProgram(program); gl.uniform2f(U.res, canvas.width, canvas.height); gl.uniform4f(U.r0, a[0], a[1], a[2], a[3]); gl.uniform4f(U.r1, b[0], b[1], b[2], b[3]); gl.uniform1f(U.rad0, 24 * api.scale); gl.uniform1f(U.rad1, 46 * api.scale); gl.uniform1f(U.time, (new Date()).getTime() / 1000); gl.uniform1f(U.energy, state.dragEnergy); gl.uniform1f(U.refraction, glassOptics.refraction); gl.uniform1f(U.dispersion, glassOptics.dispersion); gl.uniform1f(U.blur, glassOptics.blur * api.scale); gl.uniform1f(U.ior, glassOptics.ior); gl.uniform1f(U.fresnel, glassOptics.fresnel); gl.uniform1f(U.glare, glassOptics.glare); gl.uniform1f(U.scale, api.scale); gl.drawArrays(gl.TRIANGLES, 0, 6); } };
  api.resize(); return api;
}

var animationFrame = 0
function scrollSignature() {
  return Array.prototype.map.call(document.querySelectorAll("main,.overviewPage,.reviewPage,.settingsPage,.exportPage,.mistakeList,.detailPane"), function (element) {
    return String(Math.round(element.scrollLeft || 0)) + ":" + String(Math.round(element.scrollTop || 0))
  }).join("|")
}
function animate() {
  if (renderer && renderer.ready) {
    state.dragEnergy *= .90
    if (state.dragEnergy < .003) state.dragEnergy = 0
    renderer.draw()
    var nextScrollSignature = scrollSignature()
    if (nextScrollSignature !== lastScrollSignature) {
      lastScrollSignature = nextScrollSignature
      var liveScene = getLiquidGlassComposedScene()
      if (liveScene) renderer.uploadScene(liveScene)
      else scheduleCapture(true)
    }
  }
  animationFrame = window.requestAnimationFrame(animate)
}

export function mountJustGlassDebug() {
  if (document.getElementById("mnJustGlassDebug")) return
  window.__MN_GLASS_CAPTURE_STATS = { started: 0, completed: 0, lastCompletedAt: 0 }
  var root = document.createElement("div")
  root.id = "mnJustGlassDebug"
  root.className = "mn-debug-glass"
  root.dataset.captureStarted = "0"
  root.dataset.captureCompleted = "0"
  root.innerHTML = '<canvas id="mnDebugScene"></canvas><div id="mnDebugLensShadow" class="jelly-shadow"></div><div id="mnDebugLens" class="mn-debug-lens glass-shell"><div class="lens-content"><div class="lens-kicker">REAL-TIME LENS</div><div class="lens-title">拖动我</div><div class="lens-copy">观察下方插件界面在玻璃内部发生位移、放大与 RGB 色散。</div><span class="drag-chip">按住并滑动</span></div></div><div id="mnGlassControls" class="mn-glass-control-dock static-shell"><div class="mn-glass-control-title"><strong>光学参数</strong><span>Just Glass v0.3.1</span></div><div class="mn-glass-presets">'+presetButtons()+'</div>'+rangeRow("IOR","ior",1.01,2,.01,2)+rangeRow("折射强度","refraction",0,3,.05,2)+rangeRow("RGB 色散","dispersion",0,20,.5,1)+rangeRow("背景模糊","blur",0,12,.5,1)+rangeRow("Fresnel","fresnel",0,1,.02,2)+rangeRow("Glare","glare",0,1,.02,2)+'<div class="mn-glass-background-tools"><label>自定义背景<input id="mnGlassBackgroundUpload" type="file" accept="image/*"></label><button id="mnGlassBackgroundReset" type="button">恢复默认</button></div><div class="mn-glass-hint">参数同时作用于悬浮顶栏和可拖动玻璃；题目 iframe 内容也进入实时折射纹理。</div></div>'
  document.body.appendChild(root)
  var lens = document.getElementById("mnDebugLens")
  lens.style.left = Math.round((window.innerWidth - lens.offsetWidth) / 2) + "px"
  lens.style.top = Math.round((window.innerHeight - lens.offsetHeight) / 2 - 5) + "px"
  updateShadow()
  renderer = makeRenderer()
  if (renderer) root.classList.add("webgl-ready")
  makeDraggable(lens, lens, true)
  bindOpticsControls()
  var resize = function () { if (!renderer) return; var maxX = Math.max(0, window.innerWidth - lens.offsetWidth), maxY = Math.max(0, window.innerHeight - lens.offsetHeight); lens.style.left = Math.max(0, Math.min(maxX, lens.offsetLeft)) + "px"; lens.style.top = Math.max(0, Math.min(maxY, lens.offsetTop)) + "px"; updateShadow(); renderer.resize(); }
  window.addEventListener("resize", resize, false)
  cleanup.push(function () { window.removeEventListener("resize", resize, false); })
  var observer = new MutationObserver(scheduleCapture)
  var appRoot = document.getElementById("root")
  if (appRoot) observer.observe(appRoot, { childList: true, subtree: true, characterData: true })
  cleanup.push(function () { observer.disconnect(); })
  animationFrame = window.requestAnimationFrame(animate)
  lastScrollSignature = scrollSignature()
  scheduleCapture()
}

export function unmountJustGlassDebug() {
  clearTimeout(captureTimer)
  window.cancelAnimationFrame(animationFrame)
  cleanup.splice(0).forEach(fn => fn())
  document.getElementById("mnJustGlassDebug")?.remove()
  renderer = null
  captureRunning = false
  captureQueued = false
  lastCaptureAt = 0
  lastScrollSignature = ""
  delete window.__MN_GLASS_CAPTURE_STATS
}
