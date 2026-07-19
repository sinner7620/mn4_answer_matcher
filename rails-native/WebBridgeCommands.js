var __MNAM_WEB_BRIDGE_GLOBAL__ = (function () {
  function dispatch(context, command, payload) {
    if (command === "closePanel") {
      context.closePanel(context.controller);
      return { closed: true };
    }
    if (command === "resetPanelFrame") {
      return context.resetPanelFrame(context.controller);
    }
    return __MN_ANSWER_CORE_GLOBAL__.bridge(command, payload);
  }

  return { dispatch: dispatch };
})();
