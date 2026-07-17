var __MNAM_WEB_BRIDGE_GLOBAL__ = (function () {
  function dispatch(context, command, payload) {
    if (command === "closePanel") {
      context.closePanel(context.controller);
      return { closed: true };
    }
    return __MN_ANSWER_CORE_GLOBAL__.bridge(command, payload);
  }

  return { dispatch: dispatch };
})();
