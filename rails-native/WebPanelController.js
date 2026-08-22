var __MNAM_WEB_PANEL_GLOBAL__ = (function () {
  // Panel size is session-only; every MarginNote restart returns to the default frame.
  var FRAME_KEY = "marginnote.extension.mn4-answer-matcher.rails.frame.v4";
  var OPEN_KEY = "marginnote.extension.mn4-answer-matcher.rails.open";
  var CLOSE_SIDE_KEY = "marginnote.extension.mn4-answer-matcher.beta.rails.close-side.v1";
  var SCHEME = "mnaddon";
  var TITLE_HEIGHT = 56;
  var CONTROL_CLUSTER_WIDTH = 90;
  var MIN_WIDTH = 460;
  var MIN_HEIGHT = 360;

  function responseScript(response) {
    var raw = JSON.stringify(response).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    return "window.__MN_WEB_BRIDGE_RECEIVE_FN__('" + raw + "')";
  }

  function sendResponse(webView, requestId, payload, error) {
    webView.evaluateJavaScript(responseScript({
      requestId: requestId,
      payload: payload === undefined ? null : payload,
      error: error ? { message: error.message || String(error) } : null
    }), function () {});
  }

  function decodeMessage(url) {
    var absolute = String(url.absoluteString());
    var marker = "payload=";
    var index = absolute.indexOf(marker);
    if (index < 0) throw new Error("桥接消息缺少 payload");
    return JSON.parse(decodeURIComponent(absolute.slice(index + marker.length)));
  }

  function defaultFrame(controller) {
    var study = Application.sharedInstance().studyController(controller.addon.window);
    var bounds = study.view.bounds;
    var width = Math.max(MIN_WIDTH, Math.min(720, bounds.width - 32));
    var height = Math.max(MIN_HEIGHT, Math.min(560, bounds.height - 32));
    return {
      x: 16,
      y: 16,
      width: width,
      height: height
    };
  }

  function savedFrame(controller) {
    var value = controller.sessionFrame;
    if (!value || !value.width || !value.height) return defaultFrame(controller);
    return {
      x: Number(value.x),
      y: Number(value.y),
      width: Math.max(MIN_WIDTH, Number(value.width)),
      height: Math.max(MIN_HEIGHT, Number(value.height))
    };
  }

  function saveFrame(controller) {
    if (!controller || !controller.view) return;
    var frame = controller.view.frame;
    controller.sessionFrame = {
      x: Number(frame.x),
      y: Number(frame.y),
      width: Number(frame.width),
      height: Number(frame.height)
    };
  }

  function resetFrame(controller) {
    if (!controller || !controller.view) return { reset: false };
    var frame = defaultFrame(controller);
    controller.view.autoresizingMask = 0;
    controller.view.frame = frame;
    layoutCloseButton(controller, panelCloseButtonSide());
    saveFrame(controller);
    return { reset: true, frame: frame };
  }

  function closePanel(controller, remember) {
    if (!controller) return;
    if (!controller.webView) {
      if (remember !== false) NSUserDefaults.standardUserDefaults().setObjectForKey(false, OPEN_KEY);
      return;
    }
    // Do not save here. MarginNote may be in the middle of resizing its study
    // view while a notebook is closing; sampling that transient frame causes
    // cumulative panel growth across notebook switches.
    controller.view.hidden = true;
    if (controller.view.superview) controller.view.removeFromSuperview();
    if (remember !== false) NSUserDefaults.standardUserDefaults().setObjectForKey(false, OPEN_KEY);
  }

  function preservePanelForNotebookSwitch(controller) {
    if (!controller || !controller.webView) return;
    controller.preserveAcrossNotebookSwitch = true;
    controller.view.autoresizingMask = 0;
    // Reapply only the stable session frame. Never learn a new size from the
    // notebook transition itself.
    controller.view.frame = savedFrame(controller);
  }

  function restorePanelAfterNotebookSwitch(controller) {
    if (!controller) return;
    var study = Application.sharedInstance().studyController(controller.addon.window);
    var frame = savedFrame(controller);
    controller.view.autoresizingMask = 0;
    if (controller.view.superview !== study.view) {
      if (controller.view.superview) controller.view.removeFromSuperview();
      study.view.addSubview(controller.view);
    }
    controller.view.frame = frame;
    layoutCloseButton(controller, panelCloseButtonSide());
    lockWebViewRootScroll(controller);
    controller.view.hidden = false;
    controller.preserveAcrossNotebookSwitch = false;
  }

  function ensureLayout(controller) {
    if (!controller || !controller.view || controller.userAdjustingFrame) return;
    if (!controller.sessionFrame || controller.view.hidden) return;
    controller.view.autoresizingMask = 0;
    controller.view.frame = savedFrame(controller);
    layoutCloseButton(controller, panelCloseButtonSide());
    lockWebViewRootScroll(controller);
  }

  function lockWebViewRootScroll(controller) {
    if (!controller || !controller.webView || !controller.webView.scrollView) return;
    var scrollView = controller.webView.scrollView;
    try { scrollView.bounces = false; } catch (error) {}
    try { scrollView.alwaysBounceVertical = false; } catch (error) {}
    try { scrollView.alwaysBounceHorizontal = false; } catch (error) {}
    try { scrollView.contentInset = { top: 0, left: 0, bottom: 0, right: 0 }; } catch (error) {}
    try { scrollView.scrollIndicatorInsets = { top: 0, left: 0, bottom: 0, right: 0 }; } catch (error) {}
    try { scrollView.contentOffset = { x: 0, y: 0 }; } catch (error) {}
    try {
      var bounds = controller.webView.bounds;
      if (bounds && bounds.width && bounds.height) {
        scrollView.contentSize = { width: Number(bounds.width), height: Number(bounds.height) };
      }
    } catch (error) {}
  }

  function panelCloseButtonSide() {
    return NSUserDefaults.standardUserDefaults().objectForKey(CLOSE_SIDE_KEY) === "right"
      ? "right"
      : "left";
  }

  function layoutCloseButton(controller, side) {
    if (!controller || !controller.view) return;
    controller.panelCloseSide = side === "right" ? "right" : "left";
  }

  function setCloseButtonSide(controller, side) {
    var normalized = side === "right" ? "right" : "left";
    NSUserDefaults.standardUserDefaults().setObjectForKey(normalized, CLOSE_SIDE_KEY);
    layoutCloseButton(controller, normalized);
    return { side: normalized };
  }

  function setup(controller) {
    var frame = { x: 0, y: 0, width: 900, height: 640 };
    controller.view.autoresizingMask = 0;
    controller.view.frame = frame;
    controller.view.backgroundColor = UIColor.clearColor();
    controller.view.layer.cornerRadius = 14;
    controller.view.layer.masksToBounds = false;
    controller.view.layer.shadowColor = UIColor.blackColor();
    controller.view.layer.shadowOpacity = 0.28;
    controller.view.layer.shadowRadius = 12;
    controller.view.layer.shadowOffset = { width: 0, height: 4 };

    controller.webView = new UIWebView({
      x: 0,
      y: 0,
      width: frame.width,
      height: frame.height
    });
    controller.webView.autoresizingMask = (1 << 1) | (1 << 4);
    try { controller.webView.opaque = false; } catch (error) {}
    try { controller.webView.backgroundColor = UIColor.clearColor(); } catch (error) {}
    try { controller.webView.layer.cornerRadius = 14; } catch (error) {}
    try { controller.webView.layer.masksToBounds = true; } catch (error) {}
    // Keep the plugin chrome fixed. Internal HTML lists/preview panes may scroll,
    // but the UIWebView root itself must not rubber-band vertically.
    try { controller.webView.scrollView.bounces = false; } catch (error) {}
    try { controller.webView.scrollView.alwaysBounceVertical = false; } catch (error) {}
    try { controller.webView.scrollView.alwaysBounceHorizontal = false; } catch (error) {}
    lockWebViewRootScroll(controller);
    controller.webView.delegate = controller;
    controller.view.addSubview(controller.webView);
    controller.headerPan = new UIPanGestureRecognizer(controller, "handleHeaderPan:");
    controller.headerPan.cancelsTouchesInView = false;
    controller.headerPan.delegate = controller;
    controller.webView.addGestureRecognizer(controller.headerPan);
    layoutCloseButton(controller, panelCloseButtonSide());

    var resize = new UILabel({ x: frame.width - 38, y: frame.height - 38, width: 32, height: 32 });
    resize.text = "↘";
    resize.textAlignment = 1;
    resize.textColor = UIColor.grayColor();
    resize.userInteractionEnabled = true;
    resize.autoresizingMask = (1 << 0) | (1 << 3);
    resize.addGestureRecognizer(new UIPanGestureRecognizer(controller, "handleResize:"));
    controller.view.addSubview(resize);

    var entry = NSURL.fileURLWithPath(controller.mainPath + "/web-dist/index.html");
    controller.webView.loadRequest(NSURLRequest.requestWithURL(entry));
  }

  var PanelClass = JSB.defineClass(
    "MNAnswerMatcherRailsPanel : UIViewController <UIWebViewDelegate, UIGestureRecognizerDelegate>",
    {
      viewDidLoad: function () { setup(self); },
      gestureRecognizerShouldBegin: function (gesture) {
        if (gesture !== self.headerPan) return true;
        var start = gesture.locationInView(self.view);
        var width = Number(self.view.bounds.width || self.view.frame.width || 0);
        var controlsOnRight = self.panelCloseSide === "right";
        var insideHeader = Number(start.y) >= 0 && Number(start.y) <= TITLE_HEIGHT;
        var insideControls = controlsOnRight
          ? Number(start.x) >= width - CONTROL_CLUSTER_WIDTH
          : Number(start.x) <= CONTROL_CLUSTER_WIDTH;
        self.headerPanActive = insideHeader && !insideControls;
        return self.headerPanActive;
      },
      handleHeaderPan: function (gesture) {
        if (gesture.state === 1) {
          if (self.headerPanActive) self.userAdjustingFrame = true;
        }
        if (!self.headerPanActive) {
          gesture.setTranslationInView({ x: 0, y: 0 }, self.view.superview);
          return;
        }
        var translation = gesture.translationInView(self.view.superview);
        self.view.center = {
          x: self.view.center.x + translation.x,
          y: self.view.center.y + translation.y
        };
        gesture.setTranslationInView({ x: 0, y: 0 }, self.view.superview);
        if (gesture.state === 3 || gesture.state === 4 || gesture.state === 5) {
          saveFrame(self);
          self.userAdjustingFrame = false;
          self.headerPanActive = false;
        }
      },
      handleResize: function (gesture) {
        if (gesture.state === 1) {
          self.userAdjustingFrame = true;
          self.resizeStart = { location: gesture.locationInView(self.view.superview), frame: self.view.frame };
        }
        if (!self.resizeStart) return;
        var point = gesture.locationInView(self.view.superview);
        self.view.frame = {
          x: self.resizeStart.frame.x,
          y: self.resizeStart.frame.y,
          width: Math.max(MIN_WIDTH, self.resizeStart.frame.width + point.x - self.resizeStart.location.x),
          height: Math.max(MIN_HEIGHT, self.resizeStart.frame.height + point.y - self.resizeStart.location.y)
        };
        layoutCloseButton(self, panelCloseButtonSide());
        lockWebViewRootScroll(self);
        if (gesture.state === 3 || gesture.state === 4 || gesture.state === 5) {
          saveFrame(self);
          self.resizeStart = null;
          self.userAdjustingFrame = false;
        }
      },
      webViewShouldStartLoadWithRequestNavigationType: function (webView, request) {
        var url = request.URL();
        if (String(url.scheme || "").toLowerCase() !== SCHEME) return true;
        var absolute = String(url.absoluteString());
        if (webView === self.exportWebView && absolute.indexOf("mnaddon://pdf-render-ready") === 0) {
          __MNAM_WEB_BRIDGE_GLOBAL__.pdfRenderReady(self, webView);
          return false;
        }
        if (webView === self.exportWebView && absolute.indexOf("mnaddon://pdf-data-ready") === 0) {
          __MNAM_WEB_BRIDGE_GLOBAL__.pdfDataReady(self, webView);
          return false;
        }
        if (webView === self.exportWebView && absolute.indexOf("mnaddon://pdf-render-error") === 0) {
          var marker = "message=";
          var markerIndex = absolute.indexOf(marker);
          var renderError = markerIndex < 0 ? "未知错误" : decodeURIComponent(absolute.slice(markerIndex + marker.length));
          __MNAM_WEB_BRIDGE_GLOBAL__.pdfRenderError(self, webView, renderError);
          return false;
        }
        var message;
        try {
          message = decodeMessage(url);
          var context = {
            controller: self,
            addon: self.addon,
            closePanel: closePanel,
            resetPanelFrame: resetFrame,
            panelCloseButtonSide: panelCloseButtonSide,
            setPanelCloseButtonSide: setCloseButtonSide
          };
          var result = __MNAM_WEB_BRIDGE_GLOBAL__.dispatch(context, message.command, message.payload);
          if (result && typeof result.then === "function") {
            result.then(function (payload) { sendResponse(webView, message.requestId, payload, null); })
              .catch(function (error) { sendResponse(webView, message.requestId, null, error); });
          } else {
            sendResponse(webView, message.requestId, result, null);
          }
        } catch (error) {
          sendResponse(webView, message ? message.requestId : "unknown", null, error);
        }
        return false;
      },
      webViewDidFinishLoad: function (webView) {
        if (self.exportWebView && webView === self.exportWebView) {
          __MNAM_WEB_BRIDGE_GLOBAL__.completePdfExport(self, webView);
          return;
        }
        if (webView === self.webView) lockWebViewRootScroll(self);
      }
    }
  );

  function createController(mainPath, addon) {
    var controller = PanelClass.new();
    controller.mainPath = mainPath;
    controller.addon = addon;
    return controller;
  }

  function showPanel(controller) {
    if (!controller) return;
    var study = Application.sharedInstance().studyController(controller.addon.window);
    var frame = savedFrame(controller);
    controller.view.autoresizingMask = 0;
    if (controller.view.superview !== study.view) {
      if (controller.view.superview) controller.view.removeFromSuperview();
      study.view.addSubview(controller.view);
    }
    controller.view.frame = frame;
    layoutCloseButton(controller, panelCloseButtonSide());
    // Establish a stable frame at a controlled point. Only explicit user
    // movement/resizing or resetFrame may change sessionFrame afterwards.
    saveFrame(controller);
    lockWebViewRootScroll(controller);
    controller.view.hidden = false;
    NSUserDefaults.standardUserDefaults().setObjectForKey(true, OPEN_KEY);
    controller.webView.evaluateJavaScript("window.__onPanelShow&&window.__onPanelShow()", function () {});
  }

  function destroyPanel(controller) {
    closePanel(controller, false);
    if (controller && controller.webView) controller.webView.delegate = null;
  }

  return {
    createController: createController,
    showPanel: showPanel,
    preservePanelForNotebookSwitch: preservePanelForNotebookSwitch,
    restorePanelAfterNotebookSwitch: restorePanelAfterNotebookSwitch,
    resetFrame: resetFrame,
    hidePanel: closePanel,
    destroyPanel: destroyPanel,
    shouldRestorePanel: function () { return NSUserDefaults.standardUserDefaults().objectForKey(OPEN_KEY) === true; },
    isVisible: function (controller) { return !!(controller && controller.view && controller.view.superview && !controller.view.hidden); },
    ensureLayout: ensureLayout
  };
})();
