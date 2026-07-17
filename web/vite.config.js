const path = require("node:path")
const { defineConfig } = require("vite")
const react = require("@vitejs/plugin-react")

module.exports = defineConfig({
  plugins: [react()],
  root: __dirname,
  base: "./",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: path.resolve(__dirname, "../web-dist"),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2018",
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, "src/main.jsx"),
      name: "MNAnswerMatcherWorkbench",
      formats: ["iife"],
      fileName: "app",
      cssFileName: "app"
    },
    rollupOptions: {
      output: {
        entryFileNames: "app.js",
        assetFileNames: asset => asset.name?.endsWith(".css") ? "app.css" : "[name][extname]"
      }
    }
  }
})
