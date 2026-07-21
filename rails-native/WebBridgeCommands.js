var __MNAM_WEB_BRIDGE_GLOBAL__ = (function () {
  function releasePdfRequest(controller) {
    if (!controller) return;
    if (controller.exportWebView) controller.exportWebView.delegate = null;
    controller.exportWebView = null;
    controller.exportPdfRequest = null;
  }

  function openPdfPrintPanel(controller) {
    var request = controller && controller.exportPdfRequest;
    var webView = controller && controller.exportWebView;
    if (!request || !webView) return;
    try {
      var result = request.result;
      var formatter = typeof webView.viewPrintFormatter === "function"
        ? webView.viewPrintFormatter()
        : webView.viewPrintFormatter;
      var printController = UIPrintInteractionController.sharedPrintController();
      controller.exportPrintController = printController;
      printController.printFormatter = formatter;
      if (typeof UIPrintInfo !== "undefined") {
        var info = UIPrintInfo.printInfo();
        info.jobName = result.filename;
        info.outputType = 0;
        printController.printInfo = info;
      }
      var completion = function () {
        controller.exportPrintController = null;
        releasePdfRequest(controller);
      };
      var study = Application.sharedInstance().studyController(controller.addon.window);
      var bounds = study.view.bounds;
      var anchor = { x: bounds.width / 2, y: Math.max(48, bounds.height / 2), width: 1, height: 1 };
      var shown;
      if (typeof printController.presentFromRectInViewAnimatedCompletionHandler === "function") {
        shown = printController.presentFromRectInViewAnimatedCompletionHandler(anchor, study.view, true, completion);
      } else {
        shown = printController.presentAnimatedCompletionHandler(true, completion);
      }
      if (shown === false) throw new Error("系统打印面板未能打开");
      request.resolve({ printPanel: true, format: "pdf", filename: result.filename, count: result.count });
    } catch (error) {
      controller.exportPrintController = null;
      releasePdfRequest(controller);
      request.reject(error);
    }
  }

  function completePdfExport(controller, webView) {
    if (!controller || webView !== controller.exportWebView || !controller.exportPdfRequest) return;
    NSTimer.scheduledTimerWithTimeInterval(0.45, false, function () { openPdfPrintPanel(controller); });
  }

  function renderPdf(context, result) {
    if (!result || !result.renderPdf) return result;
    if (typeof UIPrintInteractionController === "undefined") {
      throw new Error("当前 MarginNote 版本未开放系统打印面板");
    }
    return new Promise(function (resolve, reject) {
      var controller = context.controller;
      releasePdfRequest(controller);
      controller.exportPdfRequest = { result: result, resolve: resolve, reject: reject };
      controller.exportWebView = new UIWebView({ x: 0, y: 0, width: 595.2, height: 841.8 });
      controller.exportWebView.delegate = controller;
      controller.exportWebView.loadHTMLStringBaseURL(result.html, null);
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

  return { dispatch: dispatch, completePdfExport: completePdfExport };
})();
