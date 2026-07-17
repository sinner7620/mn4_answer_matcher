import React, { useEffect, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import MNBridge from "./lib/mnBridge"
import "./styles.css"

const levelNames = ["完全不会", "看懂思路", "模仿做对", "查资料做对", "独立做对", "完全掌握"]

function App() {
  const [tab, setTab] = useState("answer")
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [level, setLevel] = useState("all")
  const [candidate, setCandidate] = useState(0)

  async function load() {
    setBusy(true)
    setError("")
    try { setData(await MNBridge.send("dashboard")) }
    catch (reason) { setError(reason.message || String(reason)) }
    finally { setBusy(false) }
  }

  async function action(command, payload, reload = true) {
    setBusy(true)
    setError("")
    try {
      await MNBridge.send(command, payload)
      if (reload) await load()
    } catch (reason) {
      setError(reason.message || String(reason))
      setBusy(false)
    }
  }

  useEffect(() => {
    load()
    window.__onPanelShow = load
    return () => { delete window.__onPanelShow }
  }, [])

  const records = useMemo(() => {
    const items = data?.mistakes?.records || []
    const needle = query.trim().toLocaleLowerCase()
    return items.filter(item =>
      (level === "all" || String(item.level) === level) &&
      (!needle || `${item.sourceTitle} ${item.sourceNotebookTitle} ${(item.categoryPath || []).join(" ")}`.toLocaleLowerCase().includes(needle))
    )
  }, [data, query, level])

  const groups = useMemo(() => records.reduce((map, item) => {
    const key = (item.categoryPath || [item.sourceNotebookTitle, ...(item.sourcePathTitles || [])]).slice(0, 3).join(" › ") || "未分类"
    ;(map[key] ||= []).push(item)
    return map
  }, {}), [records])

  const answer = data?.answer
  const chosen = answer?.candidates?.[Math.min(candidate, Math.max(0, answer.candidates.length - 1))]

  return <div className="shell">
    <aside>
      <div className="brand"><span className="brandMark">M</span><div><strong>答案匹配</strong><small>MN Rails 工作台</small></div></div>
      <nav>
        <button className={tab === "answer" ? "active" : ""} onClick={() => setTab("answer")}><span>⌕</span>答案核对</button>
        <button className={tab === "mistakes" ? "active" : ""} onClick={() => setTab("mistakes")}><span>◇</span>错题整理</button>
        <button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}><span>↻</span>到期复习<b>{data?.mistakes?.dueCount || 0}</b></button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><span>⚙</span>维护</button>
      </nav>
      <div className="version">v{data?.version || "…"}</div>
    </aside>

    <main>
      <header><div><h1>{tab === "answer" ? "答案核对" : tab === "mistakes" ? "错题整理" : tab === "review" ? "到期复习" : "维护与更新"}</h1><p>{tab === "answer" ? "选择题目后，在同一工作台查看完整答案" : data?.mistakes?.notebookTitle}</p></div><button className="iconButton" onClick={load} disabled={busy}>↻</button></header>
      {error && <div className="error">{error}</div>}
      {busy && <div className="loading"><i />正在同步 MarginNote 数据…</div>}

      {tab === "answer" && <section className="answerLayout">
        <div className="questionPane">
          <div className="eyebrow">当前题目</div><h2>{answer?.questionTitle || "尚未选择题目"}</h2>
          <p>{answer?.sourceNotebookTitle}</p>
          {answer?.status === "unbound" && <div className="empty">原题脑图尚未绑定答案脑图。<button onClick={() => action("legacyMenu", null, false)}>打开绑定菜单</button></div>}
          {answer?.status === "not-found" && <div className="empty">没有找到匹配答案。可刷新答案索引后重试。</div>}
          {!!answer?.candidates?.length && <div className="candidateList">{answer.candidates.map((item, index) => <button key={item.id} className={candidate === index ? "selected" : ""} onClick={() => setCandidate(index)}><strong>{item.title}</strong><small>{item.path || answer.answerNotebookTitle}</small></button>)}</div>}
          <button className="primary" onClick={() => action("markMistake")}>标记为错题</button>
        </div>
        <div className="answerPane">{chosen ? <iframe title="答案卡片" srcDoc={chosen.html} /> : <div className="answerEmpty"><span>⌕</span><strong>选中题目后点击右上角刷新</strong><small>也可以继续使用卡片侧边“查找答案”快捷按钮</small></div>}</div>
      </section>}

      {tab === "mistakes" && <section>
        <div className="stats">{[0,1,2,3,4,5].map(value => <button key={value} onClick={() => setLevel(level === String(value) ? "all" : String(value))} className={level === String(value) ? "selected" : ""}><b>{data?.mistakes?.levelCounts?.[value] || 0}</b><span>{value}级</span></button>)}</div>
        <div className="filters"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索题目、脑图或章节"/><button onClick={() => action("repairMistakes")}>修复并整理</button></div>
        <div className="groups">{Object.entries(groups).map(([name, items]) => <div className="group" key={name}><h3>{name}<span>{items.length}</span></h3>{items.map(item => <MistakeRow key={item.mistakeNoteId} item={item} action={action}/>)}</div>)}</div>
      </section>}

      {tab === "review" && <section className="groups">{records.filter(item => new Date(item.nextReviewAt) <= new Date()).length ? records.filter(item => new Date(item.nextReviewAt) <= new Date()).map(item => <MistakeRow key={item.mistakeNoteId} item={item} action={action} review />) : <div className="answerEmpty"><span>✓</span><strong>目前没有到期错题</strong><small>继续保持，新的复习任务会自动出现</small></div>}</section>}

      {tab === "settings" && <section className="settingsCards"><button onClick={() => action("bindMistakeNotebook")}><strong>绑定总错题脑图</strong><span>选择或更换错题集中保存的位置</span></button><button onClick={() => action("repairMistakes")}><strong>修复并整理旧记录</strong><span>补齐分类标签、答案来源与双向链接</span></button><button onClick={() => action("checkUpdates", null, false)}><strong>检查 GitHub 更新</strong><span>通过 OTA 下载并安装新版本</span></button><button onClick={() => action("legacyMenu", null, false)}><strong>打开经典功能菜单</strong><span>答案绑定、索引刷新和解除绑定</span></button></section>}
    </main>
  </div>
}

function MistakeRow({ item, action, review }) {
  return <article className="mistakeRow"><div className={`level level${item.level}`}>{item.level}</div><div className="mistakeInfo"><strong>{item.sourceTitle}</strong><small>{item.sourceNotebookTitle} · 下次 {new Date(item.nextReviewAt).toLocaleDateString()}</small></div>{review ? <select value={item.level} onChange={event => action("reviewMistake", { mistakeNoteId: item.mistakeNoteId, level: Number(event.target.value) })}>{levelNames.map((name, index) => <option key={name} value={index}>{index}级 · {name}</option>)}</select> : <div className="rowActions"><button onClick={() => action("openSource", { mistakeNoteId: item.mistakeNoteId }, false)}>原题</button><button onClick={() => action("openMistake", { mistakeNoteId: item.mistakeNoteId }, false)}>错题</button></div>}</article>
}

createRoot(document.getElementById("root")).render(<App />)
