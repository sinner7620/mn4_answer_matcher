import React, { useEffect, useMemo, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import MNBridge from "./lib/mnBridge"
import { Icon } from "./icons"
import { mountJustGlassDebug, unmountJustGlassDebug } from "./just-glass-debug"
import { mountLiquidGlassTopbar, unmountLiquidGlassTopbar } from "./liquid-glass-topbar"
import { buildMindMapOptions, buildParentInsights, sourceInsightKey } from "../../src/source-insights"
import "./styles.css"
import "./overview.css"
import "./overview-polish.css"
import "./source-chart.css"
import "./icons.css"
import "./reference-theme.css"
import "./review-actions.css"
import "./export.css"
import "./layout-reference.css"
import "./beta-ui.css"
import "./ui-reference-final.css"
import "./export-beta2.css"
import "./liquid-glass-topbar.css"

const levelNames = ["未掌握", "已理解", "可完成", "已掌握", "已稳定", "已迁移"]
const levelExplanations = [
  "完全不会，或看答案仍不理解",
  "能看懂答案，但无法独立完成",
  "能完成，但仍有提示、错误或明显超时",
  "能够独立、正确地完成",
  "连续多次正确，并能完成简单变式",
  "能识别模型、讲清方法并解决变式"
]
const defaultReviewCurves = [[1], [1], [3], [7, 14], [30], [60]]

function levelLabel(level) {
  return `错题${level}级`
}

function TargetIcon() {
  return <svg className="preview-target-icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle className="preview-target-dot" cx="12" cy="12" r="1.5" />
  </svg>
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase()
    .replace(/[\s，,。.;；:：、/\\|()[\]【】{}]+/g, "")
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "未知"
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function reviewCountdown(value) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return "复习时间未知"
  const days = Math.ceil((time - Date.now()) / 86400000)
  if (days <= 0) return "已到期"
  return `下次复习剩余 ${days} 天`
}

function categoryChoices(records, prefix) {
  const depth = prefix.length
  const counts = new Map()
  for (const record of records) {
    const path = record.categoryPath || []
    if (!prefix.every((part, index) => path[index] === part)) continue
    const part = path[depth]
    if (part) counts.set(part, (counts.get(part) || 0) + 1)
  }
  return [...counts].map(([name, count]) => ({ name, count }))
}

function patchReviewedMistake(data, reviewed) {
  if (!data?.mistakes?.records || !reviewed?.recordId) return data
  const records = data.mistakes.records.map(record =>
    record.recordId === reviewed.recordId ? { ...record, ...reviewed } : record
  )
  const now = Date.now()
  return {
    ...data,
    mistakes: {
      ...data.mistakes,
      records,
      dueCount: records.filter(record =>
        record.noteAvailable && new Date(record.nextReviewAt).getTime() <= now
      ).length,
      levelCounts: levelNames.map((_, nextLevel) =>
        records.filter(record => record.level === nextLevel).length
      )
    }
  }
}

function App() {
  const [tab, setTab] = useState("mistakes")
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [level, setLevel] = useState("all")
  const [categoryPath, setCategoryPath] = useState([])
  const [selectedId, setSelectedId] = useState("")
  const [detail, setDetail] = useState(null)
  const [postTestResult, setPostTestResult] = useState(null)
  const selectedIdRef = useRef("")
  const versionTapRef = useRef({ count: 0, lastAt: 0 })
  selectedIdRef.current = selectedId

  async function load() {
    setBusy(true)
    setError("")
    try {
      const next = await MNBridge.send("dashboard")
      setData(next)
      const records = next?.mistakes?.records || []
      const currentSelectedId = selectedIdRef.current
      if (currentSelectedId && !records.some(item => item.recordId === currentSelectedId)) {
        setSelectedId("")
        setDetail(null)
      }
      else if (currentSelectedId) {
        setDetail(await MNBridge.send("mistakeDetail", { recordId: currentSelectedId }))
      }
    } catch (reason) {
      setError(reason.message || String(reason))
    } finally {
      setBusy(false)
    }
  }

  async function action(command, payload, reload = true) {
    setBusy(true)
    setError("")
    try {
      const result = await MNBridge.send(command, payload)
      if (reload && command === "reviewMistake" && result) {
        setData(current => patchReviewedMistake(current, result))
        setBusy(false)
      }
      else if (reload) await load()
      else setBusy(false)
      return result
    } catch (reason) {
      setError(reason.message || String(reason))
      setBusy(false)
    }
  }

  async function openDetail(recordId) {
    setSelectedId(recordId)
    setBusy(true)
    setError("")
    try {
      setDetail(await MNBridge.send("mistakeDetail", { recordId }))
    } catch (reason) {
      setDetail(null)
      setError(reason.message || String(reason))
    } finally {
      setBusy(false)
    }
  }

  function openExport() {
    setTab("export")
    requestAnimationFrame(() => document.querySelector("main")?.scrollTo({ top: 0, left: 0 }))
  }

  useEffect(() => {
    load()
    window.__onPanelShow = load
    window.__onNativeDataChanged = load
    return () => {
      delete window.__onPanelShow
      delete window.__onNativeDataChanged
    }
  }, [])

  const debugModeEnabled = data?.matching?.debugModeEnabled === true
  const experimentalGlassEnabled = debugModeEnabled && data?.matching?.experimentalGlassEnabled === true

  useEffect(() => {
    if (experimentalGlassEnabled) {
      mountJustGlassDebug()
      mountLiquidGlassTopbar()
    } else {
      unmountJustGlassDebug()
      unmountLiquidGlassTopbar()
    }
    return () => {
      unmountJustGlassDebug()
      unmountLiquidGlassTopbar()
    }
  }, [experimentalGlassEnabled])

  async function handleVersionTap() {
    const now = Date.now()
    const taps = versionTapRef.current
    taps.count = now - taps.lastAt <= 1500 ? taps.count + 1 : 1
    taps.lastAt = now
    if (!debugModeEnabled && taps.count >= 5) {
      taps.count = 0
      await action("setDebugMode", { enabled: true })
      return
    }
    if (debugModeEnabled) {
      await action("notify", { message: `当前版本 v${data?.version || "…"}；调试模式已开启` }, false)
    }
  }

  async function runPostTest() {
    setPostTestResult(null)
    const result = await action("testTelemetryPost", null, false)
    if (result?.test) setPostTestResult(result)
  }

  const records = useMemo(() => {
    const needle = normalizeSearch(query)
    return (data?.mistakes?.records || []).filter(item =>
      (level === "all" || String(item.level) === level) &&
      (!categoryPath.length || categoryPath.every((part, index) => (item.categoryPath || [])[index] === part)) &&
      (!needle || normalizeSearch(`${item.sourceTitle} ${item.sourceNotebookTitle} ${item.categoryLabel} ${(item.sourcePathTitles || []).join(" ")} ${(item.manualCategories || []).join(" ")} ${item.manualCategory || ""}`).includes(needle))
    )
  }, [data, query, level, categoryPath])

  const entries = [
    ["overview", "总览"],
    ["mistakes", "错题本", data?.mistakes?.records?.length || 0],
    ["review", "待复习", data?.mistakes?.dueCount || 0],
    ["settings", "设置"]
  ]

  const panelCloseSide = data?.matching?.panelCloseButtonSide === "right" ? "right" : "left"
  const refreshButton = <button className="iconButton" aria-label="刷新" onClick={load} disabled={busy}><Icon name="refresh" /></button>
  const closeButton = <button className="iconButton" aria-label="关闭插件窗口" onClick={() => action("closePanel", null, false)}><Icon name="close" /></button>

  return <div className={`shell panelClose-${panelCloseSide} ${experimentalGlassEnabled ? "mn-liquid-glass-topbar" : ""}`}>
    <main>
      <header className="topBar">
        <div className="topTools topTools-left">{panelCloseSide === "left" && <>{closeButton}{refreshButton}</>}</div>
        <nav className="topNav">{entries.map(([key, name, count]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><strong>{name}</strong>{count > 0 && <b>{count}</b>}</button>)}</nav>
        <div className="topTools topTools-right">{panelCloseSide === "right" && <>{refreshButton}{closeButton}</>}</div>
      </header>
      <div className="pageHeading"><h1>{tab === "overview" ? "错题总览" : tab === "mistakes" ? "错题浏览" : tab === "review" ? "到期复习" : tab === "export" ? "导出错题" : "设置"}</h1><p>{tab === "overview" ? "掌握情况、到期复习和最近错题概览" : tab === "mistakes" ? "全部错题保留在原脑图中，可添加标签、核对答案并定位原题" : tab === "export" ? "从当前错题记录生成可另存的 PDF 或 Markdown 文件" : "跨脑图答案与错题工作台"}</p></div>
      {error && <div className="error">{error}</div>}
      {busy && <div className="loading"><i />正在读取 MarginNote 数据…</div>}

      {tab === "overview" && <MistakeOverview
        records={data?.mistakes?.records || []}
        onBrowse={() => setTab("mistakes")}
        onOpen={recordId => { setTab("mistakes"); openDetail(recordId) }}
        onSource={path => { setCategoryPath(path); setTab("mistakes") }}
      />}

      {tab === "mistakes" && <MistakeBrowser
        records={records}
        allRecords={data?.mistakes?.records || []}
        categories={data?.mistakes?.categories || []}
        customCategories={data?.mistakes?.customCategories || []}
        query={query} setQuery={setQuery}
        level={level} setLevel={setLevel}
        categoryPath={categoryPath} setCategoryPath={setCategoryPath}
        selectedId={selectedId}
        detail={detail}
        openDetail={openDetail}
        action={action}
        reloadDetail={() => selectedId && openDetail(selectedId)}
        onRemoved={() => { setSelectedId(""); setDetail(null) }}
      />}

      {tab === "review" && <DueReviewList
        records={(data?.mistakes?.records || []).filter(item => item.noteAvailable && new Date(item.nextReviewAt) <= new Date())}
        action={action}
      />}

      {tab === "export" && <MistakeExport
        allRecords={data?.mistakes?.records || []}
        filteredRecords={records}
        action={action}
        onBack={() => setTab("settings")}
      />}

      {tab === "settings" && <section className="settingsPage">
        <header className="sectionIntro"><h1>设置与管理</h1><p>管理答案匹配、错题操作、复习节奏与插件状态。</p></header>
        <div className="settingsColumns"><div className="settingsGroups settingsPrimary">
          <SettingsGroup title="答案匹配" items={[
          ["bind", "同一学习集具体脑图绑定", data?.matching?.scopedBinding
            ? "已开启：每个题目脑图可绑定具体答案脑图，点击关闭"
            : "已关闭：点击开启，可选择同一学习集下的其他脑图", () => action("setScopedBinding", { enabled: !data?.matching?.scopedBinding }), <span className={`preview-switch ${data?.matching?.scopedBinding ? "on" : ""}`} role="switch" aria-checked={!!data?.matching?.scopedBinding} key="switch" />],
          ["bind", "绑定或更换答案脑图", data?.matching?.scopedBinding
            ? "为当前题目脑图选择具体答案脑图"
            : "当前按整个答案学习集绑定；开启上方选项可绑定具体脑图", () => action("bindAnswerNotebook")],
          ["organize", "设置答案匹配方式", data?.matching?.mode === "parent-order"
            ? `章节顺序配对：${data.matching.matchedGroups} 个父节点，${data.matching.pairs} 张卡片`
            : data?.matching?.mode === "regex"
              ? "独立正则规则匹配（不会回退到其他查找方式）"
              : "完整标题匹配、章节顺序配对或独立正则规则匹配", () => action("configureAnswerMatching")],
          ["refresh", "刷新答案索引", "仅在答案脑图内容变化后手动刷新", () => action("refreshAnswerIndex")],
          ["unlink", "解除答案绑定", "解除当前题目脑图的答案关联", () => action("unbindAnswerNotebook")]
        ]} />
          {data?.matching?.mode === "regex" &&
            <RegexMatchingSettings matching={data.matching} action={action} />}
          <SettingsGroup title="错题管理" items={[
          ["mistakes", "标记所选卡片错题", "支持脑图多选，统一选择错题等级", () => action("markMistake")],
          ["locate", "定位当前错题原题", "跳转到当前错题记录的原脑图位置", () => action("openCurrentMistakeSource", null, false)],

          ["organize", "刷新错题分类索引", "重新读取脑图标题、父节点路径和答案绑定", () => action("repairMistakes")],
          ["download", "导出错题", "以 Markdown 格式预览导出", openExport]
          ]} />
          <SettingsGroup title="插件" items={[
          ["info", "当前版本", `v${data?.version || "…"} · frank`, handleVersionTap],
          ["organize", "插件窗口关闭按钮", panelCloseSide === "right"
            ? "当前位于右上角，点击切换到左上角"
            : "当前位于左上角，点击切换到右上角", () => action("setPanelCloseButtonSide", { side: panelCloseSide === "right" ? "left" : "right" }), <span className={`preview-switch ${panelCloseSide === "right" ? "on" : ""}`} role="switch" aria-label="左侧或右侧" aria-checked={panelCloseSide === "right"} key="close-position" />],
          ["reset", "重置窗口位置与大小", "将工作台窗口恢复到默认尺寸", () => action("resetPanelFrame", null, false)],
          ["download", "检查插件更新", "检查 GitHub 版本并选择安装或保存", () => action("checkUpdates", null, false)]

          ]} />
          {debugModeEnabled && <>
            <SettingsGroup title="调试功能" items={[
              ["download", "导出运行日志", "仅记录并导出调试模式开启期间的运行事件", () => action("exportRuntimeLog", null, false)],
              ["organize", "实验性 UI 测试", experimentalGlassEnabled
                ? "已开启：各界面最顶层显示可拖动 Just Glass 折射矩形"
                : "已关闭：点击加载可拖动 Just Glass 折射矩形", () => action("setExperimentalGlass", { enabled: !experimentalGlassEnabled }), <span className={`preview-switch ${experimentalGlassEnabled ? "on" : ""}`} role="switch" aria-checked={experimentalGlassEnabled} key="experimental-glass" />],
              ["refresh", "上报 POST 测试", "发送明确标注为测试内容的请求，并检查每个上报域名", runPostTest],
              ["close", "退出调试模式", "停止日志记录、关闭实验 UI 并清空运行日志", () => { setPostTestResult(null); action("setDebugMode", { enabled: false }) }]
            ]} />
            {postTestResult && <PostTestResult result={postTestResult} />}
          </>}
        </div><div className="settingsGroups settingsSecondary">
          <MistakeLevelGuide reviewCurves={data?.mistakes?.reviewCurves} action={action} />
        </div></div>
      </section>}
    </main>
  </div>
}

function PostTestResult({ result }) {
  return <section className="postTestResult"><header><strong>POST 连通性测试结果</strong><small>{formatDate(result.testedAt)} · 测试内容不会更新正式上报状态</small></header><div>{(result.results || []).map(item => <article key={item.endpoint} className={item.reachable ? "reachable" : "failed"}><span><strong>{item.domain}</strong><small>{item.endpoint}</small></span><b>{item.reachable ? `已连通 · HTTP ${item.statusCode}` : `未连通 · ${item.error || "无响应"}`}</b><em>{item.durationMs} ms</em></article>)}</div></section>
}

function MistakeBrowser(props) {
  const { records, allRecords, selectedId, detail, openDetail, action, reloadDetail, onRemoved } = props
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [batchLevel, setBatchLevel] = useState("0")
  const [removeArmed, setRemoveArmed] = useState(false)
  const [levelPickerOpen, setLevelPickerOpen] = useState(false)
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  useEffect(() => {
    const available = new Set(allRecords.map(record => record.recordId))
    setSelectedIds(current => current.filter(recordId => available.has(recordId)))
  }, [allRecords])

  function toggleSelecting() {
    setSelecting(value => !value)
    setSelectedIds([])
    setRemoveArmed(false)
  }

  function toggleRecord(recordId) {
    setRemoveArmed(false)
    setSelectedIds(current => current.includes(recordId)
      ? current.filter(id => id !== recordId)
      : [...current, recordId])
  }

  function selectVisible() {
    setRemoveArmed(false)
    setSelectedIds(current => {
      const next = new Set(current)
      for (const record of records) next.add(record.recordId)
      return [...next]
    })
  }

  async function changeSelectedLevel(nextLevel = batchLevel) {
    const result = await action("reviewMistakes", {
      recordIds: selectedIds,
      level: Number(nextLevel)
    })
    if (result) {
      setSelectedIds([])
      setRemoveArmed(false)
    }
  }

  async function removeSelected() {
    if (!removeArmed) return setRemoveArmed(true)
    const result = await action("removeMistakes", { recordIds: selectedIds })
    if (result) {
      setSelectedIds([])
      setRemoveArmed(false)
      onRemoved()
    }
  }

  return <section className="mistakeSection">
    <div className="browserGrid">
      <aside className="mistakeSidebar">
        <div className="filterBar">
          <input value={props.query} onChange={event => props.setQuery(event.target.value)} placeholder="搜索题名、脑图、章节或标签" />
          <div className="filterSelectors"><CategoryCascade records={allRecords} path={props.categoryPath} setPath={props.setCategoryPath} />
          <select value={props.level} onChange={event => props.setLevel(event.target.value)}><option value="all">全部等级</option>{levelNames.map((name, index) => <option value={String(index)} key={name}>{index}级-{name}</option>)}</select></div>
          <div className="listToolbar"><span>共 {allRecords.length} 道错题</span><button className="batchToggle" onClick={toggleSelecting}>{selecting ? "完成" : "选择"}</button></div>
        </div>
        {selecting && <div className="batchBar active">
          <strong>已选 {selectedIds.length} 道</strong>
          <button onClick={selectVisible} disabled={!records.length}>全选</button>
          <button className="preview-change-level" onClick={() => setLevelPickerOpen(true)} disabled={!selectedIds.length}>更改等级</button>
          <select value={batchLevel} onChange={event => setBatchLevel(event.target.value)}>{levelNames.map((name, index) => <option value={index} key={name}>{index}级-{name}</option>)}</select>
          <button className="batchApply" onClick={changeSelectedLevel} disabled={!selectedIds.length}>修改等级</button>
          <button className="batchRemove" onClick={removeSelected} disabled={!selectedIds.length}>{removeArmed ? `确认取消 ${selectedIds.length} 道` : "取消错题"}</button>
        </div>}
        <div className="mistakeList">{records.map(item => <MistakeListItem key={item.recordId} item={item} selected={!selecting && selectedId === item.recordId} selectable={selecting} checked={selectedSet.has(item.recordId)} onClick={() => selecting ? toggleRecord(item.recordId) : openDetail(item.recordId)} />)}{!records.length && <Empty title="没有符合条件的错题" text="清空搜索或筛选条件后重试。" />}</div>
      </aside>
      <div className={`detailPane ${selecting ? "batchSelectionPane" : ""}`}>{selecting ? null : detail ? <MistakeDetail key={detail.record.recordId} detail={detail} customCategories={props.customCategories} action={action} reloadDetail={reloadDetail} onRemoved={onRemoved} /> : <Empty title="选择一道错题" text="右侧将显示完整原题、对应答案、分类和定位操作。" />}</div>
    </div>
    <div id="preview-level-picker" className={levelPickerOpen ? "open" : ""} onClick={event => event.target === event.currentTarget && setLevelPickerOpen(false)}>
      <div><h2>批量更改错题等级</h2><section>{levelNames.map((name, level) => <button type="button" key={name} onClick={async () => { setBatchLevel(String(level)); setLevelPickerOpen(false); await changeSelectedLevel(level) }}><i className={`level${level}`}>{level}级</i><span>{name}</span></button>)}</section><footer><button type="button" onClick={() => setLevelPickerOpen(false)}>取消</button></footer></div>
    </div>
  </section>
}

function CategoryCascade({ records, path, setPath }) {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(path)
  const choices = categoryChoices(records, cursor)
  const currentCount = records.filter(record => cursor.every((part, index) => (record.categoryPath || [])[index] === part)).length
  function toggle() {
    setCursor(path)
    setOpen(value => !value)
  }
  function choose(item) {
    const next = [...cursor, item.name]
    setPath(next)
    if (categoryChoices(records, next).length) setCursor(next)
    else setOpen(false)
  }
  return <div className="categoryTree">
    <button className="categoryTrigger" onClick={toggle}><span>{path.length ? path.join(" › ") : "全部分类"}</span><b><Icon name={open ? "up" : "down"} /></b></button>
    {open && <div className="categoryPopover">
      <div className="categoryPopoverHead"><button disabled={!cursor.length} onClick={() => setCursor(cursor.slice(0, -1))}><Icon name="left" /></button><strong>{cursor.length ? cursor.join(" › ") : "选择一级分类"}</strong><button onClick={() => setOpen(false)}><Icon name="close" /></button></div>
      <button className="categoryAll" onClick={() => { setPath([]); setCursor([]); setOpen(false) }}>全部错题 <b>{records.length}</b></button>
      {!!cursor.length && <button className="categoryCurrent" onClick={() => { setPath(cursor); setOpen(false) }}>查看当前分类下全部错题 <b>{currentCount}</b></button>}
      <div className="categoryOptions">{choices.map(item => {
        const hasChildren = categoryChoices(records, [...cursor, item.name]).length > 0
        return <button key={item.name} onClick={() => choose(item)}><span>{item.name}</span><b>{item.count}{hasChildren ? "　›" : ""}</b></button>
      })}{!choices.length && <small>当前分类没有下级</small>}</div>
    </div>}
  </div>
}

function MindMapMultiSelect({ options, selectedKeys, setSelectedKeys, title = "统计脑图" }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys])
  const selectedOptions = options.filter(option => selectedSet.has(option.key))
  const label = selectedKeys.length === options.length
    ? `全部 ${options.length} 个脑图`
    : selectedKeys.length === 1
      ? selectedOptions[0]?.name || "1 个脑图"
      : `已选 ${selectedKeys.length} 个脑图`

  useEffect(() => {
    if (!open) return undefined
    const close = event => {
      if (!ref.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener("pointerdown", close, true)
    return () => document.removeEventListener("pointerdown", close, true)
  }, [open])

  function toggle(key) {
    setSelectedKeys(current => {
      if (current.includes(key)) return current.length > 1 ? current.filter(item => item !== key) : current
      return [...current, key]
    })
  }

  return <div className={`mindMapSelect ${open ? "open" : ""}`} ref={ref}>
    <button type="button" className="mindMapSelectTrigger" onClick={() => setOpen(value => !value)}><span>{label}</span><Icon name={open ? "up" : "down"} /></button>
    {open && <div className="mindMapSelectMenu">
      <div className="mindMapSelectHead"><strong>{title}</strong><button type="button" onClick={() => setSelectedKeys(options.map(option => option.key))}>全选</button></div>
      <div className="mindMapSelectOptions">{options.map(option => <button type="button" key={option.key} className={selectedSet.has(option.key) ? "selected" : ""} onClick={() => toggle(option.key)}><i>{selectedSet.has(option.key) ? "✓" : ""}</i><span><strong>{option.name}</strong><small>{option.notebook}</small></span><b>{option.count}</b></button>)}</div>
    </div>}
  </div>
}

function MistakeOverview({ records, onBrowse, onOpen, onSource }) {
  const now = Date.now()
  const due = records.filter(item => new Date(item.nextReviewAt).getTime() <= now).length
  const weak = records.filter(item => item.level <= 1).length
  const mastered = records.filter(item => item.level === 5).length
  const recentCount = records.filter(item => now - new Date(item.createdAt).getTime() <= 7 * 86400000).length
  const levelCounts = levelNames.map((_, level) => records.filter(item => item.level === level).length)
  const maxLevelCount = Math.max(1, ...levelCounts)
  const recent = [...records].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5)
  const mindMaps = useMemo(() => buildMindMapOptions(records), [records])
  const mindMapSignature = mindMaps.map(map => map.key).join("\u001f")
  const [selectedMapKeys, setSelectedMapKeys] = useState([])
  useEffect(() => {
    const available = mindMaps.map(map => map.key)
    setSelectedMapKeys(current => {
      const kept = current.filter(key => available.includes(key))
      return kept.length ? kept : available
    })
  }, [mindMapSignature])
  const effectiveMapKeys = selectedMapKeys.length ? selectedMapKeys : mindMaps.map(map => map.key)
  const parentInsights = useMemo(() => buildParentInsights(records, effectiveMapKeys), [records, effectiveMapKeys.join("\u001f")])
  const sources = parentInsights.groups
  const sourceColors = ["#0f172a", "#657c68", "#c4a16b", "#df806e", "#64748b", "#8b7b86", "#94a3b8", "#7c8da6"]
  const topSources = sources.slice(0, 7)
  const remainingSources = sources.slice(7)
  const otherCount = remainingSources.reduce((sum, source) => sum + source.count, 0)
  const otherWeak = remainingSources.reduce((sum, source) => sum + source.weak, 0)
  const chartSources = [...topSources, ...(otherCount ? [{ key: "other", name: "其他父节点", mapName: `${remainingSources.length} 个父节点`, notebook: "", count: otherCount, weak: otherWeak, path: null }] : [])]
  let sourceOffset = 0
  const sourceGradient = chartSources.length ? chartSources.map((source, index) => {
    const start = sourceOffset
    sourceOffset += source.count / Math.max(1, parentInsights.classifiedRecords) * 100
    return `${sourceColors[index]} ${start}% ${sourceOffset}%`
  }).join(",") : "#e9edf5 0 100%"
  const mastery = records.length ? Math.round(mastered / records.length * 100) : 0
  const cards = [
    ["total", "错题总数", records.length, `${mindMaps.length} 棵题目脑图`],
    ["due", "今日到期", due, due ? "建议优先复习" : "当前已清空"],
    ["weak", "薄弱错题", weak, "错题0–1级"],
    ["mastered", "已迁移", mastered, "错题5级"],
    ["added", "近 7 天新增", recentCount, "持续积累"],
  ]
  const coverageText = parentInsights.unclassifiedRecords
    ? `有效分类 ${parentInsights.classifiedRecords}/${parentInsights.selectedRecords} 道 · ${parentInsights.unclassifiedRecords} 道父节点结构不足`
    : `有效分类 ${parentInsights.classifiedRecords}/${parentInsights.selectedRecords} 道`
  return <section className="overviewPage">
    <div className="overviewHero"><div><span className="overviewKicker">学习概览</span><strong>错题本学习进度</strong><small>{due ? `有 ${due} 道错题已经到期，建议从薄弱状态开始复习` : "当前没有到期任务"}</small></div><div className="masteryRing" style={{ "--progress": `${mastery * 3.6}deg` }}><span><strong>{mastery}%</strong><small>已迁移</small></span></div></div>
    <div className="overviewCards">{cards.map(([icon, label, value, note], index) => <div className={`overviewCard tone${index}`} key={label}><i><Icon name={icon} /></i><span><small>{label}</small><strong>{value}</strong><em>{note}</em></span></div>)}</div>
    <div className="overviewPanel sourcePanel"><header><div><strong>错题来源分布</strong><small>按所选脑图内错题父节点自适应聚合，自动避开“一题一类”和“全部一类”</small></div>{mindMaps.length ? <MindMapMultiSelect options={mindMaps} selectedKeys={effectiveMapKeys} setSelectedKeys={setSelectedMapKeys} /> : null}</header>{sources.length ? <><div className="sourceCoverageNote">{coverageText}</div><div className="sourceChart"><div className="sourceDonut" style={{ background: `conic-gradient(${sourceGradient})` }}><span><strong>{parentInsights.classifiedRecords}</strong><small>有效分类</small></span></div><div className="sourceBars">{chartSources.map((source, index) => {
      const percent = Math.round(source.count / Math.max(1, parentInsights.classifiedRecords) * 100)
      return <button key={source.key} disabled={!source.path?.length} onClick={() => source.path?.length && onSource(source.path)}><i style={{ background: sourceColors[index] }} /><span><strong>{source.name}</strong><small>{source.mapName}{source.weak ? ` · ${source.weak} 道薄弱` : ""}</small><em><b style={{ width: `${percent}%`, background: sourceColors[index] }} /></em></span><b>{source.count}<small>{percent}%</small></b></button>
    })}</div></div></> : mindMaps.length ? <Empty title="暂无有效父节点分类" text="所选脑图的父节点当前会形成“一题一类”或“全部一类”，已自动跳过无效统计。" icon={false} /> : <Empty title="暂无来源数据" text="标记错题后可按题目脑图内父节点统计。" />}</div>
    <div className="overviewGrid">
      <div className="overviewPanel"><header><strong>错题分类分布</strong><small>错题0级最薄弱，错题5级为已迁移</small></header><div className="levelChart">{levelCounts.map((count, level) => <div className="levelRow" key={level}><span>{level}级</span><div><i className={`levelBar level${level}`} style={{ width: `${Math.max(count ? 8 : 0, count / maxLevelCount * 100)}%` }} /></div><b>{count}</b></div>)}</div></div>
      <div className="overviewPanel recentPanel"><header><strong>最近添加</strong><button onClick={onBrowse}>浏览全部</button></header><div>{recent.map(item => <button className="recentItem" key={item.recordId} onClick={() => onOpen(item.recordId)}><span className={`level level${item.level}`}>{item.level}级</span><span><strong>{item.sourceTitle}</strong><small>{formatDate(item.createdAt)} · {reviewCountdown(item.nextReviewAt)}</small></span><b><Icon name="right" /></b></button>)}{!recent.length && <Empty title="还没有错题" text="从卡片侧边标记第一道错题。" />}</div></div>
    </div>
  </section>
}

function MistakeListItem({ item, selected, selectable, checked, onClick }) {
  const rawTags = Array.isArray(item.manualCategories) && item.manualCategories.length
    ? item.manualCategories
    : item.manualCategory ? [item.manualCategory] : []
  const manualTags = Array.from(new Set(rawTags.map(tag => String(tag).trim().replace(/^#+/, "")).filter(Boolean)))
  return <button className={`mistakeItem ${selected || checked ? "selected" : ""} ${selectable ? "selectable" : ""} ${item.noteAvailable ? "" : "unavailable"}`} onClick={onClick}>{selectable && <span className={`batchCheck ${checked ? "checked" : ""}`}>{checked ? "✓" : ""}</span>}<span className="mistakeItemBody"><strong>{item.sourceTitle}</strong>{manualTags.length > 0 ? <span className="mistakeItemTags">{manualTags.map(tag => <em key={tag}>#{tag}</em>)}</span> : <small>{item.categoryLabel}</small>}<small>添加 {formatDate(item.createdAt)} · {reviewCountdown(item.nextReviewAt)}</small><small>{item.sourceNotebookTitle}{item.noteAvailable ? "" : " · 原卡片不可用"}</small></span><span className={`level level${item.level}`}>{item.level}级</span></button>
}

function DueReviewList({ records, action }) {
  const [statusById, setStatusById] = useState({})
  const [answerDetail, setAnswerDetail] = useState(null)
  const [answerIndex, setAnswerIndex] = useState(0)

  async function toggleAnswer(recordId) {
    if (answerDetail?.record?.recordId === recordId) {
      setAnswerDetail(null)
      return
    }
    const detail = await action("mistakeDetail", { recordId }, false)
    if (detail) {
      setAnswerDetail(detail)
      setAnswerIndex(0)
    }
  }

  async function complete(item) {
    const level = Number(statusById[item.recordId] ?? item.level)
    const result = await action("reviewMistake", { recordId: item.recordId, level })
    if (result && answerDetail?.record?.recordId === item.recordId) setAnswerDetail(null)
  }

  return <section className="reviewPage">
    <header className="sectionIntro"><h1>到期复习</h1><p>{records.length ? "先独立作答，再核对答案并更新掌握等级。" : "当前复习任务已经完成。"}</p></header>
    <div className="reviewList">
    {!records.length ? <Empty title="目前没有到期错题" text="新的复习任务会按掌握状态自动出现。" icon={false} /> : <>
    <div className="reviewIntro"><strong>待复习 {records.length} 道</strong><small>完成标记后将按当前等级安排下一次复习。</small></div>
    {records.map(item => {
      const expanded = answerDetail?.record?.recordId === item.recordId
      const answer = expanded ? answerDetail.answers?.[Math.min(answerIndex, Math.max(0, answerDetail.answers.length - 1))] : null
      return <article className="dueReviewItem" key={item.recordId}>
        <div className="dueReviewSummary">
          <span className={`level level${item.level}`}>{item.level}级</span>
          <span><strong>{item.sourceTitle}</strong><small>{item.categoryLabel} · {item.sourceNotebookTitle}</small><small>{levelNames[item.level]} · {reviewCountdown(item.nextReviewAt)}</small></span>
        </div>
        <div className="dueReviewActions">
          <button onClick={() => action("openSource", { recordId: item.recordId }, false)}>定位原题</button>
          <button className={expanded ? "active" : ""} onClick={() => toggleAnswer(item.recordId)}>{expanded ? "收起答案" : "查看答案"}</button>
          <select value={statusById[item.recordId] ?? String(item.level)} onChange={event => setStatusById({ ...statusById, [item.recordId]: event.target.value })}>
            {levelNames.map((name, level) => <option value={level} key={name}>{level}级-{name}</option>)}
          </select>
          <button className="complete" onClick={() => complete(item)}>完成标记</button>
        </div>
        {expanded && <div className="dueAnswer">
          {answerDetail.answers?.length > 1 && <select value={answerIndex} onChange={event => setAnswerIndex(Number(event.target.value))}>{answerDetail.answers.map((candidate, index) => <option value={index} key={candidate.id}>{candidate.title} · {candidate.path}</option>)}</select>}
          {answer ? <iframe title={`${item.sourceTitle}答案`} srcDoc={answer.html} /> : <Empty title={answerDetail.answerStatus === "unbound" ? "来源脑图尚未绑定答案" : "没有匹配到答案"} text="答案按原题脑图当前绑定实时查询。" />}
        </div>}
      </article>
    })}</>}
    </div>
  </section>
}

function MistakeDetail({ detail, customCategories, action, reloadDetail, onRemoved }) {
  const [view, setView] = useState("question")
  const [answerIndex, setAnswerIndex] = useState(0)
  const [tags, setTags] = useState([])
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [newTag, setNewTag] = useState("")
  const [collapsed, setCollapsed] = useState(false)
  const [removeArmed, setRemoveArmed] = useState(false)
  const [deleteTagTarget, setDeleteTagTarget] = useState("")
  const tagPickerRef = useRef(null)
  const detailTagSignature = (detail.record.manualCategories || (detail.record.manualCategory ? [detail.record.manualCategory] : [])).join("\u001f")
  useEffect(() => {
    setTags(detail.record.manualCategories || (detail.record.manualCategory ? [detail.record.manualCategory] : []))
  }, [detail.record.recordId, detailTagSignature])
  useEffect(() => {
    setView("question")
    setAnswerIndex(0)
    setTagPickerOpen(false)
    setNewTag("")
    setCollapsed(false)
    setRemoveArmed(false)
    setDeleteTagTarget("")
  }, [detail.record.recordId])
  useEffect(() => {
    if (!tagPickerOpen) return undefined
    const close = event => {
      if (!tagPickerRef.current?.contains(event.target)) setTagPickerOpen(false)
    }
    document.addEventListener("pointerdown", close, true)
    return () => document.removeEventListener("pointerdown", close, true)
  }, [tagPickerOpen])
  const answer = detail.answers?.[Math.min(answerIndex, Math.max(0, detail.answers.length - 1))]
  const reviewStatus = reviewCountdown(detail.record.nextReviewAt).replace(/^下次复习/, "")
  async function applyTags(next) {
    setTags(next)
    await action("setMistakeCategory", { recordId: detail.record.recordId, categories: next })
    await reloadDetail()
  }
  function toggleTag(tag) {
    applyTags(tags.includes(tag) ? tags.filter(item => item !== tag) : [...tags, tag])
  }
  function createTag() {
    const clean = newTag.replace(/[\n\r#]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40)
    if (!clean) return
    setNewTag("")
    applyTags(tags.includes(clean) ? tags : [...tags, clean])
  }
  async function confirmDeleteTag() {
    if (!deleteTagTarget) return
    const result = await action("deleteMistakeTag", { tag: deleteTagTarget })
    if (!result) return
    setTags(current => current.filter(item => item !== deleteTagTarget))
    setDeleteTagTarget("")
    await reloadDetail()
  }
  async function updateLevel(event) {
    await action("reviewMistake", { recordId: detail.record.recordId, level: Number(event.target.value) })
    await reloadDetail()
  }
  function wirePreviewFrame(event) {
    try {
      const frame = event.currentTarget
      const frameDocument = frame.contentDocument
      if (!frameDocument) return
      if (!frameDocument.__mnPinchZoomBound) {
        frameDocument.__mnPinchZoomBound = true
        const frameWindow = frame.contentWindow
        const card = frameDocument.querySelector(".card") || frameDocument.body.firstElementChild
        if (!frameWindow || !card) return

        const baseWidth = Math.max(1, Math.ceil(card.getBoundingClientRect().width))
        const baseHeight = Math.max(1, Math.ceil(card.scrollHeight))
        let scale = 1
        let startScale = 1
        let startDistance = 0
        let focusX = 0
        let focusY = 0

        card.style.width = `${baseWidth}px`
        card.style.maxWidth = "none"
        card.style.transformOrigin = "0 0"
        card.style.willChange = "transform"
        frameDocument.documentElement.style.overflow = "auto"
        frameDocument.body.style.overflow = "visible"

        const distance = touches => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
        const midpoint = touches => ({
          x: (touches[0].clientX + touches[1].clientX) / 2,
          y: (touches[0].clientY + touches[1].clientY) / 2
        })
        const rememberFocus = point => {
          focusX = (frameWindow.scrollX + point.x) / scale
          focusY = (frameWindow.scrollY + point.y) / scale
        }
        const applyScale = (value, point) => {
          const nextScale = Math.max(1, Math.min(3, value))
          scale = nextScale
          card.style.transform = `scale(${scale})`
          frameDocument.body.style.width = `${Math.ceil(baseWidth * scale)}px`
          frameDocument.body.style.height = `${Math.ceil(baseHeight * scale)}px`
          frame.dataset.previewScale = scale.toFixed(2)
          if (point) {
            frameWindow.scrollTo(
              Math.max(0, focusX * scale - point.x),
              Math.max(0, focusY * scale - point.y)
            )
          }
        }

        frameDocument.addEventListener("touchstart", gesture => {
          if (gesture.touches.length !== 2) return
          const point = midpoint(gesture.touches)
          startDistance = distance(gesture.touches)
          startScale = scale
          rememberFocus(point)
        }, { passive: true })
        frameDocument.addEventListener("touchmove", gesture => {
          if (gesture.touches.length !== 2 || !startDistance) return
          gesture.preventDefault()
          const point = midpoint(gesture.touches)
          applyScale(startScale * distance(gesture.touches) / startDistance, point)
        }, { passive: false })
        frameDocument.addEventListener("touchend", gesture => {
          if (gesture.touches.length < 2) startDistance = 0
        }, { passive: true })
        frameDocument.addEventListener("gesturestart", gesture => {
          const point = { x: Number(gesture.clientX || frame.clientWidth / 2), y: Number(gesture.clientY || frame.clientHeight / 2) }
          startScale = scale
          rememberFocus(point)
          gesture.preventDefault()
        }, { passive: false })
        frameDocument.addEventListener("gesturechange", gesture => {
          const point = { x: Number(gesture.clientX || frame.clientWidth / 2), y: Number(gesture.clientY || frame.clientHeight / 2) }
          gesture.preventDefault()
          applyScale(startScale * Number(gesture.scale || 1), point)
        }, { passive: false })
        applyScale(1)
      }
      if (frameDocument && !frameDocument.__mnTagDismissBound) {
        frameDocument.__mnTagDismissBound = true
        frameDocument.addEventListener("pointerdown", () => setTagPickerOpen(false), true)
      }
    } catch {}
  }
  async function remove() {
    if (!removeArmed) return setRemoveArmed(true)
    const result = await action("removeMistake", { recordId: detail.record.recordId })
    if (result?.removed) onRemoved()
  }
  return <div className={`detail ${collapsed ? "preview-collapsed" : ""}`}>
    <div className="detailHeader"><div>
      {!collapsed && <div className="preview-detail-source-row"><small className="preview-studyset-name">{detail.record.sourceNotebookTitle}</small><span className="preview-detail-source-path">{(detail.record.sourcePathTitles || []).join(" › ") || "脑图根节点"}</span></div>}
      <div className="preview-detail-title-row"><h2>{detail.record.sourceTitle}</h2><button className="preview-locate-button" onClick={() => action("openSource", { recordId: detail.record.recordId }, false)}><TargetIcon /><span>定位原题</span></button><button className="detailCollapseToggle" title={collapsed ? "展开题目信息" : "折叠题目信息"} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}><Icon name={collapsed ? "down" : "up"} /></button></div>
      {!collapsed && <div className="preview-detail-meta"><span>添加于 {formatDate(detail.record.createdAt)}</span><span className={`preview-due-badge ${reviewStatus === "已到期" ? "is-due" : ""}`}>{reviewStatus}</span></div>}
    </div>

    </div>
    <div className="detailTabs">
      <button className={view === "question" ? "active" : ""} onClick={() => { setView("question"); setTagPickerOpen(false) }}>完整原题</button>
      <button className={view === "answer" ? "active" : ""} onClick={() => { setView("answer"); setTagPickerOpen(false) }}>对应答案 {detail.answers?.length ? `(${detail.answers.length})` : ""}</button>
      {view === "answer" && detail.answers?.length > 1 && <select className="answerVariantSelect" value={answerIndex} onChange={event => setAnswerIndex(Number(event.target.value))}>{detail.answers.map((item, index) => <option key={item.id} value={index}>{item.title} · {item.path}</option>)}</select>}
      <div className="detailTabRightGroup detailTabAux">
        <select className={`previewLevelSelect preview-level-${detail.record.level}`} value={detail.record.level} onChange={updateLevel}>{levelNames.map((name, index) => <option key={name} value={index}>{index}级</option>)}</select>
        <div ref={tagPickerRef} className={`detailTagPicker ${tagPickerOpen ? "open" : ""}`}>
          <button type="button" className="detailTagTrigger" onClick={() => setTagPickerOpen(value => !value)} title={tags.length ? tags.map(tag => `#${tag}`).join(" ") : "添加自定义标签"}><span>{tags.length ? tags.map(tag => `#${tag}`).join(" ") : "+ 标签"}</span><Icon name={tagPickerOpen ? "up" : "down"} /></button>
          {tagPickerOpen && <div className="detailCategoryMenu"><strong>自定义标签</strong><div className="detailCategoryOptions">{(customCategories || []).length ? (customCategories || []).map(tag => <div className="detailTagOptionRow" key={tag}><button type="button" role="checkbox" aria-checked={tags.includes(tag)} data-tag={tag} className={`detailTagOption ${tags.includes(tag) ? "checked" : ""}`} onClick={() => toggleTag(tag)}><i className="detailTagCheck" aria-hidden="true">{tags.includes(tag) ? "✓" : ""}</i><span>#{tag}</span></button><button type="button" className="detailTagDelete" title={`删除标签 #${tag}`} aria-label={`删除标签 ${tag}`} onClick={event => { event.stopPropagation(); setDeleteTagTarget(tag) }}><Icon name="trash" /></button></div>) : <small>暂无标签</small>}</div><div className="detailCategoryCreate"><input value={newTag} onChange={event => setNewTag(event.target.value)} onKeyDown={event => { if (event.key === "Enter") createTag() }} placeholder="新建标签" /><button type="button" onClick={createTag} disabled={!newTag.trim()}>新建</button></div></div>}
        </div>
        <button className={`detailRemoveMistake ${removeArmed ? "confirming" : ""}`} onClick={remove}>{removeArmed ? "再次确认" : "取消错题"}</button>
      </div>
    </div>
    <div className="cardFrame">{view === "question" ? <iframe key={`${detail.record.recordId}:question`} title="错题原题" srcDoc={detail.questionHtml} onLoad={wirePreviewFrame} /> : answer ? <iframe key={`${detail.record.recordId}:answer:${answer.id || answerIndex}`} title="错题答案" srcDoc={answer.html} onLoad={wirePreviewFrame} /> : <Empty title={detail.answerStatus === "unbound" ? "尚未绑定答案脑图" : detail.answerStatus === "index-missing" ? "答案索引尚未建立" : "没有匹配答案"} text="可从经典菜单绑定答案脑图或刷新答案索引。" />}</div>
    {deleteTagTarget && <div className="tagDeleteConfirmOverlay" role="presentation" onClick={event => event.target === event.currentTarget && setDeleteTagTarget("")}><div className="tagDeleteConfirm" role="dialog" aria-modal="true" aria-labelledby="tag-delete-title"><h3 id="tag-delete-title">删除标签</h3><p>确定删除 <strong>#{deleteTagTarget}</strong> 吗？该标签会从所有错题卡片中移除。</p><div><button type="button" onClick={() => setDeleteTagTarget("")}>取消</button><button type="button" className="danger" onClick={confirmDeleteTag}>删除</button></div></div></div>}
  </div>
}

function Empty({ title, text, icon = true }) {
  return <div className="emptyState">{icon && <span><Icon name="search" /></span>}<strong>{title}</strong><small>{text}</small></div>
}

function SettingsGroup({ title, items }) {
  return <div className="settingsGroup"><h2>{title}</h2><div>{items.map(([icon, name, description, onClick, trailing]) => <button key={name} className={trailing ? "hasTrailing" : ""} onClick={onClick}><i><Icon name={icon} /></i><span><strong>{name}</strong><small>{description}</small></span>{trailing}</button>)}</div></div>
}

function RegexMatchingSettings({ matching, action }) {
  const [questionPattern, setQuestionPattern] = useState("")
  const [answerPattern, setAnswerPattern] = useState("")
  const [saved, setSaved] = useState("")

  useEffect(() => {
    setQuestionPattern(matching?.regexRules?.questionPattern || "")
    setAnswerPattern(matching?.regexRules?.answerPattern || "")
  }, [matching?.regexRules?.questionPattern, matching?.regexRules?.answerPattern])

  function applyPreset(kind) {
    const pattern = kind === "number"
      ? String.raw`(?:第\s*)?(\d+)\s*(?:题|[.、])?`
      : String.raw`(?:第\s*)?(\d+)\s*(?:章|[-－—])\D*?(?:第\s*)?(\d+)\s*(?:题)?`
    setQuestionPattern(pattern)
    setAnswerPattern(pattern)
    setSaved("")
  }

  async function save() {
    setSaved("")
    const result = await action("saveRegexMatchingRules", {
      questionPattern,
      answerPattern
    })
    if (result?.saved) setSaved("规则已保存，正则匹配模式已独立启用。")
  }

  return <section className="regexSettings">
    <header>
      <span><strong>正则规则匹配</strong><small>独立匹配方式，不参与完整标题或章节顺序的查找优先级</small></span>
      <b className={matching?.mode === "regex" ? "active" : ""}>{matching?.mode === "regex" ? "已启用" : "未启用"}</b>
    </header>
    <div className="regexPresets">
      <button onClick={() => applyPreset("number")}>仅题号预设</button>
      <button onClick={() => applyPreset("chapter-number")}>章节＋题号预设</button>
    </div>
    <label>
      <span>题目匹配规则</span>
      <input value={questionPattern} onChange={event => { setQuestionPattern(event.target.value); setSaved("") }} placeholder={String.raw`例如：(?:第\s*)?(\d+)\s*题`} />
    </label>
    <label>
      <span>答案匹配规则</span>
      <input value={answerPattern} onChange={event => { setAnswerPattern(event.target.value); setSaved("") }} placeholder={String.raw`例如：答案\s*(\d+)`} />
    </label>
    <p>规则无需填写 <code>/.../</code> 分隔符。存在捕获组时按捕获组顺序生成匹配键；没有捕获组时使用完整匹配内容。题目键与答案键完全相同时才会匹配。</p>
    <button className="regexSave" disabled={!questionPattern.trim() || !answerPattern.trim()} onClick={save}>保存规则并启用正则匹配</button>
    {saved && <small className="regexSaved">{saved}</small>}
  </section>
}

function MistakeLevelGuide({ reviewCurves, action }) {
  const normalized = defaultReviewCurves.map((fallback, level) =>
    fallback.map((days, index) => Number(reviewCurves?.[level]?.[index]) || days))
  const [curves, setCurves] = useState(normalized)
  const [saved, setSaved] = useState("")
  const [editing, setEditing] = useState(false)
  useEffect(() => { setCurves(normalized) }, [JSON.stringify(reviewCurves)])

  function update(level, index, value) {
    const next = curves.map(curve => [...curve])
    next[level][index] = value
    setCurves(next)
    setSaved("")
  }

  async function save() {
    const valid = curves.map((curve, level) => curve.map((value, index) => {
      const days = Number(value)
      return Number.isInteger(days) && days >= 1 && days <= 3650 ? days : defaultReviewCurves[level][index]
    }))
    const result = await action("saveMistakeReviewCurves", { curves: valid })
    if (result) {
      setCurves(valid)
      setSaved("已保存；将在新标记或完成复习后生效")
      setEditing(false)
    }
  }

  return <section className="mistakeLevelGuide">
    <header><h2>错题分类说明</h2><p>分类表示当前掌握程度；可自定义1–3650天，复习完成后按所选级别安排下次复习。</p></header>
    <div>{levelNames.map((name, level) => <article key={name}>
      <span className={`level level${level}`}>{level}级</span>
      <span><strong>{levelLabel(level)} · {name}</strong><small>{levelExplanations[level]}</small></span>
      <span className="reviewDayEditor">{curves[level].map((days, index) => <label key={index}>
        <small>{index === 0 ? "首次" : "后续"}</small>
        <input type="number" min="1" max="3650" step="1" value={days} disabled={!editing} onChange={event => update(level, index, event.target.value)} />
        <em>天后复习</em>
      </label>)}</span>
    </article>)}</div>
    <footer><button onClick={() => editing ? save() : setEditing(true)}>{editing ? "保存并应用" : "编辑复习天数"}</button>{saved && <small>{saved}</small>}</footer>
  </section>
}

function ExportCustomPicker({ records, selectedIds, setSelectedIds }) {
  const [previewId, setPreviewId] = useState("")
  const [preview, setPreview] = useState(null)
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const signature = records.map(item => item.recordId).join("\u001f")

  useEffect(() => {
    if (!records.length) {
      setPreviewId("")
      setPreview(null)
      return
    }
    if (!records.some(item => item.recordId === previewId)) setPreviewId(records[0].recordId)
  }, [signature, previewId])

  useEffect(() => {
    if (!previewId) return undefined
    let cancelled = false
    MNBridge.send("mistakeDetail", { recordId: previewId })
      .then(next => { if (!cancelled) setPreview(next) })
      .catch(() => { if (!cancelled) setPreview(null) })
    return () => { cancelled = true }
  }, [previewId])

  function toggle(recordId) {
    setSelectedIds(current => current.includes(recordId)
      ? current.filter(id => id !== recordId)
      : [...current, recordId])
  }

  return <div className="exportCustomPicker">
    <div className="exportPickList"><header><strong>自选题目</strong><span>{selectedIds.length}/{records.length}</span></header><div className="exportPickActions"><button type="button" onClick={() => setSelectedIds(records.map(item => item.recordId))}>全选</button><button type="button" onClick={() => setSelectedIds([])}>清空</button></div><div className="exportPickRows">
      {records.map(item => <div className={`exportPickRow ${previewId === item.recordId ? "active" : ""}`} key={item.recordId} onClick={() => setPreviewId(item.recordId)}><input type="checkbox" checked={selectedSet.has(item.recordId)} onClick={event => event.stopPropagation()} onChange={() => toggle(item.recordId)} /><span><strong>{item.sourceTitle}</strong><small>{item.sourceNotebookTitle} · 错题{item.level}级</small></span></div>)}
      {!records.length && <small className="exportPickEmpty">当前筛选范围没有错题</small>}
    </div></div>
    <div className="exportPickPreview"><header><strong>题目预览</strong>{preview?.record && <small>{preview.record.sourceTitle}</small>}</header>{preview ? <iframe title="自选题目预览" srcDoc={preview.questionHtml} /> : <Empty title="选择一道题目" text="左侧勾选导出题目，点击条目可在这里预览原题。" icon={false} />}</div>
  </div>
}

function MistakeExport({ allRecords, filteredRecords, action, onBack }) {
  const [format, setFormat] = useState("pdf")
  const [scope, setScope] = useState("all")
  const [filename, setFilename] = useState(`MN4错题导出-${new Date().toISOString().slice(0, 10)}`)
  const [include, setInclude] = useState({ question: true, answer: true, source: true, review: false })
  const [result, setResult] = useState("")
  const [answerLayout, setAnswerLayout] = useState("interleaved")
  const [exportLevel, setExportLevel] = useState("all")
  const [selectedMapKeys, setSelectedMapKeys] = useState([])
  const [customIds, setCustomIds] = useState([])
  const dueRecords = useMemo(() => allRecords.filter(item => item.noteAvailable && new Date(item.nextReviewAt).getTime() <= Date.now()), [allRecords])
  const mindMaps = useMemo(() => buildMindMapOptions(allRecords), [allRecords])
  const mindMapSignature = mindMaps.map(map => map.key).join("\u001f")
  useEffect(() => {
    const available = mindMaps.map(map => map.key)
    setSelectedMapKeys(current => {
      const kept = current.filter(key => available.includes(key))
      return kept.length ? kept : available
    })
  }, [mindMapSignature])
  const effectiveMapKeys = selectedMapKeys.length ? selectedMapKeys : mindMaps.map(map => map.key)
  const effectiveMapSet = useMemo(() => new Set(effectiveMapKeys), [effectiveMapKeys.join("\u001f")])
  const scopeBase = scope === "due" ? dueRecords : scope === "filtered" ? filteredRecords : allRecords
  const exportCandidates = useMemo(() => scopeBase.filter(item =>
    (exportLevel === "all" || item.level === Number(exportLevel)) &&
    (!mindMaps.length || effectiveMapSet.has(sourceInsightKey(item)))
  ), [scopeBase, exportLevel, mindMapSignature, effectiveMapKeys.join("\u001f")])
  const candidateSignature = exportCandidates.map(item => item.recordId).join("\u001f")
  useEffect(() => {
    const available = new Set(exportCandidates.map(item => item.recordId))
    setCustomIds(current => current.filter(id => available.has(id)))
  }, [candidateSignature])
  const customIdSet = useMemo(() => new Set(customIds), [customIds])
  const selected = scope === "custom" ? exportCandidates.filter(item => customIdSet.has(item.recordId)) : exportCandidates
  const toggle = key => setInclude(current => ({ ...current, [key]: !current[key] }))

  async function runExport() {
    setResult("")
    const response = await action("exportMistakes", {
      format,
      filename,
      recordIds: selected.map(item => item.recordId),
      answerLayout,
      include
    }, false)
    if (response?.pdfGenerated) setResult(`PDF 已生成，共 ${response.pages} 页；已打开系统保存面板（${response.count} 道）`)
    else if (response?.saved) setResult(`已打开系统另存面板：${response.filename}（${response.count} 道）`)
  }

  const previewRecords = selected.slice(0, 3)
  const previewQuestion = (item, index) => <article className="previewQuestion" key={`q-${item.recordId}`}><header><b>{index + 1}.</b><h2>{item.sourceTitle}</h2></header>{include.source && <em>来源：{item.sourceNotebookTitle}{(item.sourcePathTitles || []).length ? ` › ${(item.sourcePathTitles || []).join(" › ")}` : ""}</em>}{include.question && <div className="previewCardBody">题目卡片正文（标题不重复）</div>}{format === "pdf" && <span className="previewWritingSpace" />}</article>
  const previewAnswer = (item, index) => <article className="previewAnswer" key={`a-${item.recordId}`}><header><b>答案 {index + 1}</b><h2>{item.sourceTitle}</h2></header><div className="previewCardBody">实时匹配答案</div></article>
  const previewItems = include.answer && answerLayout === "questions-first"
    ? [...previewRecords.map(previewQuestion), ...previewRecords.map(previewAnswer)]
    : previewRecords.flatMap((item, index) => [previewQuestion(item, index), ...(include.answer ? [previewAnswer(item, index)] : [])])

  return <section className="exportPage">
    <header className="sectionIntro"><h1>导出错题</h1><p>选择导出范围和内容，并在右侧确认文档结构。</p></header>
    <div className="exportToolbar"><button onClick={onBack}><Icon name="left" /> 返回设置</button><span>{selected.length} 道错题将被导出</span></div>
    {scope === "custom" && <ExportCustomPicker records={exportCandidates} selectedIds={customIds} setSelectedIds={setCustomIds} />}
    <div className="exportLayout">
      <div className="exportOptions">
        <div className="exportBlock"><h2>文件格式</h2><div className="formatChoices">
          <button className={format === "pdf" ? "selected" : ""} onClick={() => setFormat("pdf")}><b>PDF</b><span>本地生成 PDF<br />题目、图片和手写一并导出</span></button>
          <button className={format === "md" ? "selected" : ""} onClick={() => setFormat("md")}><b>MD</b><span>Markdown 压缩包<br />正文与图片分离</span></button>
        </div></div>
        <div className="exportBlock"><h2>导出范围</h2><select value={scope} onChange={event => setScope(event.target.value)}>
          <option value="all">全部错题（{allRecords.length}）</option>
          <option value="filtered">当前筛选结果（{filteredRecords.length}）</option>
          <option value="due">已到期复习（{dueRecords.length}）</option>
          <option value="custom">自定义选择题目</option>
        </select></div>
        <div className="exportBlock"><h2>题目筛选</h2><div className="exportFilterGrid"><label><span>错题等级</span><select value={exportLevel} onChange={event => setExportLevel(event.target.value)}><option value="all">全部等级</option>{levelNames.map((name, level) => <option key={level} value={String(level)}>错题{level}级 · {name}</option>)}</select></label><label><span>学习集 / 脑图</span>{mindMaps.length ? <MindMapMultiSelect options={mindMaps} selectedKeys={effectiveMapKeys} setSelectedKeys={setSelectedMapKeys} title="筛选脑图" /> : <small>暂无脑图</small>}</label></div></div>
        <div className="exportBlock"><h2>包含内容</h2><div className="includeChoices">
          {[["question", "完整原题"], ["answer", "实时匹配答案"], ["source", "来源小字"], ["review", "复习记录"]].map(([key, label]) => <label key={key}><input type="checkbox" checked={include[key]} onChange={() => toggle(key)} /><span>{label}</span></label>)}
        </div></div>
        {format === "pdf" && include.answer && <div className="exportBlock"><h2>题目 / 答案排布</h2><div className="answerLayoutChoices"><button type="button" className={answerLayout === "questions-first" ? "selected" : ""} onClick={() => setAnswerLayout("questions-first")}><strong>题目集中、答案集中</strong><small>题目1 → 题目2 → 答案1 → 答案2</small></button><button type="button" className={answerLayout === "interleaved" ? "selected" : ""} onClick={() => setAnswerLayout("interleaved")}><strong>题目答案交替</strong><small>题目1 → 答案1 → 题目2 → 答案2</small></button></div></div>}
        <div className="exportBlock"><h2>文件名</h2><div className="filenameInput"><input value={filename} onChange={event => setFilename(event.target.value)} /><b>{format === "md" ? ".zip" : ".pdf"}</b></div>{format === "md" && <small className="exportHint">压缩包内包含 UTF-8 Markdown 和 assets 图片目录</small>}</div>
        <button className="exportPrimary" disabled={!selected.length || !Object.values(include).some(Boolean)} onClick={runExport}><Icon name="download" /> {format === "pdf" ? "生成并另存 PDF" : "导出并另存为"}</button>
        {result && <p className="exportResult">{result}</p>}
      </div>
      <div className="exportPreview"><header><span><strong>导出预览</strong><small>{format === "pdf" ? "A4 文档" : "Markdown 文档"}</small></span><b>{selected.length} 道</b></header><div className={`previewPaper ${format}`}>
        <p className="previewMeta">{format === "pdf" ? "A4 · 每题预留书写空白" : "Markdown"} · {formatDate(new Date())}</p>
        {previewItems}
        {selected.length > 3 && <p className="previewMore">其余 {selected.length - 3} 道错题…</p>}
      </div></div>
    </div>
  </section>
}

createRoot(document.getElementById("root")).render(<App />)
