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
    controller.exportPdfChunks = null;
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
    if (source.indexOf("__MN_PDF_EXPORT_PROTOCOL_V3__") >= 0) return source;
    var script = '<script src="./html2canvas.min.js"></script>' +
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
      if (manager.fileExistsAtPath(destination)) return;
      var source = String(controller.mainPath || "") + "/web-dist/vendor/" + name;
      if (!manager.fileExistsAtPath(source)) {
        throw new Error("本地 PDF 资源准备失败：" + name);
      }
      manager.copyItemAtPathToPath(source, destination);
      if (!manager.fileExistsAtPath(destination)) throw new Error("本地 PDF 资源复制失败：" + name);
    });
    var pagePath = directory + "/render.html";
    var data = NSData.dataWithStringEncoding(preparePdfHtml(html), 4);
    if (!data || !data.length || !data.length() || !data.writeToFileAtomically(pagePath, true)) {
      throw new Error("PDF 渲染页面写入失败");
    }
    controller.exportPdfRenderHtmlPath = pagePath;
    return pagePath;
  }

  function decodePdfBase64(base64) {
    if (typeof NSData === "undefined") throw new Error("当前 MarginNote 未开放 NSData");
    if (typeof NSData.dataWithBase64EncodedStringOptions === "function") {
      return NSData.dataWithBase64EncodedStringOptions(base64, 0);
    }
    if (typeof NSData.alloc === "function") {
      var instance = NSData.alloc();
      if (instance && typeof instance.initWithBase64EncodedStringOptions === "function") {
        return instance.initWithBase64EncodedStringOptions(base64, 0);
      }
    }
    throw new Error("当前 MarginNote 未开放 PDF Base64 解码接口");
  }

  function saveGeneratedPdf(controller, webView, info, chunks) {
    var request = controller && controller.exportPdfRequest;
    if (!request || webView !== controller.exportWebView) return;
    try {
      var base64 = chunks.join("");
      if (base64.length !== Number(info.base64Length)) throw new Error("PDF 数据接收不完整");
      var data = decodePdfBase64(base64);
      if (!data || !data.length || !data.length()) throw new Error("PDF NSData 生成失败");
      var app = Application.sharedInstance();
      var root = app.tempPath || app.documentPath;
      if (!root || typeof app.saveFileWithUti !== "function") throw new Error("当前 MarginNote 未提供 PDF 保存接口");
      var filename = String(request.result.filename || "MN4错题导出.pdf").replace(/\.html$/i, ".pdf");
      var path = root + "/" + filename;
      if (!data.writeToFileAtomically(path, true)) throw new Error("PDF 文件写入失败");
      try { webView.evaluateJavaScript("window.__MN_PDF_EXPORT_RELEASE__&&window.__MN_PDF_EXPORT_RELEASE__()", function () {}); } catch (error) {}
      app.saveFileWithUti(path, "com.adobe.pdf");
      releasePdfRequest(controller);
      request.resolve({
        saved: true,
        pdfGenerated: true,
        format: "pdf",
        filename: filename,
        count: request.result.count,
        pages: Number(info.pages) || 0,
        bytes: data.length()
      });
    } catch (error) {
      rejectPdfRequest(controller, error);
    }
  }

  function pullPdfChunks(controller, webView) {
    var request = controller && controller.exportPdfRequest;
    if (!request || webView !== controller.exportWebView) return;
    try {
      webView.evaluateJavaScript("JSON.stringify(window.__MN_PDF_EXPORT_INFO__||null)", function (rawInfo, infoError) {
        if (infoError) {
          rejectPdfRequest(controller, new Error(infoError.localizedDescription || infoError.message || String(infoError)));
          return;
        }
        var info;
        try { info = JSON.parse(String(rawInfo || "null")); } catch (error) {}
        if (!info || !Number(info.chunks) || Number(info.chunks) > 4096 || Number(info.base64Length) > 150 * 1024 * 1024) {
          rejectPdfRequest(controller, new Error("PDF 分块信息无效或文件过大"));
          return;
        }
        var chunks = [];
        controller.exportPdfChunks = chunks;
        function pull(index) {
          if (!controller.exportPdfRequest || webView !== controller.exportWebView) return;
          if (index >= Number(info.chunks)) {
            saveGeneratedPdf(controller, webView, info, chunks);
            return;
          }
          webView.evaluateJavaScript("window.__MN_PDF_EXPORT_TAKE_CHUNK__(" + index + ")", function (chunk, chunkError) {
            var chunkText = String(chunk || "");
            if (chunkError || !chunkText.length) {
              rejectPdfRequest(controller, new Error("PDF 数据第 " + (index + 1) + " 块读取失败"));
              return;
            }
            chunks.push(chunkText);
            pull(index + 1);
          });
        }
        pull(0);
      });
    } catch (error) {
      rejectPdfRequest(controller, error);
    }
  }

  function resolvePrintControllerClass() {
    if (typeof UIPrintInteractionController !== "undefined") return UIPrintInteractionController;
    try {
      if (typeof NSClassFromString === "function") return NSClassFromString("UIPrintInteractionController");
    } catch (error) {}
    return null;
  }

  function resolvePrintInfoClass() {
    if (typeof UIPrintInfo !== "undefined") return UIPrintInfo;
    try {
      if (typeof NSClassFromString === "function") return NSClassFromString("UIPrintInfo");
    } catch (error) {}
    return null;
  }

  function saveHtmlPrintFallback(controller) {
    var request = controller && controller.exportPdfRequest;
    if (!request) return;
    try {
      var app = Application.sharedInstance();
      var root = app.tempPath || app.documentPath;
      if (!root || typeof app.saveFileWithUti !== "function") throw new Error("当前 MarginNote 未提供文件保存接口");
      var filename = String(request.result.filename || "MN4错题导出.pdf").replace(/\.pdf$/i, ".html");
      var path = root + "/" + filename;
      var data = NSData.dataWithStringEncoding(String(request.result.html || ""), 4);
      if (!data || !data.writeToFileAtomically(path, true)) throw new Error("自包含 HTML 写入失败");
      app.saveFileWithUti(path, "public.html");
      releasePdfRequest(controller);
      request.resolve({ htmlFallback: true, format: "html", filename: filename, count: request.result.count });
    } catch (error) {
      rejectPdfRequest(controller, error);
    }
  }

  function openWebPrintPanel(controller) {
    var request = controller && controller.exportPdfRequest;
    var webView = controller && controller.exportWebView;
    if (!request || !webView) return;
    clearPdfRenderTimer(controller);
    try {
      var study = Application.sharedInstance().studyController(controller.addon.window);
      if (!webView.superview) {
        webView.frame = { x: -10000, y: 0, width: 595.2, height: 841.8 };
        study.view.addSubview(webView);
      }
      webView.evaluateJavaScript('(function(){if(typeof window.print!=="function")return "unsupported";window.print();return "invoked"})()', function (value, evaluationError) {
        if (evaluationError || String(value) !== "invoked") {
          saveHtmlPrintFallback(controller);
          return;
        }
        clearPdfRenderTimer(controller);
        controller.exportPdfRequest = null;
        controller.exportPdfRenderStarted = false;
        request.resolve({ printPanel: true, printInvoked: true, format: "pdf", filename: request.result.filename, count: request.result.count });
        controller.exportPdfCleanupTimer = NSTimer.scheduledTimerWithTimeInterval(30, false, function () {
          releasePdfRequest(controller);
        });
      });
    } catch (error) {
      saveHtmlPrintFallback(controller);
    }
  }

  function openPdfPrintPanel(controller) {
    var request = controller && controller.exportPdfRequest;
    var webView = controller && controller.exportWebView;
    if (!request || !webView) return;
    clearPdfRenderTimer(controller);
    var PrintController = resolvePrintControllerClass();
    if (!PrintController) {
      openWebPrintPanel(controller);
      return;
    }
    try {
      var result = request.result;
      var formatter = typeof webView.viewPrintFormatter === "function"
        ? webView.viewPrintFormatter()
        : webView.viewPrintFormatter;
      if (!formatter) throw new Error("当前 MarginNote 无法取得网页打印格式");
      var printController = PrintController.sharedPrintController();
      controller.exportPrintController = printController;
      printController.printFormatter = formatter;
      var PrintInfo = resolvePrintInfoClass();
      if (PrintInfo) {
        var info = PrintInfo.printInfo();
        info.jobName = result.filename;
        info.outputType = 0;
        printController.printInfo = info;
      }
      var completion = function (printControllerValue, completed, completionError) {
        controller.exportPrintController = null;
        releasePdfRequest(controller);
        if (completionError) {
          request.reject(new Error(completionError.localizedDescription || completionError.message || String(completionError)));
          return;
        }
        request.resolve({
          printPanel: true,
          printCompleted: completed === true,
          printCancelled: completed !== true,
          format: "pdf",
          filename: result.filename,
          count: result.count
        });
      };
      var study = Application.sharedInstance().studyController(controller.addon.window);
      var bounds = study.view.bounds;
      var anchor = { x: bounds.width / 2, y: Math.max(48, bounds.height / 2), width: 1, height: 1 };
      var shown;
      if (typeof printController.presentFromRectInViewAnimatedCompletionHandler === "function") {
        shown = printController.presentFromRectInViewAnimatedCompletionHandler(anchor, study.view, true, completion);
      } else if (typeof printController.presentAnimatedCompletionHandler === "function") {
        shown = printController.presentAnimatedCompletionHandler(true, completion);
      } else {
        throw new Error("当前 MarginNote 不支持带结果回调的系统打印面板");
      }
      if (shown === false) throw new Error("系统打印面板未能打开");
    } catch (error) {
      controller.exportPrintController = null;
      rejectPdfRequest(controller, error);
    }
  }

  function completePdfExport(controller, webView) {
    if (!controller || webView !== controller.exportWebView || !controller.exportPdfRequest) return;
    if (controller.exportPdfRenderStarted) return;
    controller.exportPdfRenderStarted = true;
    try {
      webView.evaluateJavaScript("window.__MN_PDF_EXPORT_PROTOCOL_V3__&&window.__MN_PDF_EXPORT_BEGIN__?window.__MN_PDF_EXPORT_BEGIN__():'missing-v3'", function (value) {
        if (String(value) === "missing-v3") {
          rejectPdfRequest(controller, new Error("本地 PDF 生成模块未能加载"));
        }
      });
    } catch (error) {
      rejectPdfRequest(controller, new Error("无法启动 PDF 页面渲染检查：" + (error.message || String(error))));
    }
  }

  function pdfRenderReady(controller, webView) {
    if (!controller || webView !== controller.exportWebView || !controller.exportPdfRequest) return;
    openPdfPrintPanel(controller);
  }

  function pdfDataReady(controller, webView) {
    if (!controller || webView !== controller.exportWebView || !controller.exportPdfRequest) return;
    clearPdfRenderTimer(controller);
    pullPdfChunks(controller, webView);
  }

  function pdfRenderError(controller, webView, message) {
    if (!controller || webView !== controller.exportWebView || !controller.exportPdfRequest) return;
    rejectPdfRequest(controller, new Error("打印页面渲染失败：" + (message || "未知错误")));
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
        rejectPdfRequest(controller, new Error("本地 PDF 生成超时，请缩小导出范围后重试"));
      });
      controller.exportWebView = new UIWebView({ x: 0, y: 0, width: 595.2, height: 841.8 });
      controller.exportWebView.delegate = controller;
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
    pdfDataReady: pdfDataReady,
    pdfRenderReady: pdfRenderReady,
    pdfRenderError: pdfRenderError
  };
})();
