import React, { useEffect, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import MNBridge from "./lib/mnBridge"
import { Icon } from "./icons"
import "./styles.css"
import "./overview.css"
import "./overview-polish.css"
import "./source-chart.css"
import "./icons.css"
import "./reference-theme.css"
import "./review-actions.css"
import "./export.css"

const levelNames = ["未掌握", "已理解", "可完成", "已掌握", "已稳定", "已迁移"]
const levelExplanations = [
  ["完全不会，或看答案仍不理解", "1天后重做"],
  ["能看懂答案，但无法独立完成", "1天后复习"],
  ["能完成，但仍有提示、错误或明显超时", "3天后复习"],
  ["能够独立、正确地完成", "7至14天后复习"],
  ["连续多次正确，并能完成简单变式", "30天后抽查"],
  ["能识别模型、讲清方法并解决变式", "60天后低频抽查"]
]

function levelLabel(level) {
  return `错题${level}级`
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

function sourceInsights(records, limit = 6) {
  const roots = new Map()
  for (const record of records) {
    const storedPath = (record.categoryPath || []).map(part => String(part || "").trim()).filter(Boolean)
    const path = storedPath.length ? storedPath : [record.sourceNotebookTitle || "未命名脑图"]
    let children = roots
    const prefix = []
    for (const part of path) {
      prefix.push(part)
      let node = children.get(part)
      if (!node) {
        node = { key: prefix.join("\u001f"), path: [...prefix], name: part, records: [], children: new Map() }
        children.set(part, node)
      }
      node.records.push(record)
      children = node.children
    }
  }

  // A single-child chain covers exactly the same questions, so use its most
  // specific node. Branches are split from largest to smallest while every
  // question remains in exactly one visible group.
  function collapseSingleChild(node) {
    let current = node
    while (current.children.size === 1) {
      const child = [...current.children.values()][0]
      if (child.records.length !== current.records.length) break
      current = child
    }
    return current
  }

  const selected = [...roots.values()].map(collapseSingleChild)
  while (selected.length < limit) {
    const candidates = selected.map((node, index) => {
      const children = [...node.children.values()].map(collapseSingleChild)
      const fullyCovered = children.reduce((sum, child) => sum + child.records.length, 0) === node.records.length
      const fits = selected.length - 1 + children.length <= limit
      return { node, index, children, eligible: children.length > 1 && fullyCovered && fits }
    }).filter(candidate => candidate.eligible)
      .sort((a, b) => b.node.records.length - a.node.records.length || a.node.path.length - b.node.path.length)
    if (!candidates.length) break
    const candidate = candidates[0]
    selected.splice(candidate.index, 1, ...candidate.children)
  }

  return selected.map(node => ({
    key: node.key,
    path: node.path,
    name: node.name,
    notebook: node.path[0] || "未命名脑图",
    count: node.records.length,
    weak: node.records.filter(record => record.level <= 1).length
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"))
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

  async function load() {
    setBusy(true)
    setError("")
    try {
      const next = await MNBridge.send("dashboard")
      setData(next)
      const records = next?.mistakes?.records || []
      if (selectedId && !records.some(item => item.recordId === selectedId)) {
        setSelectedId("")
        setDetail(null)
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
      if (reload) await load()
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

  const records = useMemo(() => {
    const needle = normalizeSearch(query)
    return (data?.mistakes?.records || []).filter(item =>
      (level === "all" || String(item.level) === level) &&
      (!categoryPath.length || categoryPath.every((part, index) => (item.categoryPath || [])[index] === part)) &&
      (!needle || normalizeSearch(`${item.sourceTitle} ${item.sourceNotebookTitle} ${item.categoryLabel} ${(item.sourcePathTitles || []).join(" ")} ${item.manualCategory || ""}`).includes(needle))
    )
  }, [data, query, level, categoryPath])

  const entries = [
    ["overview", "overview", "错题总览"],
    ["mistakes", "mistakes", "错题浏览", data?.mistakes?.records?.length || 0],
    ["review", "review", "到期复习", data?.mistakes?.dueCount || 0],
    ["settings", "settings", "设置"]
  ]

  return <div className="shell">
    <main>
      <header className="topBar">
        <nav className="topNav">{entries.map(([key, icon, name, count]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><span><Icon name={icon} /></span><strong>{name}</strong>{count > 0 && <b>{count}</b>}</button>)}</nav>
        <div className="topTools"><small>v{data?.version || "…"}</small><button className="iconButton" onClick={load} disabled={busy}><Icon name="refresh" /></button></div>
      </header>
      <div className="pageHeading"><h1>{tab === "overview" ? "错题总览" : tab === "mistakes" ? "错题浏览" : tab === "review" ? "到期复习" : tab === "export" ? "导出错题" : "设置"}</h1><p>{tab === "overview" ? "掌握情况、到期复习和最近错题概览" : tab === "mistakes" ? "全部错题保留在原脑图中，可分类、核对答案并定位原题" : tab === "export" ? "从当前错题记录生成可另存的 PDF 或 Markdown 文件" : "跨脑图答案与错题工作台"}</p></div>
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

      {tab === "settings" && <section className="settingsGroups">
        <SettingsGroup title="答案匹配" items={[
          ["answer", "查看当前卡片答案", "显示当前选中卡片对应的完整答案", () => action("findCurrentAnswer", null, false)],
          ["bind", "绑定或更换答案脑图", "为当前题目脑图选择对应答案脑图", () => action("bindAnswerNotebook")],
          ["refresh", "刷新答案索引", "仅在答案脑图内容变化后手动刷新", () => action("refreshAnswerIndex")],
          ["unlink", "解除答案绑定", "解除当前题目脑图的答案关联", () => action("unbindAnswerNotebook")]
        ]} />
        <SettingsGroup title="错题管理" items={[
          ["mistakes", "标记当前卡片错题", "选择错题0级至错题5级后加入错题浏览", () => action("markMistake")],
          ["locate", "定位当前错题原题", "跳转到当前错题记录的原脑图位置", () => action("openCurrentMistakeSource", null, false)],
          ["organize", "刷新错题分类索引", "重新读取脑图标题、父节点路径和答案绑定", () => action("repairMistakes")],
          ["download", "导出错题", "选择 PDF 或 Markdown 格式并预览导出", openExport]
        ]} />
        <MistakeLevelGuide />
        <SettingsGroup title="插件" items={[
          ["info", "当前版本", `v${data?.version || "…"}`, () => action("notify", { message: `当前版本 v${data?.version || "…"}` }, false)],
          ["reset", "重置窗口位置与大小", "将工作台恢复到屏幕左上方的默认尺寸", () => action("resetPanelFrame", null, false)],
          ["download", "检查插件更新", "检查 GitHub 版本并选择安装或保存", () => action("checkUpdates", null, false)]
        ]} />
      </section>}
    </main>
  </div>
}

function MistakeBrowser(props) {
  const { records, allRecords, selectedId, detail, openDetail, action, reloadDetail, onRemoved } = props
  return <section className="mistakeSection">
    <div className="filterBar">
      <input value={props.query} onChange={event => props.setQuery(event.target.value)} placeholder="搜索题名、脑图、章节或分类" />
      <CategoryCascade records={allRecords} path={props.categoryPath} setPath={props.setCategoryPath} />
      <select value={props.level} onChange={event => props.setLevel(event.target.value)}><option value="all">全部分类</option>{levelNames.map((name, index) => <option value={String(index)} key={name}>{levelLabel(index)} · {name}</option>)}</select>
      <span>{records.length}/{allRecords.length}</span>
    </div>
    <div className="browserGrid">
      <div className="mistakeList">{records.map(item => <MistakeListItem key={item.recordId} item={item} selected={selectedId === item.recordId} onClick={() => openDetail(item.recordId)} />)}{!records.length && <Empty title="没有符合条件的错题" text="清空搜索或筛选条件后重试。" />}</div>
      <div className="detailPane">{detail ? <MistakeDetail detail={detail} action={action} reloadDetail={reloadDetail} onRemoved={onRemoved} /> : <Empty title="选择一道错题" text="右侧将显示完整原题、对应答案、分类和定位操作。" />}</div>
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

function MistakeOverview({ records, onBrowse, onOpen, onSource }) {
  const now = Date.now()
  const due = records.filter(item => new Date(item.nextReviewAt).getTime() <= now).length
  const weak = records.filter(item => item.level <= 1).length
  const mastered = records.filter(item => item.level === 5).length
  const recentCount = records.filter(item => now - new Date(item.createdAt).getTime() <= 7 * 86400000).length
  const notebooks = new Set(records.map(item => item.sourceNotebookId)).size
  const levelCounts = levelNames.map((_, level) => records.filter(item => item.level === level).length)
  const maxLevelCount = Math.max(1, ...levelCounts)
  const recent = [...records].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5)
  const sources = sourceInsights(records)
  const sourceColors = ["#0f172a", "#657c68", "#c4a16b", "#df806e", "#64748b", "#8b7b86", "#94a3b8"]
  const topSources = sources.slice(0, 6)
  const otherCount = sources.slice(6).reduce((sum, source) => sum + source.count, 0)
  const chartSources = [...topSources, ...(otherCount ? [{ key: "other", name: "其他来源", notebook: `${sources.length - 6} 个父节点`, count: otherCount, weak: 0 }] : [])]
  let sourceOffset = 0
  const sourceGradient = chartSources.length ? chartSources.map((source, index) => {
    const start = sourceOffset
    sourceOffset += source.count / Math.max(1, records.length) * 100
    return `${sourceColors[index]} ${start}% ${sourceOffset}%`
  }).join(",") : "#e9edf5 0 100%"
  const mastery = records.length ? Math.round(mastered / records.length * 100) : 0
  const cards = [
    ["total", "错题总数", records.length, `${notebooks} 个脑图`],
    ["due", "今日到期", due, due ? "建议优先复习" : "当前已清空"],
    ["weak", "薄弱错题", weak, "错题0–1级"],
    ["mastered", "已迁移", mastered, "错题5级"],
    ["added", "近 7 天新增", recentCount, "持续积累"],
  ]
  return <section className="overviewPage">
    <div className="overviewHero"><div><span className="overviewKicker">学习概览</span><strong>错题本学习进度</strong><small>{due ? `有 ${due} 道错题已经到期，建议从薄弱状态开始复习` : "当前没有到期任务"}</small></div><div className="masteryRing" style={{ "--progress": `${mastery * 3.6}deg` }}><span><strong>{mastery}%</strong><small>已迁移</small></span></div></div>
    <div className="overviewCards">{cards.map(([icon, label, value, note], index) => <div className={`overviewCard tone${index}`} key={label}><i><Icon name={icon} /></i><span><small>{label}</small><strong>{value}</strong><em>{note}</em></span></div>)}</div>
    <div className="overviewPanel sourcePanel"><header><div><strong>错题来源分布</strong><small>按数量自适应选择覆盖最完整的父节点，点击条目即可筛选</small></div><b>{sources.length} 个覆盖节点</b></header>{sources.length ? <div className="sourceChart"><div className="sourceDonut" style={{ background: `conic-gradient(${sourceGradient})` }}><span><strong>{records.length}</strong><small>全部错题</small></span></div><div className="sourceBars">{chartSources.map((source, index) => {
      const percent = Math.round(source.count / Math.max(1, records.length) * 100)
      return <button key={source.key} disabled={!source.path} onClick={() => source.path && onSource(source.path)}><i style={{ background: sourceColors[index] }} /><span><strong>{source.name}</strong><small>{source.notebook}{source.weak ? ` · ${source.weak} 道薄弱` : ""}</small><em><b style={{ width: `${percent}%`, background: sourceColors[index] }} /></em></span><b>{source.count}<small>{percent}%</small></b></button>
    })}</div></div> : <Empty title="暂无来源数据" text="标记错题后会根据父节点自动分析。" />}</div>
    <div className="overviewGrid">
      <div className="overviewPanel"><header><strong>错题分类分布</strong><small>错题0级最薄弱，错题5级为已迁移</small></header><div className="levelChart">{levelCounts.map((count, level) => <div className="levelRow" key={level}><span>{level}级</span><div><i className={`levelBar level${level}`} style={{ width: `${Math.max(count ? 8 : 0, count / maxLevelCount * 100)}%` }} /></div><b>{count}</b></div>)}</div></div>
      <div className="overviewPanel recentPanel"><header><strong>最近添加</strong><button onClick={onBrowse}>浏览全部</button></header><div>{recent.map(item => <button className="recentItem" key={item.recordId} onClick={() => onOpen(item.recordId)}><span className={`level level${item.level}`}>{item.level}级</span><span><strong>{item.sourceTitle}</strong><small>{formatDate(item.createdAt)} · {reviewCountdown(item.nextReviewAt)}</small></span><b><Icon name="right" /></b></button>)}{!recent.length && <Empty title="还没有错题" text="从卡片侧边标记第一道错题。" />}</div></div>
    </div>
  </section>
}

function MistakeListItem({ item, selected, onClick }) {
  return <button className={`mistakeItem ${selected ? "selected" : ""} ${item.noteAvailable ? "" : "unavailable"}`} onClick={onClick}><span className={`level level${item.level}`}>{item.level}级</span><span><strong>{item.sourceTitle}</strong><small>{item.categoryLabel}</small><small>添加 {formatDate(item.createdAt)} · {reviewCountdown(item.nextReviewAt)}</small><small>{item.sourceNotebookTitle}{item.noteAvailable ? "" : " · 原卡片不可用"}</small></span></button>
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

  if (!records.length) return <section className="reviewList"><Empty title="目前没有到期错题" text="新的复习任务会按掌握状态自动出现。" /></section>
  return <section className="reviewList">
    <div className="reviewIntro"><strong>到期错题 {records.length} 道</strong><small>先跳转原题作答，需要时查看实时答案，最后选择状态并完成标记。</small></div>
    {records.map(item => {
      const expanded = answerDetail?.record?.recordId === item.recordId
      const answer = expanded ? answerDetail.answers?.[Math.min(answerIndex, Math.max(0, answerDetail.answers.length - 1))] : null
      return <article className="dueReviewItem" key={item.recordId}>
        <div className="dueReviewSummary">
          <span className={`level level${item.level}`}>{item.level}级</span>
          <span><strong>{item.sourceTitle}</strong><small>{item.categoryLabel} · {item.sourceNotebookTitle}</small><small>{levelNames[item.level]} · {reviewCountdown(item.nextReviewAt)}</small></span>
        </div>
        <div className="dueReviewActions">
          <button onClick={() => action("openSource", { recordId: item.recordId }, false)}>跳转原题</button>
          <button className={expanded ? "active" : ""} onClick={() => toggleAnswer(item.recordId)}>{expanded ? "收起答案" : "查看答案"}</button>
          <select value={statusById[item.recordId] ?? String(item.level)} onChange={event => setStatusById({ ...statusById, [item.recordId]: event.target.value })}>
            {levelNames.map((name, level) => <option value={level} key={name}>{levelLabel(level)} · {name}</option>)}
          </select>
          <button className="complete" onClick={() => complete(item)}>完成标记</button>
        </div>
        {expanded && <div className="dueAnswer">
          {answerDetail.answers?.length > 1 && <select value={answerIndex} onChange={event => setAnswerIndex(Number(event.target.value))}>{answerDetail.answers.map((candidate, index) => <option value={index} key={candidate.id}>{candidate.title} · {candidate.path}</option>)}</select>}
          {answer ? <iframe title={`${item.sourceTitle}答案`} srcDoc={answer.html} /> : <Empty title={answerDetail.answerStatus === "unbound" ? "来源脑图尚未绑定答案" : "没有匹配到答案"} text="答案按原题脑图当前绑定实时查询。" />}
        </div>}
      </article>
    })}
  </section>
}

function MistakeDetail({ detail, action, reloadDetail, onRemoved }) {
  const [view, setView] = useState("question")
  const [answerIndex, setAnswerIndex] = useState(0)
  const [category, setCategory] = useState(detail.record.manualCategory || "")
  const [removeArmed, setRemoveArmed] = useState(false)
  useEffect(() => { setCategory(detail.record.manualCategory || ""); setView("question"); setAnswerIndex(0); setRemoveArmed(false) }, [detail.record.recordId])
  const answer = detail.answers?.[Math.min(answerIndex, Math.max(0, detail.answers.length - 1))]
  async function saveCategory() {
    await action("setMistakeCategory", { recordId: detail.record.recordId, category })
    await reloadDetail()
  }
  async function remove() {
    if (!removeArmed) return setRemoveArmed(true)
    const result = await action("removeMistake", { recordId: detail.record.recordId })
    if (result?.removed) onRemoved()
  }
  return <div className="detail">
    <div className="detailHeader"><div><small>{detail.record.sourceNotebookTitle}</small><h2>{detail.record.sourceTitle}</h2><p>{(detail.record.sourcePathTitles || []).join(" › ") || "脑图根节点"}</p><small>添加于 {formatDate(detail.record.createdAt)} · {reviewCountdown(detail.record.nextReviewAt)}</small></div><button onClick={() => action("openSource", { recordId: detail.record.recordId }, false)}>定位原题</button></div>
    <div className="detailControls">
      <select value={detail.record.level} onChange={async event => { await action("reviewMistake", { recordId: detail.record.recordId, level: Number(event.target.value) }); await reloadDetail() }}>{levelNames.map((name, index) => <option key={name} value={index}>{levelLabel(index)} · {name}</option>)}</select>
      <input value={category} onChange={event => setCategory(event.target.value)} placeholder="自定义分类（可留空）" /><button onClick={saveCategory}>保存分类</button><button className="danger" onClick={remove}>{removeArmed ? "再次确认" : "取消错题"}</button>
    </div>
    <div className="detailTabs"><button className={view === "question" ? "active" : ""} onClick={() => setView("question")}>完整原题</button><button className={view === "answer" ? "active" : ""} onClick={() => setView("answer")}>对应答案 {detail.answers?.length ? `(${detail.answers.length})` : ""}</button>{view === "answer" && detail.answers?.length > 1 && <select value={answerIndex} onChange={event => setAnswerIndex(Number(event.target.value))}>{detail.answers.map((item, index) => <option key={item.id} value={index}>{item.title} · {item.path}</option>)}</select>}</div>
    <div className="cardFrame">{view === "question" ? <iframe title="错题原题" srcDoc={detail.questionHtml} /> : answer ? <iframe title="错题答案" srcDoc={answer.html} /> : <Empty title={detail.answerStatus === "unbound" ? "尚未绑定答案脑图" : detail.answerStatus === "index-missing" ? "答案索引尚未建立" : "没有匹配答案"} text="可从经典菜单绑定答案脑图或刷新答案索引。" />}</div>
  </div>
}

function Empty({ title, text }) {
  return <div className="emptyState"><span><Icon name="search" /></span><strong>{title}</strong><small>{text}</small></div>
}

function SettingsGroup({ title, items }) {
  return <div className="settingsGroup"><h2>{title}</h2><div>{items.map(([icon, name, description, onClick]) => <button key={name} onClick={onClick}><i><Icon name={icon} /></i><span><strong>{name}</strong><small>{description}</small></span></button>)}</div></div>
}

function MistakeLevelGuide() {
  return <section className="mistakeLevelGuide">
    <header><h2>错题分类说明</h2><p>分类表示当前掌握程度；复习完成后选择新的级别，系统自动安排下次复习。</p></header>
    <div>{levelNames.map((name, level) => <article key={name}>
      <span className={`level level${level}`}>{level}级</span>
      <span><strong>{levelLabel(level)} · {name}</strong><small>{levelExplanations[level][0]}</small></span>
      <em>{levelExplanations[level][1]}</em>
    </article>)}</div>
  </section>
}

function MistakeExport({ allRecords, filteredRecords, action, onBack }) {
  const [format, setFormat] = useState("pdf")
  const [scope, setScope] = useState("all")
  const [filename, setFilename] = useState(`MN4错题导出-${new Date().toISOString().slice(0, 10)}`)
  const [include, setInclude] = useState({ question: true, answer: true, source: true, review: true })
  const [result, setResult] = useState("")
  const dueRecords = useMemo(() => allRecords.filter(item => item.noteAvailable && new Date(item.nextReviewAt).getTime() <= Date.now()), [allRecords])
  const selected = scope === "due" ? dueRecords : scope === "filtered" ? filteredRecords : allRecords
  const toggle = key => setInclude(current => ({ ...current, [key]: !current[key] }))

  async function runExport() {
    setResult("")
    const response = await action("exportMistakes", {
      format,
      filename,
      recordIds: selected.map(item => item.recordId),
      include
    }, false)
    if (response?.saved) setResult(`已打开系统另存面板：${response.filename}（${response.count} 道）`)
    if (response?.printPanel) setResult(`系统打印面板已打开；请在预览中选择分享并“存储到文件”（${response.count} 道）`)
  }

  return <section className="exportPage">
    <div className="exportToolbar"><button onClick={onBack}><Icon name="left" /> 返回设置</button><span>{selected.length} 道错题将被导出</span></div>
    <div className="exportLayout">
      <div className="exportOptions">
        <div className="exportBlock"><h2>文件格式</h2><div className="formatChoices">
          <button className={format === "pdf" ? "selected" : ""} onClick={() => setFormat("pdf")}><b>PDF</b><span>系统打印预览<br />可分享或存储到文件</span></button>
          <button className={format === "md" ? "selected" : ""} onClick={() => setFormat("md")}><b>MD</b><span>Markdown 压缩包<br />正文与图片分离</span></button>
        </div></div>
        <div className="exportBlock"><h2>导出范围</h2><select value={scope} onChange={event => setScope(event.target.value)}>
          <option value="all">全部错题（{allRecords.length}）</option>
          <option value="filtered">当前筛选结果（{filteredRecords.length}）</option>
          <option value="due">已到期复习（{dueRecords.length}）</option>
        </select></div>
        <div className="exportBlock"><h2>包含内容</h2><div className="includeChoices">
          {[["question", "完整原题"], ["answer", "实时匹配答案"], ["source", "来源与卡片 ID"], ["review", "复习记录"]].map(([key, label]) => <label key={key}><input type="checkbox" checked={include[key]} onChange={() => toggle(key)} /><span>{label}</span></label>)}
        </div></div>
        <div className="exportBlock"><h2>文件名</h2><div className="filenameInput"><input value={filename} onChange={event => setFilename(event.target.value)} /><b>{format === "md" ? ".zip" : ".pdf"}</b></div>{format === "md" && <small className="exportHint">压缩包内包含 UTF-8 Markdown 和 assets 图片目录</small>}</div>
        <button className="exportPrimary" disabled={!selected.length || !Object.values(include).some(Boolean)} onClick={runExport}><Icon name="download" /> {format === "pdf" ? "生成 PDF 并打开打印面板" : "导出并另存为"}</button>
        {result && <p className="exportResult">{result}</p>}
      </div>
      <div className="exportPreview"><header><span><strong>导出预览</strong><small>{format === "pdf" ? "A4 文档" : "Markdown 文档"}</small></span><b>{selected.length} 道</b></header><div className={`previewPaper ${format}`}>
        <h1>MN4 错题导出</h1><p>导出时间：{formatDate(new Date())}</p>
        {selected.slice(0, 3).map((item, index) => <article key={item.recordId}><small>错题 {index + 1}</small><h2>{item.sourceTitle}</h2><p>错题{item.level}级 · {levelNames[item.level]}　｜　{item.categoryLabel}</p>{include.source && <em>{item.sourceNotebookTitle} › {(item.sourcePathTitles || []).join(" › ")}</em>}{include.question && <div>完整原题卡片（含摘录、图片、评论和手写）</div>}{include.answer && <div>从原答案脑图实时匹配的完整答案</div>}</article>)}
        {selected.length > 3 && <p className="previewMore">其余 {selected.length - 3} 道错题…</p>}
      </div></div>
    </div>
  </section>
}

createRoot(document.getElementById("root")).render(<App />)
