JSB.require("AnswerMatcherCore.js");
JSB.require("WebBridgeCommands.js");
JSB.require("WebPanelController.js");
JSB.require("WebAddon.js");

JSB.newAddon = function (mainPath) {
  return __MNAM_WEB_ADDON_GLOBAL__.createAddon(mainPath);
};
