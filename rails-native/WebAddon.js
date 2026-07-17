var __MNAM_WEB_ADDON_GLOBAL__ = (function () {
  function call(methods, name, args) {
    if (methods && typeof methods[name] === "function") {
      return methods[name].apply(self, args || []);
    }
  }

  function createAddon(mainPath) {
    var core = __MN_ANSWER_CORE_GLOBAL__;
    var methods = {};
    Object.assign(methods, core.lifecycle.instanceMethods, core.handlers, core.instanceMethods);

    methods.sceneWillConnect = function () {
      call(core.lifecycle.instanceMethods, "sceneWillConnect", arguments);
      self.mainPath = mainPath;
      self.webController = __MNAM_WEB_PANEL_GLOBAL__.createController(mainPath, self);
    };

    methods.notebookWillOpen = function () {
      call(core.lifecycle.instanceMethods, "notebookWillOpen", arguments);
      if (__MNAM_WEB_PANEL_GLOBAL__.shouldRestorePanel()) {
        __MNAM_WEB_PANEL_GLOBAL__.showPanel(self.webController);
      }
    };

    methods.notebookWillClose = function () {
      __MNAM_WEB_PANEL_GLOBAL__.hidePanel(self.webController, false);
      call(core.lifecycle.instanceMethods, "notebookWillClose", arguments);
    };

    methods.sceneDidDisconnect = function () {
      __MNAM_WEB_PANEL_GLOBAL__.destroyPanel(self.webController);
      self.webController = null;
      call(core.lifecycle.instanceMethods, "sceneDidDisconnect", arguments);
    };

    methods.controllerWillLayoutSubviews = function (controller) {
      if (controller === Application.sharedInstance().studyController(self.window)) {
        __MNAM_WEB_PANEL_GLOBAL__.ensureLayout(self.webController);
      }
    };

    methods.queryAddonCommandStatus = function () {
      return {
        image: "logo.png",
        object: self,
        selector: "toggleWebPanel:",
        checked: __MNAM_WEB_PANEL_GLOBAL__.isVisible(self.webController)
      };
    };

    methods.toggleWebPanel = function () {
      if (__MNAM_WEB_PANEL_GLOBAL__.isVisible(self.webController)) {
        __MNAM_WEB_PANEL_GLOBAL__.hidePanel(self.webController, true);
      } else {
        __MNAM_WEB_PANEL_GLOBAL__.showPanel(self.webController);
      }
      Application.sharedInstance().studyController(self.window).refreshAddonCommands();
    };

    return JSB.defineClass(
      "MNAnswerMatcherRailsAddon : JSExtension",
      methods,
      core.lifecycle.classMethods
    );
  }

  return { createAddon: createAddon };
})();
