(() => {
  const storageKey = "mn4-ui-preview-annotations-v1"
  let notes = []
  let mode = false
  let pendingTarget = null

  try { notes = JSON.parse(localStorage.getItem(storageKey) || "[]") } catch (_) {}

  const launcher = document.createElement("button")
  launcher.id = "mn-annotation-launcher"
  launcher.type = "button"
  launcher.textContent = "标注修改"

  const panel = document.createElement("aside")
  panel.id = "mn-annotation-panel"
  panel.setAttribute("aria-label", "修改意见")
  panel.innerHTML = `
    <header><div><h2>页面修改意见</h2><p>开启标注后，点击页面上的目标区域并输入意见。切换页面后可继续标注。</p></div><button type="button" data-close>关闭</button></header>
    <button type="button" class="mn-mode">开启点击标注</button>
    <div class="mn-actions"><button type="button" class="mn-copy">复制全部意见</button><button type="button" class="mn-clear">清空标注</button></div>
    <div id="mn-annotation-list"></div>`

  const editor = document.createElement("div")
  editor.id = "mn-annotation-editor"
  editor.innerHTML = `<div><strong>写下修改意见</strong><small class="mn-target-label"></small><textarea placeholder="例如：这个按钮移到右上角；列表间距缩小；此处改成两列……"></textarea><footer><button type="button" class="mn-cancel">取消</button><button type="button" class="mn-save">保存标注</button></footer></div>`

  document.body.append(launcher, panel, editor)

  const list = panel.querySelector("#mn-annotation-list")
  const modeButton = panel.querySelector(".mn-mode")
  const textarea = editor.querySelector("textarea")

  function currentPage() {
    return document.querySelector(".topNav button.active strong")?.textContent?.trim() || "当前页面"
  }

  function targetLabel(element) {
    const text = (element.innerText || element.getAttribute("aria-label") || element.getAttribute("placeholder") || "")
      .replace(/\s+/g, " ").trim().slice(0, 48)
    const className = String(element.className || "").split(/\s+/).filter(name => name && !name.startsWith("mn-annotation")).slice(0, 2).join(".")
    return `${element.tagName.toLowerCase()}${className ? `.${className}` : ""}${text ? `「${text}」` : ""}`
  }

  function saveNotes() {
    localStorage.setItem(storageKey, JSON.stringify(notes))
    render()
  }

  function render() {
    launcher.dataset.count = String(notes.length)
    if (!notes.length) {
      list.innerHTML = `<div class="mn-annotation-empty">还没有标注。开启点击标注后，直接点页面中的控件或区域。</div>`
      return
    }
    list.innerHTML = notes.map((note, index) => `<article class="mn-annotation-item"><header><b>#${index + 1} · ${escapeHtml(note.page)}</b><button type="button" data-delete="${note.id}">删除</button></header><small>${escapeHtml(note.target)}</small><p>${escapeHtml(note.comment)}</p></article>`).join("")
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char])
  }

  function setMode(next) {
    mode = next
    document.documentElement.classList.toggle("mn-annotation-mode", mode)
    modeButton.classList.toggle("active", mode)
    modeButton.textContent = mode ? "标注已开启 · 点击页面区域" : "开启点击标注"
  }

  function feedbackText() {
    return [`MN4 插件 UI 修改意见（共 ${notes.length} 条）`, "", ...notes.flatMap((note, index) => [
      `${index + 1}. [${note.page}] ${note.target}`,
      `   修改意见：${note.comment}`,
      ""
    ])].join("\n")
  }

  async function copyFeedback() {
    if (!notes.length) return
    const text = feedbackText()
    try { await navigator.clipboard.writeText(text) }
    catch (_) {
      const helper = document.createElement("textarea")
      helper.value = text
      document.body.appendChild(helper)
      helper.select()
      document.execCommand("copy")
      helper.remove()
    }
    const button = panel.querySelector(".mn-copy")
    button.textContent = "已复制，可粘贴给 Codex"
    setTimeout(() => { button.textContent = "复制全部意见" }, 1800)
  }

  launcher.addEventListener("click", () => panel.classList.toggle("open"))
  panel.querySelector("[data-close]").addEventListener("click", () => panel.classList.remove("open"))
  modeButton.addEventListener("click", () => setMode(!mode))
  panel.querySelector(".mn-copy").addEventListener("click", copyFeedback)
  panel.querySelector(".mn-clear").addEventListener("click", () => {
    if (notes.length && confirm("确认清空全部页面标注？")) { notes = []; saveNotes() }
  })
  list.addEventListener("click", event => {
    const id = event.target.closest("[data-delete]")?.dataset.delete
    if (id) { notes = notes.filter(note => note.id !== id); saveNotes() }
  })

  document.addEventListener("click", event => {
    if (!mode || event.target.closest("#mn-annotation-panel, #mn-annotation-launcher, #mn-annotation-editor")) return
    event.preventDefault()
    event.stopPropagation()
    pendingTarget?.classList.remove("mn-annotation-target")
    pendingTarget = event.target.closest("button, input, select, article, header, section, aside, .settingsGroup, .overviewPanel, .detailPane, .mistakeItem") || event.target
    pendingTarget.classList.add("mn-annotation-target")
    editor.querySelector(".mn-target-label").textContent = `${currentPage()} · ${targetLabel(pendingTarget)}`
    textarea.value = ""
    editor.classList.add("open")
    setTimeout(() => textarea.focus(), 0)
  }, true)

  function closeEditor() {
    editor.classList.remove("open")
    pendingTarget?.classList.remove("mn-annotation-target")
    pendingTarget = null
  }

  editor.querySelector(".mn-cancel").addEventListener("click", closeEditor)
  editor.querySelector(".mn-save").addEventListener("click", () => {
    const comment = textarea.value.trim()
    if (!comment || !pendingTarget) return textarea.focus()
    notes.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, page: currentPage(), target: targetLabel(pendingTarget), comment })
    saveNotes()
    closeEditor()
    panel.classList.add("open")
  })
  textarea.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") editor.querySelector(".mn-save").click()
    if (event.key === "Escape") closeEditor()
  })

  render()
})()
