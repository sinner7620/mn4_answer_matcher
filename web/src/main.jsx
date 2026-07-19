import React, { useEffect, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import MNBridge from "./lib/mnBridge"
import "./styles.css"

const levelNames = ["完全不会", "看懂思路", "模仿做对", "查资料做对", "独立做对", "完全掌握"]

function normalizeSearch(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase()
    .replace(/[\s，,。.;；:：、/\\|()[\]【】{}]+/g, "")
}

function App() {
  const [tab, setTab] = useState("mistakes")
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [level, setLevel] = useState("all")
  const [category, setCategory] = useState("all")
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
      (category === "all" || (item.categoryKeys || []).includes(category)) &&
      (!needle || normalizeSearch(`${item.sourceTitle} ${item.sourceNotebookTitle} ${item.categoryLabel} ${(item.sourcePathTitles || []).join(" ")} ${item.manualCategory || ""}`).includes(needle))
    )
  }, [data, query, level, category])

  const entries = [
    ["mistakes", "◇", "错题浏览", data?.mistakes?.records?.length || 0],
    ["review", "↻", "到期复习", data?.mistakes?.dueCount || 0],
    ["settings", "⚙", "设置"]
  ]

  return <div className="shell">
    <main>
      <header className="topBar">
        <nav className="topNav">{entries.map(([key, icon, name, count]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><span>{icon}</span><strong>{name}</strong>{count > 0 && <b>{count}</b>}</button>)}</nav>
        <div className="topTools"><small>Beta v{data?.version || "…"}</small><button className="iconButton" onClick={load} disabled={busy}>↻</button></div>
      </header>
      <div className="pageHeading"><h1>{tab === "mistakes" ? "错题浏览" : tab === "review" ? "到期复习" : "设置"}</h1><p>{tab === "mistakes" ? "全部错题保留在原脑图中，可分类、核对答案并定位原题" : "跨脑图答案与错题工作台"}</p></div>
      {error && <div className="error">{error}</div>}
      {busy && <div className="loading"><i />正在读取 MarginNote 数据…</div>}

      {tab === "mistakes" && <MistakeBrowser
        records={records}
        allRecords={data?.mistakes?.records || []}
        categories={data?.mistakes?.categories || []}
        query={query} setQuery={setQuery}
        level={level} setLevel={setLevel}
        category={category} setCategory={setCategory}
        selectedId={selectedId}
        detail={detail}
        openDetail={openDetail}
        action={action}
        reloadDetail={() => selectedId && openDetail(selectedId)}
      />}

      {tab === "review" && <section className="reviewList">{(data?.mistakes?.records || []).filter(item => item.noteAvailable && new Date(item.nextReviewAt) <= new Date()).map(item => <MistakeListItem key={item.recordId} item={item} selected={false} onClick={() => { setTab("mistakes"); openDetail(item.recordId) }} />)}{!data?.mistakes?.dueCount && <Empty title="目前没有到期错题" text="新的复习任务会按掌握等级自动出现。" />}</section>}

      {tab === "settings" && <section className="settingsGroups">
        <SettingsGroup title="答案匹配" items={[
          ["⌕", "查看当前卡片答案", "显示当前选中卡片对应的完整答案", () => action("findCurrentAnswer", null, false)],
          ["⇄", "绑定或更换答案脑图", "为当前题目脑图选择对应答案脑图", () => action("bindAnswerNotebook")],
          ["↻", "刷新答案索引", "仅在答案脑图内容变化后手动刷新", () => action("refreshAnswerIndex")],
          ["×", "解除答案绑定", "解除当前题目脑图的答案关联", () => action("unbindAnswerNotebook")]
        ]} />
        <SettingsGroup title="错题管理" items={[
          ["◇", "标记当前卡片错题", "选择 0–5 级后加入错题浏览", () => action("markMistake")],
          ["⌖", "定位当前错题原题", "跳转到当前错题记录的原脑图位置", () => action("openCurrentMistakeSource", null, false)],
          ["▦", "刷新错题分类索引", "重新读取脑图标题、父节点路径和答案绑定", () => action("repairMistakes")]
        ]} />
        <SettingsGroup title="插件" items={[
          ["⇩", "检查插件更新", "检查 GitHub 版本并选择安装或保存", () => action("checkUpdates", null, false)]
        ]} />
      </section>}
    </main>
  </div>
}

function MistakeBrowser(props) {
  const { records, allRecords, categories, selectedId, detail, openDetail, action, reloadDetail } = props
  return <section className="mistakeSection">
    <div className="filterBar">
      <input value={props.query} onChange={event => props.setQuery(event.target.value)} placeholder="搜索题名、脑图、章节或分类" />
      <select value={props.category} onChange={event => props.setCategory(event.target.value)}><option value="all">全部分类</option>{categories.map(item => <option value={item.key} key={item.key}>{`${"　".repeat(item.depth || 0)}${item.name}（${item.count}）`}</option>)}</select>
      <select value={props.level} onChange={event => props.setLevel(event.target.value)}><option value="all">全部等级</option>{levelNames.map((name, index) => <option value={String(index)} key={name}>{index}级 · {name}</option>)}</select>
      <span>{records.length}/{allRecords.length}</span>
    </div>
    <div className="browserGrid">
      <div className="mistakeList">{records.map(item => <MistakeListItem key={item.recordId} item={item} selected={selectedId === item.recordId} onClick={() => openDetail(item.recordId)} />)}{!records.length && <Empty title="没有符合条件的错题" text="清空搜索或筛选条件后重试。" />}</div>
      <div className="detailPane">{detail ? <MistakeDetail detail={detail} action={action} reloadDetail={reloadDetail} /> : <Empty title="选择一道错题" text="右侧将显示完整原题、对应答案、分类和定位操作。" />}</div>
    </div>
  </section>
}

function MistakeListItem({ item, selected, onClick }) {
  return <button className={`mistakeItem ${selected ? "selected" : ""} ${item.noteAvailable ? "" : "unavailable"}`} onClick={onClick}><span className={`level level${item.level}`}>{item.level}</span><span><strong>{item.sourceTitle}</strong><small>{item.categoryLabel}</small><small>{item.sourceNotebookTitle}{item.noteAvailable ? "" : " · 原卡片不可用"}</small></span></button>
}

function MistakeDetail({ detail, action, reloadDetail }) {
  const [view, setView] = useState("question")
  const [answerIndex, setAnswerIndex] = useState(0)
  const [category, setCategory] = useState(detail.record.manualCategory || "")
  useEffect(() => { setCategory(detail.record.manualCategory || ""); setView("question"); setAnswerIndex(0) }, [detail.record.recordId])
  const answer = detail.answers?.[Math.min(answerIndex, Math.max(0, detail.answers.length - 1))]
  async function saveCategory() {
    await action("setMistakeCategory", { recordId: detail.record.recordId, category })
    await reloadDetail()
  }
  async function remove() {
    if (!window.confirm("取消这道错题标记？原卡片不会被删除。")) return
    await action("removeMistake", { recordId: detail.record.recordId })
  }
  return <div className="detail">
    <div className="detailHeader"><div><small>{detail.record.sourceNotebookTitle}</small><h2>{detail.record.sourceTitle}</h2><p>{(detail.record.sourcePathTitles || []).join(" › ") || "脑图根节点"}</p></div><button onClick={() => action("openSource", { recordId: detail.record.recordId }, false)}>定位原题</button></div>
    <div className="detailControls">
      <select value={detail.record.level} onChange={async event => { await action("reviewMistake", { recordId: detail.record.recordId, level: Number(event.target.value) }); await reloadDetail() }}>{levelNames.map((name, index) => <option key={name} value={index}>{index}级 · {name}</option>)}</select>
      <input value={category} onChange={event => setCategory(event.target.value)} placeholder="自定义分类（可留空）" /><button onClick={saveCategory}>保存分类</button><button className="danger" onClick={remove}>取消错题</button>
    </div>
    <div className="detailTabs"><button className={view === "question" ? "active" : ""} onClick={() => setView("question")}>完整原题</button><button className={view === "answer" ? "active" : ""} onClick={() => setView("answer")}>对应答案 {detail.answers?.length ? `(${detail.answers.length})` : ""}</button>{view === "answer" && detail.answers?.length > 1 && <select value={answerIndex} onChange={event => setAnswerIndex(Number(event.target.value))}>{detail.answers.map((item, index) => <option key={item.id} value={index}>{item.title} · {item.path}</option>)}</select>}</div>
    <div className="cardFrame">{view === "question" ? <iframe title="错题原题" srcDoc={detail.questionHtml} /> : answer ? <iframe title="错题答案" srcDoc={answer.html} /> : <Empty title={detail.answerStatus === "unbound" ? "尚未绑定答案脑图" : detail.answerStatus === "index-missing" ? "答案索引尚未建立" : "没有匹配答案"} text="可从经典菜单绑定答案脑图或刷新答案索引。" />}</div>
  </div>
}

function Empty({ title, text }) {
  return <div className="emptyState"><span>⌕</span><strong>{title}</strong><small>{text}</small></div>
}

function SettingsGroup({ title, items }) {
  return <div className="settingsGroup"><h2>{title}</h2><div>{items.map(([icon, name, description, onClick]) => <button key={name} onClick={onClick}><i>{icon}</i><span><strong>{name}</strong><small>{description}</small></span></button>)}</div></div>
}

createRoot(document.getElementById("root")).render(<App />)
