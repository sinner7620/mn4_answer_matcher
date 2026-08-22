import html2canvas from "html2canvas"
import { glassOptics } from "./glass-optics-settings"

// The scene generator comes from Just Glass v0.3.1. The WebGL shader and
// topbar/tab geometry come from MN Liquid Glass Demo v0.12.2.
var backgroundCanvas = null
var opticalCanvas = null
var renderer = null
var animationFrame = 0
var cleanup = []
var startedAt = 0
var sceneCanvas = null
var sceneContext = null
var pageSnapshot = null
var frameSnapshots = []
var customBackgroundImage = null
var captureRunning = false
var captureQueued = false
var captureTimer = 0
var sceneRevision = 0
var lastSceneSignature = ""

function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
function drawBlob(ctx,x,y,r,color){var g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(.35,color);g.addColorStop(1,"rgba(255,255,255,0)");ctx.save();ctx.globalAlpha=.55;ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore();}
function drawCard(ctx,x,y,w,h,title,lines){var i;ctx.save();roundRect(ctx,x,y,w,h,22);ctx.fillStyle="rgba(255,255,255,.52)";ctx.fill();ctx.strokeStyle="rgba(255,255,255,.82)";ctx.stroke();ctx.fillStyle="rgba(20,52,89,.82)";ctx.font="900 15px -apple-system,Arial";ctx.fillText(title,x+20,y+30);ctx.font="700 12px -apple-system,Arial";ctx.fillStyle="rgba(35,71,109,.62)";for(i=0;i<lines.length;i++)ctx.fillText(lines[i],x+20,y+58+i*22);ctx.restore();}

function drawJustGlassBackground(canvas, scale) {
  var ctx=canvas.getContext("2d"),g,x,y,cardW,cardH;if(!ctx)return;ctx.save();ctx.scale(scale,scale);var w=canvas.width/scale,h=canvas.height/scale;
  if(customBackgroundImage){var iw=customBackgroundImage.naturalWidth||customBackgroundImage.width||1,ih=customBackgroundImage.naturalHeight||customBackgroundImage.height||1,cover=Math.max(w/iw,h/ih),dw=iw*cover,dh=ih*cover;ctx.fillStyle="#dfeeff";ctx.fillRect(0,0,w,h);ctx.drawImage(customBackgroundImage,(w-dw)/2,(h-dh)/2,dw,dh);ctx.restore();return}
  g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,"#b9d8ff");g.addColorStop(.42,"#eef3ff");g.addColorStop(.72,"#d8e7ff");g.addColorStop(1,"#c8f1e8");ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  ctx.globalAlpha=.42;ctx.strokeStyle="#ffffff";ctx.lineWidth=1;for(x=0;x<w;x+=38){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(y=0;y<h;y+=38){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}ctx.globalAlpha=1;
  drawBlob(ctx,w*.17,h*.24,130,"#4b9cff");drawBlob(ctx,w*.83,h*.22,150,"#9d63ff");drawBlob(ctx,w*.72,h*.78,170,"#27c9ad");drawBlob(ctx,w*.34,h*.78,115,"#ff9b7a");
  ctx.fillStyle="rgba(18,51,88,.90)";ctx.font="900 58px -apple-system,Arial";ctx.fillText("LIQUID",48,158);ctx.fillText("GLASS",48,218);ctx.font="800 15px -apple-system,Arial";ctx.fillStyle="rgba(28,66,108,.62)";ctx.fillText("DRAG THE LENS ACROSS THESE LETTERS",51,246);
  cardW=Math.min(390,w*.38);cardH=132;drawCard(ctx,w-cardW-50,112,cardW,cardH,"REFRACTION",["Grid lines should bend","Letters should shift","Edges should feel thick"]);drawCard(ctx,48,h-215,Math.min(365,w*.36),145,"RGB DISPERSION",["RED  /  GREEN  /  BLUE","Move quickly for liquid wobble","Lens preset is intentionally strong"]);drawCard(ctx,w-Math.min(390,w*.38)-50,h-225,Math.min(390,w*.38),150,"FRESNEL + GLARE",["Bright rim follows surface normal","Opposite edge darkens slightly","Background stays readable"]);
  ctx.save();ctx.translate(w*.52,h*.48);ctx.rotate(-.17);ctx.fillStyle="rgba(24,57,93,.10)";for(x=-320;x<320;x+=24)ctx.fillRect(x,-45,12,190);ctx.restore();ctx.font="900 28px -apple-system,Arial";ctx.fillStyle="rgba(26,59,96,.20)";ctx.fillText("0123456789  ABCDEFG",Math.max(40,w*.26),h*.58);ctx.restore();
}

async function captureFrame(frame, scale) {
  try {
    var doc=frame.contentDocument,body=doc&&(doc.body||doc.documentElement);if(!body)return null
    var width=Math.max(1,body.scrollWidth,doc.documentElement.scrollWidth,frame.clientWidth),height=Math.max(1,body.scrollHeight,doc.documentElement.scrollHeight,frame.clientHeight)
    var canvas=await html2canvas(body,{backgroundColor:"#ffffff",scale:scale,width:width,height:height,windowWidth:Math.max(1,frame.clientWidth),windowHeight:Math.max(1,frame.clientHeight),scrollX:0,scrollY:0,logging:false,useCORS:true})
    return {element:frame,canvas:canvas}
  } catch(error) { return null }
}

function activePage() {
  var pages=document.querySelectorAll(".overviewPage,.mistakeSection,.reviewPage,.settingsPage,.exportPage")
  for(var i=0;i<pages.length;i++){var style=getComputedStyle(pages[i]);if(style.display!=="none"&&style.visibility!=="hidden")return pages[i]}
  return null
}

async function captureActivePage() {
  if(!renderer)return
  if(captureRunning){captureQueued=true;return}
  var page=activePage();if(!page)return
  captureRunning=true;captureQueued=false
  try {
    var width=Math.max(1,page.scrollWidth,page.offsetWidth),height=Math.max(1,page.scrollHeight,page.offsetHeight)
    var canvas=await html2canvas(page,{backgroundColor:null,scale:renderer.scale,width:width,height:height,windowWidth:window.innerWidth,windowHeight:Math.max(window.innerHeight,height),scrollX:0,scrollY:0,logging:false,useCORS:true,ignoreElements:function(element){return element.tagName==="IFRAME"||element.id==="mnJustGlassDebug"||element.id==="mnLiquidTopbarOptics"||element.id==="mnJustGlassBackground"}})
    var frames=await Promise.all(Array.prototype.map.call(page.querySelectorAll("iframe"),function(frame){return captureFrame(frame,renderer.scale)}))
    if(page===activePage()){pageSnapshot={canvas:canvas,element:page};frameSnapshots=frames.filter(Boolean);if(opticalCanvas)opticalCanvas.dataset.frameSnapshots=String(frameSnapshots.length);sceneRevision++;lastSceneSignature=""}
  } catch(error) {
    // The experimental surface must never block the regular plugin UI.
  } finally {
    captureRunning=false
    if(captureQueued)schedulePageCapture(0)
  }
}

function schedulePageCapture(delay) {
  captureQueued=true
  if(captureRunning||captureTimer)return
  captureTimer=window.setTimeout(function(){captureTimer=0;captureActivePage()},delay==null?80:delay)
}

function composeScene(force) {
  if(!renderer||!sceneCanvas||!sceneContext)return null
  var page=activePage(),rect=page?page.getBoundingClientRect():null
  var frameSignature=frameSnapshots.map(function(item){var win=item.element.contentWindow,r=item.element.getBoundingClientRect();return [Math.round(r.left*10),Math.round(r.top*10),Math.round((win&&win.scrollX||0)*10),Math.round((win&&win.scrollY||0)*10)].join(",")}).join(";")
  var signature=[sceneRevision,page?page.className:"",rect?Math.round(rect.left*10):0,rect?Math.round(rect.top*10):0,frameSignature,window.innerWidth,window.innerHeight].join(":")
  if(!force&&signature===lastSceneSignature)return sceneCanvas
  lastSceneSignature=signature
  sceneContext.setTransform(1,0,0,1,0,0)
  sceneContext.clearRect(0,0,sceneCanvas.width,sceneCanvas.height)
  sceneContext.drawImage(backgroundCanvas,0,0,sceneCanvas.width,sceneCanvas.height)
  if(pageSnapshot&&pageSnapshot.element===page&&rect){
    sceneContext.drawImage(pageSnapshot.canvas,Math.round(rect.left*renderer.scale),Math.round(rect.top*renderer.scale))
  }
  frameSnapshots.forEach(function(item){var frame=item.element;if(!page||!page.contains(frame))return;var r=frame.getBoundingClientRect(),win=frame.contentWindow,sx=Math.max(0,(win&&win.scrollX||0)*renderer.scale),sy=Math.max(0,(win&&win.scrollY||0)*renderer.scale),sw=Math.min(item.canvas.width-sx,r.width*renderer.scale),sh=Math.min(item.canvas.height-sy,r.height*renderer.scale);if(sw>0&&sh>0)sceneContext.drawImage(item.canvas,sx,sy,sw,sh,Math.round(r.left*renderer.scale),Math.round(r.top*renderer.scale),sw,sh)})
  renderer.uploadScene(sceneCanvas)
  return sceneCanvas
}

function lensRect(nav) {
  var navRect=nav.getBoundingClientRect(),style=getComputedStyle(nav),left=parseFloat(style.getPropertyValue("--lg-lens-left")),width=parseFloat(style.getPropertyValue("--lg-lens-width"));
  if(!isFinite(left)||!isFinite(width)||width<8){var active=nav.querySelector("button.active");if(!active)return null;left=active.offsetLeft;width=active.offsetWidth;}
  return {left:navRect.left+left,top:navRect.top+4,width:width,height:Math.max(8,navRect.height-8)};
}

function makeRenderer() {
  var gl=null;try{gl=opticalCanvas.getContext("webgl",{alpha:false,antialias:false,depth:false,stencil:false,premultipliedAlpha:false,preserveDrawingBuffer:false})||opticalCanvas.getContext("experimental-webgl");}catch(error){gl=null;}if(!gl)return null;
  var vs='attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.0,1.0);}';
  var fs=[
    'precision mediump float;',
    'uniform sampler2D uScene; uniform vec2 uResolution; uniform vec4 uRect0; uniform vec4 uRect1; uniform float uRadius0; uniform float uRadius1;',
    'uniform float uTime; uniform float uEnergy; uniform float uRefraction; uniform float uDispersion; uniform float uBlur; uniform float uIor; uniform float uFresnel; uniform float uGlare;',
    'float rr(vec2 p,vec4 r,float rad){vec2 c=r.xy+r.zw*.5;vec2 q=abs(p-c)-r.zw*.5+rad;return min(max(q.x,q.y),0.0)+length(max(q,vec2(0.0)))-rad;}',
    'float sdf0(vec2 p){return rr(p,uRect0,uRadius0);}',
    'float sdf1(vec2 p){return rr(p,uRect1,uRadius1);}',
    'vec2 normal0(vec2 p){float e=1.2;vec2 g=vec2(sdf0(p+vec2(e,0.0))-sdf0(p-vec2(e,0.0)),sdf0(p+vec2(0.0,e))-sdf0(p-vec2(0.0,e)));return normalize(g+vec2(.00001));}',
    'vec2 normal1(vec2 p){float e=1.2;vec2 g=vec2(sdf1(p+vec2(e,0.0))-sdf1(p-vec2(e,0.0)),sdf1(p+vec2(0.0,e))-sdf1(p-vec2(0.0,e)));return normalize(g+vec2(.00001));}',
    'vec3 tex(vec2 p){vec2 uv=clamp(p/uResolution,vec2(.001),vec2(.999));return texture2D(uScene,uv).rgb;}',
    'vec3 blurTex(vec2 p,float r){vec3 c=tex(p)*.30;c+=tex(p+vec2(r,0.0))*.12;c+=tex(p-vec2(r,0.0))*.12;c+=tex(p+vec2(0.0,r))*.12;c+=tex(p-vec2(0.0,r))*.12;c+=tex(p+vec2(r*.72,r*.72))*.055;c+=tex(p-vec2(r*.72,r*.72))*.055;c+=tex(p+vec2(-r*.72,r*.72))*.055;c+=tex(p+vec2(r*.72,-r*.72))*.055;return c;}',
    'void main(){vec2 p=vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y);float d0=rr(p,uRect0,uRadius0);float d1=rr(p,uRect1,uRadius1);float d=d1<0.0?d1:d0;vec3 color=tex(p);',
    'if(d>0.0&&d<34.0){float sh=exp(-.5*d*d/(11.0*11.0))*.18;color*=1.0-sh;}',
    'if(d<0.0){float lensMask=step(d1,0.0);float depth=min(-d,46.0);float edge=clamp(1.0-depth/46.0,0.0,1.0);vec2 n=lensMask>.5?normal1(p):normal0(p);',
    'float ratio=clamp(1.0-depth/46.0,0.0,1.0);float incident=asin(clamp(ratio*ratio,-1.0,1.0));float transmitted=asin(clamp(sin(incident)/max(uIor,1.001),-1.0,1.0));float snell=max(-tan(transmitted-incident),0.0);',
    'vec2 edgeOffset=-n*(10.0+snell*82.0)*uRefraction*edge*edge;',
    'vec2 center1=uRect1.xy+uRect1.zw*.5;vec2 local=(p-center1)/max(uRect1.zw*.5,vec2(1.0));float radial=clamp(1.0-dot(local,local),0.0,1.0);vec2 bulge=-local*vec2(30.0,22.0)*radial*uRefraction*lensMask;',
    'float wobble=sin((p.x+p.y)*.045+uTime*8.0)*uEnergy*5.5*edge;vec2 off=edgeOffset+bulge+n*wobble;',
    'float br=max(.25,uBlur*(.30+.70*clamp(depth/46.0,0.0,1.0)));vec2 chrom=n*(1.4+uDispersion*.62)*edge+normalize(off+vec2(.001))*uDispersion*.20;',
    'float r=blurTex(p+off+chrom,br).r;float g=blurTex(p+off,br).g;float b=blurTex(p+off-chrom,br).b;color=vec3(r,g,b);',
    'color=mix(color,vec3(.94,.975,1.0),.035+.055*edge);float f0=(uIor-1.0)/(uIor+1.0);f0=f0*f0;float ci=clamp(cos(incident),0.0,1.0);float fres=f0+(1.0-f0)*pow(1.0-ci,5.0);float rim=pow(edge,1.35)*uFresnel;color=mix(color,vec3(1.0),clamp(rim*.62+fres*.35,0.0,.72));',
    'vec2 light=normalize(vec2(-.75,-.66));float hi=pow(max(dot(n,light),0.0),3.0)*pow(edge,1.25)*uGlare;color=mix(color,vec3(1.0,.995,.97),clamp(hi,0.0,.68));float shade=pow(max(dot(n,-light),0.0),2.5)*edge*.10;color*=1.0-shade;float line=exp(-abs(d)*.72)*.22;color+=vec3(line);}',
    'gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);}'
  ].join('');
  function compile(type,source){var shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))return null;return shader;}
  var vertex=compile(gl.VERTEX_SHADER,vs),fragment=compile(gl.FRAGMENT_SHADER,fs);if(!vertex||!fragment)return null;var program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))return null;gl.useProgram(program);
  var buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);var pos=gl.getAttribLocation(program,"aPosition");gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  var texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  var U={scene:gl.getUniformLocation(program,"uScene"),res:gl.getUniformLocation(program,"uResolution"),r0:gl.getUniformLocation(program,"uRect0"),r1:gl.getUniformLocation(program,"uRect1"),rad0:gl.getUniformLocation(program,"uRadius0"),rad1:gl.getUniformLocation(program,"uRadius1"),time:gl.getUniformLocation(program,"uTime"),energy:gl.getUniformLocation(program,"uEnergy"),refraction:gl.getUniformLocation(program,"uRefraction"),dispersion:gl.getUniformLocation(program,"uDispersion"),blur:gl.getUniformLocation(program,"uBlur"),ior:gl.getUniformLocation(program,"uIor"),fresnel:gl.getUniformLocation(program,"uFresnel"),glare:gl.getUniformLocation(program,"uGlare")};gl.uniform1i(U.scene,0);
  var api={scale:1,rect0:[0,0,1,1],rect1:[0,0,1,1],rad0:24,rad1:16,uploadScene:function(scene){gl.bindTexture(gl.TEXTURE_2D,texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,scene);},resize:function(){var w=Math.max(1,document.documentElement.clientWidth),h=Math.max(1,document.documentElement.clientHeight),dpr=window.devicePixelRatio||1,scale=Math.min(1.15,dpr,1280/w);if(scale<.68)scale=.68;api.scale=scale;opticalCanvas.width=Math.max(1,Math.floor(w*scale));opticalCanvas.height=Math.max(1,Math.floor(h*scale));backgroundCanvas.width=opticalCanvas.width;backgroundCanvas.height=opticalCanvas.height;sceneCanvas.width=opticalCanvas.width;sceneCanvas.height=opticalCanvas.height;drawJustGlassBackground(backgroundCanvas,scale);gl.viewport(0,0,opticalCanvas.width,opticalCanvas.height);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,opticalCanvas.width,opticalCanvas.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);lastSceneSignature="";composeScene(true);api.syncRects();api.draw();schedulePageCapture(0);},refreshBackground:function(){drawJustGlassBackground(backgroundCanvas,api.scale);lastSceneSignature="";composeScene(true)},syncRects:function(){var top=document.querySelector(".mn-liquid-glass-topbar .topBar"),nav=document.querySelector(".mn-liquid-glass-topbar .topNav"),r,l;if(top){r=top.getBoundingClientRect();api.rect0=[r.left*api.scale,r.top*api.scale,r.width*api.scale,r.height*api.scale];api.rad0=Math.min(25,r.height*.48)*api.scale;opticalCanvas.style.clipPath="inset("+r.top+"px "+Math.max(0,window.innerWidth-r.right)+"px "+Math.max(0,window.innerHeight-r.bottom)+"px "+r.left+"px round 25px)";}if(nav){l=lensRect(nav);if(l){api.rect1=[l.left*api.scale,l.top*api.scale,l.width*api.scale,l.height*api.scale];api.rad1=Math.min(18,l.height*.50)*api.scale;}}},draw:function(){var nav=document.querySelector(".mn-liquid-glass-topbar .topNav"),a=api.rect0,b=api.rect1,energy=nav?(parseFloat(getComputedStyle(nav).getPropertyValue("--lg-drag-energy"))||0):0;gl.useProgram(program);gl.uniform2f(U.res,opticalCanvas.width,opticalCanvas.height);gl.uniform4f(U.r0,a[0],a[1],a[2],a[3]);gl.uniform4f(U.r1,b[0],b[1],b[2],b[3]);gl.uniform1f(U.rad0,api.rad0);gl.uniform1f(U.rad1,api.rad1);gl.uniform1f(U.time,(Date.now()-startedAt)/1000);gl.uniform1f(U.energy,energy);gl.uniform1f(U.refraction,glassOptics.refraction);gl.uniform1f(U.dispersion,glassOptics.dispersion);gl.uniform1f(U.blur,glassOptics.blur*api.scale);gl.uniform1f(U.ior,glassOptics.ior);gl.uniform1f(U.fresnel,glassOptics.fresnel);gl.uniform1f(U.glare,glassOptics.glare);gl.drawArrays(gl.TRIANGLES,0,6);}};
  return api;
}

function animate(){if(renderer){composeScene(false);renderer.syncRects();renderer.draw();}animationFrame=requestAnimationFrame(animate);}

export function getLiquidGlassComposedScene() { return composeScene(false) }

export function setLiquidGlassCustomBackground(dataUrl) {
  if(!dataUrl){customBackgroundImage=null;if(renderer)renderer.refreshBackground();return}
  var image=new Image();image.onload=function(){customBackgroundImage=image;if(renderer)renderer.refreshBackground()};image.src=dataUrl
}

export function mountLiquidGlassTopbarOptics() {
  if (renderer) return
  var topbar=document.querySelector(".mn-liquid-glass-topbar .topBar");if(!topbar)return
  startedAt=Date.now()
  backgroundCanvas=document.createElement("canvas");backgroundCanvas.id="mnJustGlassBackground";backgroundCanvas.setAttribute("aria-hidden","true");document.body.insertBefore(backgroundCanvas,document.body.firstChild)
  var initialScale=Math.min(1.15,window.devicePixelRatio||1,1280/Math.max(1,window.innerWidth));if(initialScale<.68)initialScale=.68;backgroundCanvas.width=Math.max(1,Math.floor(window.innerWidth*initialScale));backgroundCanvas.height=Math.max(1,Math.floor(window.innerHeight*initialScale));drawJustGlassBackground(backgroundCanvas,initialScale)
  document.documentElement.classList.add("mn-experimental-just-glass-background")
  sceneCanvas=document.createElement("canvas");sceneContext=sceneCanvas.getContext("2d",{alpha:false})
  opticalCanvas=document.createElement("canvas");opticalCanvas.id="mnLiquidTopbarOptics";opticalCanvas.setAttribute("aria-hidden","true");document.body.appendChild(opticalCanvas)
  renderer=makeRenderer()
  if(!renderer)return
  document.documentElement.classList.add("mn-liquid-optical-ready")
  renderer.resize()
  var resize=function(){renderer&&renderer.resize()};window.addEventListener("resize",resize,false);cleanup.push(function(){window.removeEventListener("resize",resize,false)})
  var observer=new MutationObserver(function(){schedulePageCapture(80)}),appRoot=document.getElementById("root");if(appRoot)observer.observe(appRoot,{childList:true,subtree:true,characterData:true});cleanup.push(function(){observer.disconnect()})
  var frameLoad=function(event){if(event.target&&event.target.tagName==="IFRAME")schedulePageCapture(0)};window.addEventListener("load",frameLoad,true);cleanup.push(function(){window.removeEventListener("load",frameLoad,true)})
  animationFrame=requestAnimationFrame(animate)
}

export function unmountLiquidGlassTopbarOptics() {
  cancelAnimationFrame(animationFrame);clearTimeout(captureTimer);cleanup.splice(0).forEach(function(fn){fn()});document.documentElement.classList.remove("mn-liquid-optical-ready","mn-experimental-just-glass-background");opticalCanvas?.remove();backgroundCanvas?.remove();renderer=null;opticalCanvas=null;backgroundCanvas=null;sceneCanvas=null;sceneContext=null;pageSnapshot=null;frameSnapshots=[];customBackgroundImage=null;captureRunning=false;captureQueued=false;captureTimer=0;sceneRevision=0;lastSceneSignature=""
}
