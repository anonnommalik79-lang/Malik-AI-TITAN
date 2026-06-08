/* Legacy bridge disabled — Canvas is handled by React PreviewPanel (v0-style split). */
(() => {
  if (typeof window === "undefined") return;
  window.MalikCanvasBridge = {
    open: function () {},
    scan: function () {},
  };
})();
