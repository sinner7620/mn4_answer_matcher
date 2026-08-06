var __MNAM_WEB_PANEL_GLOBAL__ = (function () {
  // v3 resets the oversized full-screen frame saved by earlier iPad betas.
  var FRAME_KEY = "marginnote.extension.mn4-answer-matcher.rails.frame.v3";
  var OPEN_KEY = "marginnote.extension.mn4-answer-matcher.rails.open";
  var SCHEME = "mnaddon";
  var TITLE_HEIGHT = 38;
  var MIN_WIDTH = 460;
  var MIN_HEIGHT = 360;

  function responseScript(response) {
    var raw = JSON.stringify(response).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
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
    var width = Math.max(MIN_WIDTH, Math.min(760, bounds.width * 0.72));
    var height = Math.max(MIN_HEIGHT, Math.min(680, bounds.height * 0.76));
    return {
      x: 16,
      y: 16,
      width: width,
      height: height
    };
  }

  function savedFrame(controller) {
    var value = NSUserDefaults.standardUserDefaults().objectForKey(FRAME_KEY);
    if (!value || !value.width || !value.height) return defaultFrame(controller);
    return {
      x: Number(value.x),
      y: Number(value.y),
      width: Math.max(MIN_WIDTH, Number(value.width)),
      height: Math.max(MIN_HEIGHT, Number(value.height))
    };
  }

  function saveFrame(controller) {
    NSUserDefaults.standardUserDefaults().setObjectForKey(controller.view.frame, FRAME_KEY);
  }

  function resetFrame(controller) {
    if (!controller || !controller.view) return { reset: false };
    var frame = defaultFrame(controller);
    controller.view.frame = frame;
    saveFrame(controller);
    return { reset: true, frame: frame };
  }

  function closePanel(controller, remember) {
    if (!controller) return;
    if (!controller.webView) {
      if (remember !== false) NSUserDefaults.standardUserDefaults().setObjectForKey(false, OPEN_KEY);
      return;
    }
    controller.view.hidden = true;
    if (controller.view.superview) controller.view.removeFromSuperview();
    if (remember !== false) NSUserDefaults.standardUserDefaults().setObjectForKey(false, OPEN_KEY);
  }

  function setup(controller) {
    var frame = { x: 0, y: 0, width: 900, height: 640 };
    controller.view.frame = frame;
    controller.view.backgroundColor = UIColor.whiteColor();
    controller.view.layer.cornerRadius = 14;
    controller.view.layer.masksToBounds = false;
    controller.view.layer.shadowColor = UIColor.blackColor();
    controller.view.layer.shadowOpacity = 0.28;
    controller.view.layer.shadowRadius = 12;
    controller.view.layer.shadowOffset = { width: 0, height: 4 };

    controller.titleBar = new UIView({ x: 0, y: 0, width: frame.width, height: TITLE_HEIGHT });
    controller.titleBar.backgroundColor = UIColor.colorWithHexString("#F7F8FB");
    controller.titleBar.autoresizingMask = 1 << 1;
    controller.view.addSubview(controller.titleBar);

    var close = UIButton.buttonWithType(0);
    close.frame = { x: 6, y: 3, width: 34, height: 32 };
    close.setTitleForState("×", 0);
    close.setTitleColorForState(UIColor.grayColor(), 0);
    close.titleLabel.font = UIFont.systemFontOfSize(24);
    close.addTargetActionForControlEvents(controller, "closeWindow", 1 << 6);
    controller.titleBar.addSubview(close);

    var pan = new UIPanGestureRecognizer(controller, "handlePan:");
    controller.titleBar.addGestureRecognizer(pan);

    controller.webView = new UIWebView({
      x: 0,
      y: TITLE_HEIGHT,
      width: frame.width,
      height: frame.height - TITLE_HEIGHT
    });
    controller.webView.autoresizingMask = (1 << 1) | (1 << 4);
    controller.webView.delegate = controller;
    controller.view.addSubview(controller.webView);

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
    "MNAnswerMatcherRailsPanel : UIViewController <UIWebViewDelegate>",
    {
      viewDidLoad: function () { setup(self); },
      closeWindow: function () { closePanel(self, true); },
      handlePan: function (gesture) {
        var translation = gesture.translationInView(self.view.superview);
        self.view.center = {
          x: self.view.center.x + translation.x,
          y: self.view.center.y + translation.y
        };
        gesture.setTranslationInView({ x: 0, y: 0 }, self.view.superview);
        if (gesture.state === 3) saveFrame(self);
      },
      handleResize: function (gesture) {
        if (gesture.state === 1) {
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
        if (gesture.state === 3) {
          saveFrame(self);
          self.resizeStart = null;
        }
      },
      webViewShouldStartLoadWithRequestNavigationType: function (webView, request) {
        var url = request.URL();
        if (String(url.scheme || "").toLowerCase() !== SCHEME) return true;
        var message;
        try {
          message = decodeMessage(url);
          var context = {
            controller: self,
            addon: self.addon,
            closePanel: closePanel,
            resetPanelFrame: resetFrame
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
    if (!controller.view.superview) study.view.addSubview(controller.view);
    controller.view.frame = savedFrame(controller);
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
    resetFrame: resetFrame,
    hidePanel: closePanel,
    destroyPanel: destroyPanel,
    shouldRestorePanel: function () { return NSUserDefaults.standardUserDefaults().objectForKey(OPEN_KEY) === true; },
    isVisible: function (controller) { return !!(controller && controller.view && controller.view.superview && !controller.view.hidden); },
    ensureLayout: function () {}
  };
})();
