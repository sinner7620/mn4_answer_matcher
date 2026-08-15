(() => {
  const levelNames = ["未掌握", "已理解", "可完成", "已掌握", "已稳定", "已迁移"]

  function replaceText(node, value) {
    if (node && node.textContent !== value) node.textContent = value
  }

  function targetIcon() {
    return `<svg class="preview-target-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle class="preview-target-dot" cx="12" cy="12" r="1.5"></circle></svg>`
  }

  function enhanceBrand() {
    const brand = document.querySelector(".appBrand")
    if (!brand) return
    replaceText(brand.querySelector("strong"), "MN4 Answer Matcher")
    const icon = brand.querySelector("span")
    if (icon && !icon.querySelector("img")) {
      const image = document.createElement("img")
      image.src = "__MN_PLUGIN_LOGO__"
      image.alt = "MN4 Answer Matcher"
      icon.appendChild(image)
    }
  }

  function enhanceTopNav() {
    const labels = ["总览", "错题本", "待复习", "设置"]
    document.querySelectorAll(".topNav > button").forEach((button, index) => {
      const label = button.querySelector("strong")
      if (label && labels[index]) replaceText(label, labels[index])
    })
  }

  function enhanceMistakeBrowser() {
    const count = document.querySelector(".listToolbar > span")
    const navTotal = document.querySelector(".topNav button:nth-child(2) b")?.textContent.trim()
    const match = count?.textContent.match(/(\d+)\s*\/\s*(\d+)/)
    const total = navTotal || match?.[2] || document.querySelectorAll(".mistakeItem").length
    if (count) replaceText(count, `共 ${total} 道错题`)

    const empty = document.querySelector(".detailPane > .emptyState")
    if (empty) {
      const text = empty.textContent || ""
      empty.classList.toggle("preview-batch-empty", /批量处理|已选择\s*\d+\s*道/.test(text))
    }

    document.querySelectorAll(".batchBar button").forEach(button => {
      if (/全选当前结果|全选结果/.test(button.textContent)) replaceText(button, "全选")
    })

    const batch = document.querySelector(".mistakeSidebar .batchBar.active")
    if (batch && !batch.querySelector(".preview-change-level")) {
      const apply = batch.querySelector(".batchApply")
      const button = document.createElement("button")
      button.type = "button"
      button.className = "preview-change-level"
      button.textContent = "更改等级"
      button.addEventListener("click", () => document.querySelector("#preview-level-picker")?.classList.add("open"))
      batch.insertBefore(button, apply)
    }

  }

  function normalizeLevelOptions() {
    document.querySelectorAll("select option").forEach(option => {
      const match = option.textContent.match(/(?:错题)?\s*([0-5])\s*级\s*[·\-—]?\s*(未掌握|已理解|可完成|已掌握|已稳定|已迁移)/)
      if (match) replaceText(option, `${match[1]}级-${match[2]}`)
    })
  }

  function enhanceDetail() {
    const detail = document.querySelector(".detail")
    if (!detail) return
    const header = detail.querySelector(".detailHeader")
    const title = header?.querySelector("h2")
    if (title && !header.querySelector(".preview-detail-badges")) {
      const selected = detail.querySelector(".detailControls > select option:checked")?.textContent || "1级-已理解"
      const level = selected.match(/[0-5]/)?.[0] || "1"
      const reviewText = header.querySelector(":scope > div > small:last-child")?.textContent?.split(" · ").slice(1).join(" · ").trim() || "已到期"
      const status = reviewText.replace(/^下次复习/, "")
      const badges = document.createElement("span")
      badges.className = "preview-detail-badges"
      badges.innerHTML = `<span class="preview-level-badge preview-level-${level}">${level}级</span><span class="preview-due-badge${status === "已到期" ? " is-due" : ""}">${status}</span>`
      title.insertAdjacentElement("afterend", badges)
    }
    const headerBody = header?.querySelector(":scope > div")
    if (headerBody && !headerBody.querySelector(".preview-detail-meta")) {
      const path = headerBody.querySelector("p")?.textContent?.trim() || ""
      const added = headerBody.querySelector(":scope > small:last-child")?.textContent?.trim() || ""
      const meta = document.createElement("div")
      meta.className = "preview-detail-meta"
      const parts = added.split(" · ")
      const review = parts.slice(1).join(" · ").replace(/^下次复习/, "")
      meta.textContent = [parts[0], review].filter(Boolean).join(" · ")
      headerBody.appendChild(meta)
    }
    if (headerBody && !headerBody.querySelector(".preview-detail-source-row")) {
      const notebook = headerBody.querySelector(":scope > small:first-child")
      const pathText = headerBody.querySelector(":scope > p")?.textContent?.trim() || "脑图根节点"
      if (notebook) {
        const sourceRow = document.createElement("div")
        sourceRow.className = "preview-detail-source-row"
        const path = document.createElement("span")
        path.className = "preview-detail-source-path"
        path.textContent = pathText
        headerBody.insertBefore(sourceRow, notebook)
        sourceRow.append(notebook, path)
      }
    }
    if (headerBody && !headerBody.querySelector(".preview-detail-title-row")) {
      const row = document.createElement("div")
      row.className = "preview-detail-title-row"
      const heading = headerBody.querySelector(":scope > h2")
      const badges = headerBody.querySelector(":scope > .preview-detail-badges")
      if (heading && badges) {
        headerBody.insertBefore(row, heading)
        row.append(heading, badges)
      }
    }
    const titleRow = headerBody?.querySelector(".preview-detail-title-row")
    const locate = header?.querySelector(":scope > button, .preview-detail-title-row > button")
    if (locate) locate.innerHTML = `${targetIcon()}<span>定位原题</span>`
    if (locate && titleRow && locate.parentElement !== titleRow) titleRow.appendChild(locate)
  }

  function enhanceReview() {
    const intro = document.querySelector(".reviewPage > .sectionIntro")
    if (intro) {
      intro.style.textAlign = "left"
      const description = intro.querySelector("p")
      if (description) replaceText(description, "先独立作答，再核对答案并更新掌握等级。")
    }
    document.querySelectorAll(".dueReviewActions > button:first-child").forEach(button => {
      button.innerHTML = "<span>定位原题</span>"
    })
  }

  function setDescription(button, value) {
    const description = button?.querySelector("small")
    if (description) replaceText(description, value)
  }

  function findSettingsButton(title) {
    return [...document.querySelectorAll(".settingsGroup button")].find(button => button.querySelector("strong")?.textContent.trim() === title)
  }

  function enhanceSettings() {
    setDescription(findSettingsButton("绑定或更换答案脑图"), "为当前题目脑图选择具体答案脑图")
    setDescription(findSettingsButton("标记所选卡片错题"), "支持脑图多选，统一选择错题等级")
    setDescription(findSettingsButton("导出错题"), "以 Markdown 格式预览导出")
    setDescription(findSettingsButton("重置窗口位置与大小"), "将工作台窗口恢复到默认尺寸")

    const binding = findSettingsButton("同一学习集具体脑图绑定")
    if (binding) {
      let toggle = binding.querySelector(".preview-switch")
      if (!toggle) {
        toggle = document.createElement("span")
        toggle.className = "preview-switch"
        toggle.setAttribute("role", "switch")
        binding.appendChild(toggle)
      }
      const enabled = /已开启/.test(binding.querySelector("small")?.textContent || "")
      toggle.classList.toggle("on", enabled)
      toggle.setAttribute("aria-checked", String(enabled))
    }

    const version = findSettingsButton("当前版本")?.querySelector("small")
    if (version) {
      const number = version.textContent.match(/v[\w.-]+/)?.[0] || "v2.3.1-beta.25"
      replaceText(version, `${number} · frank`)
    }

    enhanceReviewDayEditor()
  }

  function enhanceReviewDayEditor() {
    const guide = document.querySelector(".mistakeLevelGuide")
    if (!guide) return
    const save = guide.querySelector("footer button")
    const inputs = [...guide.querySelectorAll('.reviewDayEditor input')]

    guide.querySelectorAll(".reviewDayEditor").forEach(editor => {
      ;[...editor.querySelectorAll("label")].forEach((label, index) => {
        let caption = label.querySelector("small")
        if (!caption) {
          caption = document.createElement("small")
          label.insertBefore(caption, label.firstChild)
        }
        replaceText(caption, index === 0 ? "首次" : "后续")
      })
    })

    if (!guide.dataset.previewEditorReady) {
      guide.dataset.previewEditorReady = "true"
      guide.dataset.editing = "false"
      inputs.forEach(input => { input.disabled = true })
      save.addEventListener("click", event => {
        if (guide.dataset.editing !== "true") {
          event.preventDefault()
          event.stopImmediatePropagation()
          guide.dataset.editing = "true"
          inputs.forEach(input => { input.disabled = false })
          replaceText(save, "保存并应用")
          inputs[0]?.focus()
        } else {
          guide.dataset.editing = "false"
          setTimeout(() => {
            guide.querySelectorAll('.reviewDayEditor input').forEach(input => { input.disabled = true })
            replaceText(guide.querySelector("footer button"), "编辑复习天数")
          }, 80)
        }
      }, true)
    }
    if (guide.dataset.editing !== "true") {
      inputs.forEach(input => { input.disabled = true })
      replaceText(save, "编辑复习天数")
    }
  }

  function installLevelPicker() {
    if (document.querySelector("#preview-level-picker")) return
    const picker = document.createElement("div")
    picker.id = "preview-level-picker"
    picker.innerHTML = `<div><h2>批量更改错题等级</h2><section>${levelNames.map((name, level) => `<button type="button" data-level="${level}"><i class="level${level}">${level}级</i><span>${name}</span></button>`).join("")}</section><footer><button type="button" data-cancel>取消</button></footer></div>`
    picker.addEventListener("click", event => {
      if (event.target === picker || event.target.closest("[data-cancel]")) return picker.classList.remove("open")
      const choice = event.target.closest("[data-level]")
      if (!choice) return
      const select = document.querySelector(".mistakeSidebar .batchBar.active select")
      const apply = document.querySelector(".mistakeSidebar .batchBar.active .batchApply")
      if (select && apply) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set
        setter.call(select, choice.dataset.level)
        select.dispatchEvent(new Event("change", { bubbles: true }))
        setTimeout(() => apply.click(), 0)
      }
      picker.classList.remove("open")
    })
    document.body.appendChild(picker)
  }

  function enhance() {
    enhanceBrand()
    enhanceTopNav()
    enhanceMistakeBrowser()
    enhanceDetail()
    normalizeLevelOptions()
    enhanceReview()
    enhanceSettings()
    installLevelPicker()
  }

  let queued = false
  const observer = new MutationObserver(() => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => { queued = false; enhance() })
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  enhance()
})()
