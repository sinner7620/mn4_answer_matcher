JSB.require("AnswerMatcherCore");
JSB.require("WebBridgeCommands");
JSB.require("WebPanelController");
JSB.require("WebAddon");

JSB.newAddon = function (mainPath) {
  return __MNAM_WEB_ADDON_GLOBAL__.createAddon(mainPath);
};
