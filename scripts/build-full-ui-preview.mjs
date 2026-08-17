import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
const outputDir = path.join(root, "ui-preview")
const output = path.join(outputDir, "mn4-full-ui-preview.html")

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <meta name="color-scheme" content="light">
  <title>MN4 Answer Matcher ${pkg.version} · 本地源码预览</title>
  <link rel="icon" href="data:">
  <!-- Source-linked preview: pnpm build refreshes ../web-dist and this page follows it directly. -->
  <link rel="stylesheet" href="../web-dist/app.css">
  <link rel="stylesheet" href="../scripts/preview-annotations.css">
</head>
<body>
  <div id="root"></div>
  <script>
    window.__MN_FULL_UI_PREVIEW__ = true;
    window.addEventListener("error", function (event) {
      var root = document.getElementById("root");
      if (root && !root.firstElementChild) {
        root.innerHTML = '<div style="margin:24px;padding:16px;border:1px solid #fecaca;border-radius:10px;background:#fff7f7;color:#b42318;font-family:-apple-system,BlinkMacSystemFont,\\'PingFang SC\\',sans-serif"><strong>预览页启动失败</strong><br><small>' + String(event.message || "未知错误").replace(/[<&]/g, "") + '</small></div>';
      }
    });
    (function installPreviewLogoPatch() {
      function patch() {
        var image = document.querySelector(".appBrand img");
        if (!image || image.dataset.localPreviewLogo === "1") return;
        image.dataset.localPreviewLogo = "1";
        image.src = "../assets/logo.png";
      }
      var observer = new MutationObserver(patch);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      window.addEventListener("DOMContentLoaded", patch);
      patch();
    })();
  </script>
  <script src="../web-dist/app.js"></script>
  <script src="../scripts/preview-annotations.js"></script>
</body>
</html>
`

await mkdir(outputDir, { recursive: true })
await writeFile(output, html)
console.log(output)
