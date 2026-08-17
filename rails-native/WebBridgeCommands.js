var __MNAM_WEB_BRIDGE_GLOBAL__ = (function () {
  var PDF_RENDER_TIMEOUT = 20;

  function clearPdfRenderTimer(controller) {
    if (!controller || !controller.exportPdfRenderTimer) return;
    try { controller.exportPdfRenderTimer.invalidate(); } catch (error) {}
    controller.exportPdfRenderTimer = null;
  }

  function clearPdfCleanupTimer(controller) {
    if (!controller || !controller.exportPdfCleanupTimer) return;
    try { controller.exportPdfCleanupTimer.invalidate(); } catch (error) {}
    controller.exportPdfCleanupTimer = null;
  }

  function releasePdfRequest(controller) {
    if (!controller) return;
    clearPdfRenderTimer(controller);
    clearPdfCleanupTimer(controller);
    if (controller.exportWebView) {
      controller.exportWebView.delegate = null;
      try { if (controller.exportWebView.superview) controller.exportWebView.removeFromSuperview(); } catch (error) {}
    }
    controller.exportWebView = null;
    controller.exportPdfRequest = null;
    controller.exportPdfRenderStarted = false;
  }

  function rejectPdfRequest(controller, error) {
    var request = controller && controller.exportPdfRequest;
    if (!request) return;
    releasePdfRequest(controller);
    request.reject(error instanceof Error ? error : new Error(String(error)));
  }

  function pdfReadinessScript() {
    return '<script>(function(){' +
      'window.__MN_PDF_EXPORT_PROTOCOL_V2__=true;' +
      'var started=false,notified=false,readyTimer=null;' +
      'function signal(name,message){if(notified)return;notified=true;if(readyTimer)clearTimeout(readyTimer);var frame=document.createElement("iframe");frame.style.display="none";frame.src="mnaddon://"+name+(message?"?message="+encodeURIComponent(message):"");document.body.appendChild(frame)}' +
      'function markBrokenImage(image){try{var holder=document.createElement("div");holder.setAttribute("data-pdf-image-error","true");holder.textContent="图片加载失败，原位置已保留";holder.style.cssText="min-height:48px;padding:14px;border:1px dashed #cbd5e1;border-radius:6px;background:#f8fafc;color:#64748b;text-align:center;font-size:11px";image.style.display="none";if(image.parentNode)image.parentNode.insertBefore(holder,image.nextSibling)}catch(error){}}' +
      'function waitForImages(){return new Promise(function(resolve){var images=Array.prototype.slice.call(document.images||[]),remaining=images.length,failed=0,settled=false;if(!remaining){resolve(0);return}function finish(){if(settled)return;settled=true;clearTimeout(timer);resolve(failed)}function done(ok,image){if(settled||image.__mnPdfImageSettled)return;image.__mnPdfImageSettled=true;if(!ok){failed+=1;markBrokenImage(image)}remaining-=1;if(!remaining)finish()}var timer=setTimeout(function(){images.forEach(function(image){if(!image.__mnPdfImageSettled){image.__mnPdfImageSettled=true;failed+=1;markBrokenImage(image)}});finish()},5000);images.forEach(function(image){if(image.complete){done(image.naturalWidth!==0,image);return}function loaded(){cleanup();done(true,image)}function broken(){cleanup();done(false,image)}function cleanup(){image.removeEventListener("load",loaded);image.removeEventListener("error",broken)}image.addEventListener("load",loaded);image.addEventListener("error",broken)})})}' +
      'function waitForFonts(){return new Promise(function(resolve){var settled=false,timer=setTimeout(done,3000);function done(){if(settled)return;settled=true;clearTimeout(timer);resolve()}var fonts=document.fonts&&document.fonts.ready;if(fonts&&typeof fonts.then==="function")fonts.then(done,done);else done()})}' +
      'function canvasFingerprint(canvas){try{var data=canvas.toDataURL("image/png"),hash=0,step=Math.max(1,Math.floor(data.length/64));for(var i=0;i<data.length;i+=step)hash=((hash<<5)-hash+data.charCodeAt(i))|0;return canvas.width+"x"+canvas.height+":"+data.length+":"+hash}catch(error){return canvas.width+"x"+canvas.height+":unavailable"}}' +
      'function layoutSignature(){var root=document.documentElement,body=document.body,canvases=Array.prototype.slice.call(document.querySelectorAll("canvas")).map(canvasFingerprint).join(","),images=Array.prototype.slice.call(document.images||[]).map(function(image){return image.complete+":"+image.naturalWidth+"x"+image.naturalHeight}).join(",");return Math.max(root.scrollWidth,body.scrollWidth)+"x"+Math.max(root.scrollHeight,body.scrollHeight)+"|"+document.querySelectorAll("*").length+"|"+images+"|"+canvases}' +
      'function waitForStableRender(){return new Promise(function(resolve,reject){var deadline=Date.now()+10000,notBefore=Date.now()+600,previous="",stable=0;function sample(){requestAnimationFrame(function(){var current=layoutSignature();stable=current===previous?stable+1:0;previous=current;if(Date.now()>=notBefore&&stable>=3){resolve();return}if(Date.now()>deadline){reject(new Error("页面内容在限定时间内未稳定"));return}setTimeout(sample,120)})}sample()})}' +
      'function waitForFrames(count){return new Promise(function(resolve){function next(){if(count--<=0){resolve();return}requestAnimationFrame(next)}next()})}' +
      'window.__MN_PDF_EXPORT_BEGIN__=function(){if(started)return;started=true;readyTimer=setTimeout(function(){signal("pdf-render-ready")},9000);Promise.all([waitForFonts(),waitForImages()]).then(function(){return waitForStableRender()}).then(function(){return waitForFrames(2)}).then(function(){signal("pdf-render-ready")}).catch(function(error){signal("pdf-render-error",error&&error.message?error.message:String(error))})}' +
      '})();<\/script>';
  }

  function preparePdfHtml(html) {
    var source = String(html || "");
    if (source.indexOf("__MN_PDF_FILE_FALLBACK__") >= 0) return source;
    var script = (source.indexOf("__MN_PDF_EXPORT_PROTOCOL_V2__") >= 0 ? "" : pdfReadinessScript()) +
      '<script src="./html2canvas.min.js"></script>' +
      '<script src="./jspdf.umd.min.js"></script>' +
      '<script src="./pdf-export-runtime.js"></script>';
    var bodyEnd = source.toLowerCase().lastIndexOf("</body>");
    return bodyEnd < 0 ? source + script : source.slice(0, bodyEnd) + script + source.slice(bodyEnd);
  }

  function stagePdfRenderPage(controller, html) {
    var app = Application.sharedInstance();
    var root = app.tempPath || app.documentPath;
    if (!root) throw new Error("当前 MarginNote 未提供 PDF 临时目录");
    var manager = NSFileManager.defaultManager();
    var directory = String(root).replace(/\/$/, "") + "/MN4AnswerMatcherPdfRuntime-beta33";
    if (!manager.fileExistsAtPath(directory) &&
        !manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(directory, true, null)) {
      throw new Error("PDF 临时目录创建失败");
    }
    ["html2canvas.min.js", "jspdf.umd.min.js", "pdf-export-runtime.js"].forEach(function (name) {
      var destination = directory + "/" + name;
      var source = String(controller.mainPath || "") + "/web-dist/vendor/" + name;
      if (!manager.fileExistsAtPath(source)) throw new Error("PDF 兼容资源不存在：" + name);
      if (manager.fileExistsAtPath(destination)) {
        try { manager.removeItemAtPath(destination); } catch (error) {}
      }
      manager.copyItemAtPathToPath(source, destination);
      if (!manager.fileExistsAtPath(destination)) throw new Error("PDF 兼容资源复制失败：" + name);
    });
    var pagePath = directory + "/render.html";
    var data = NSData.dataWithStringEncoding(preparePdfHtml(html), 4);
    if (!data || !dataLength(data) || !data.writeToFileAtomically(pagePath, true)) {
      throw new Error("PDF 渲染页面写入失败");
    }
    controller.exportPdfRenderHtmlPath = pagePath;
    return pagePath;
  }

  function dataLength(data) {
    if (!data) return 0;
    try { return typeof data.length === "function" ? Number(data.length()) : Number(data.length || 0); } catch (error) { return 0; }
  }

  function decodeBase64ToBinaryString(value) {
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var source = String(value || "").replace(/\s/g, "");
    var parts = [];
    var part = "";
    var buffer = 0;
    var bits = 0;
    for (var index = 0; index < source.length; index += 1) {
      var character = source.charAt(index);
      if (character === "=") break;
      var code = alphabet.indexOf(character);
      if (code < 0) throw new Error("PDF Base64 数据无效");
      buffer = (buffer << 6) | code;
      bits += 6;
      while (bits >= 8) {
        bits -= 8;
        part += String.fromCharCode((buffer >> bits) & 255);
        buffer = bits ? buffer & ((1 << bits) - 1) : 0;
        if (part.length >= 16384) {
          parts.push(part);
          part = "";
        }
      }
    }
    if (part) parts.push(part);
    return parts.join("");
  }

  function decodePdfBase64(base64) {
    var binary = decodeBase64ToBinaryString(base64);
    var data = NSData.dataWithStringEncoding(binary, 5);
    if (!data || !dataLength(data)) throw new Error("PDF 二进制数据转换失败");
    return data;
  }

  function saveGeneratedPdf(controller, webView, info, chunks) {
    var request = controller && controller.exportPdfRequest;
    if (!request || webView !== controller.exportWebView) return;
    try {
      var base64 = chunks.join("");
      if (base64.length !== Number(info.base64Length)) throw new Error("PDF 数据接收不完整");
      var data = decodePdfBase64(base64);
      var app = Application.sharedInstance();
      var root = app.tempPath || app.documentPath;
      if (!root || typeof app.saveFileWithUti !== "function") throw new Error("当前 MarginNote 未提供文件保存接口");
      var filename = String(request.result.filename || "MN4错题导出.pdf").replace(/\.html$/i, ".pdf");
      var path = String(root).replace(/\/$/, "") + "/" + filename;
      if (!data.writeToFileAtomically(path, true)) throw new Error("PDF 文件写入失败");
      try { webView.evaluateJavaScript("window.__MN_PDF_EXPORT_RELEASE__&&window.__MN_PDF_EXPORT_RELEASE__()", function () {}); } catch (error) {}
      app.saveFileWithUti(path, "com.adobe.pdf");
      releasePdfRequest(controller);
      request.resolve({ saved: true, pdfGenerated: true, format: "pdf", filename: filename, count: request.result.count, pages: Number(info.pages) || 0, bytes: dataLength(data) });
    } catch (error) {
      rejectPdfRequest(controller, error);
    }
  }

  function pullPdfChunks(controller, webView) {
    var request = controller && controller.exportPdfRequest;
    if (!request || webView !== controller.exportWebView) return;
    webView.evaluateJavaScript("JSON.stringify(window.__MN_PDF_EXPORT_INFO__||null)", function (rawInfo) {
      var info;
      try { info = JSON.parse(String(rawInfo || "null")); } catch (error) {}
      if (!info || !Number(info.chunks) || Number(info.chunks) > 4096 || Number(info.base64Length) > 150 * 1024 * 1024) {
        rejectPdfRequest(controller, new Error("PDF 分块信息无效或文件过大"));
        return;
      }
      var chunks = [];
      function pull(index) {
        if (!controller.exportPdfRequest || webView !== controller.exportWebView) return;
        if (index >= Number(info.chunks)) {
          saveGeneratedPdf(controller, webView, info, chunks);
          return;
        }
        webView.evaluateJavaScript("window.__MN_PDF_EXPORT_TAKE_CHUNK__(" + index + ")", function (chunk) {
          var text = String(chunk || "");
          if (!text.length) {
            rejectPdfRequest(controller, new Error("PDF 数据第 " + (index + 1) + " 块读取失败"));
            return;
          }
          chunks.push(text);
          pull(index + 1);
        });
      }
      pull(0);
    });
  }

  function beginPdfFileGeneration(controller, webView) {
    if (!controller || webView !== controller.exportWebView || !controller.exportPdfRequest) return;
    webView.evaluateJavaScript("window.__MN_PDF_FILE_FALLBACK__&&window.__MN_PDF_FILE_FALLBACK_BEGIN__?window.__MN_PDF_FILE_FALLBACK_BEGIN__():'missing-pdf-generator'", function (value) {
      if (String(value) === "missing-pdf-generator") {
        rejectPdfRequest(controller, new Error("PDF 生成模块未能加载"));
      }
    });
  }

  function completePdfExport(controller, webView) {
    if (!controller || webView !== controller.exportWebView || !controller.exportPdfRequest) return;
    if (controller.exportPdfRenderStarted) return;
    controller.exportPdfRenderStarted = true;
    try {
      webView.evaluateJavaScript("window.__MN_PDF_EXPORT_PROTOCOL_V2__&&window.__MN_PDF_EXPORT_BEGIN__?window.__MN_PDF_EXPORT_BEGIN__():'missing-v2'", function (value) {
        if (String(value) === "missing-v2") {
          rejectPdfRequest(controller, new Error("PDF 页面渲染检查未能加载"));
        }
      });
    } catch (error) {
      rejectPdfRequest(controller, new Error("无法启动 PDF 页面渲染检查：" + (error.message || String(error))));
    }
  }

  function pdfRenderReady(controller, webView) {
    if (!controller || webView !== controller.exportWebView || !controller.exportPdfRequest) return;
    beginPdfFileGeneration(controller, webView);
  }

  function pdfDataReady(controller, webView) {
    if (!controller || webView !== controller.exportWebView || !controller.exportPdfRequest) return;
    clearPdfRenderTimer(controller);
    pullPdfChunks(controller, webView);
  }

  function pdfRenderError(controller, webView, message) {
    if (!controller || webView !== controller.exportWebView || !controller.exportPdfRequest) return;
    rejectPdfRequest(controller, new Error("PDF 页面渲染失败：" + (message || "未知错误")));
  }

  function renderPdf(context, result) {
    if (!result || !result.renderPdf) return result;
    return new Promise(function (resolve, reject) {
      var controller = context.controller;
      if (controller.exportPdfRequest) rejectPdfRequest(controller, new Error("新的打印任务已替换上一个任务"));
      releasePdfRequest(controller);
      controller.exportPdfRequest = { result: result, resolve: resolve, reject: reject };
      controller.exportPdfRenderStarted = false;
      var timeout = Math.min(600, Math.max(90, Number(result.count || 1) * 20));
      controller.exportPdfRenderTimer = NSTimer.scheduledTimerWithTimeInterval(timeout, false, function () {
        rejectPdfRequest(controller, new Error("PDF 生成准备超时，请缩小导出范围后重试"));
      });
      controller.exportWebView = new UIWebView({ x: -10000, y: 0, width: 595.2, height: 841.8 });
      controller.exportWebView.delegate = controller;
      var study = Application.sharedInstance().studyController(context.addon.window);
      study.view.addSubview(controller.exportWebView);
      var entry = NSURL.fileURLWithPath(stagePdfRenderPage(controller, result.html));
      controller.exportWebView.loadRequest(NSURLRequest.requestWithURL(entry));
    });
  }

  function dispatch(context, command, payload) {
    if (command === "closePanel") {
      context.closePanel(context.controller);
      return { closed: true };
    }
    if (command === "resetPanelFrame") {
      return context.resetPanelFrame(context.controller);
    }
    var result = __MN_ANSWER_CORE_GLOBAL__.bridge(command, payload);
    if (command !== "exportMistakes") return result;
    if (result && typeof result.then === "function") return result.then(function (value) { return renderPdf(context, value); });
    return renderPdf(context, result);
  }

  return {
    dispatch: dispatch,
    completePdfExport: completePdfExport,
    pdfRenderReady: pdfRenderReady,
    pdfDataReady: pdfDataReady,
    pdfRenderError: pdfRenderError
  };
})();
