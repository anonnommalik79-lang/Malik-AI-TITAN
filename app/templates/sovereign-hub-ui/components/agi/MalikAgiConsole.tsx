"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import {
  Activity, ArrowLeft, ArrowUpRight, CheckCircle2, ChevronDown, Circle,
  CircleAlert, Clock3, Code2, Download, FileCode2, FileText, LoaderCircle,
  Play, ShieldCheck, Square, Terminal, Workflow,
} from "lucide-react"
import type { AgentStage, MalikAgiResult, MalikAgiRole } from "@/lib/agi/mission-engine"
import "./agi-console.css"

const defaultPrompt = "Создай Node.js CLI для анализа CSV: чтение и проверка файла, статистика числовых столбцов, обработка пустых данных, понятные ошибки и полноценные node:test тесты."
const agentRoles: Array<{ id: MalikAgiRole; title: string; subtitle: string }> = [
  { id: "analyst", title: "Аналитик", subtitle: "Требования и критерии приёмки" },
  { id: "architect", title: "Архитектор", subtitle: "Архитектура и план" },
  { id: "builder", title: "Разработчик", subtitle: "Файлы, исправления, исполнение" },
  { id: "verifier", title: "Проверяющий", subtitle: "Независимое ревью" },
]
type Phase = "idle" | "running" | "complete" | "failed"

function checkText(value: "pass" | "fail" | "not_run" | undefined) {
  return value === "pass" ? "PASS · проверено" : value === "fail" ? "FAIL · ошибка" : "NOT RUN · не проверено"
}
function statusText(value: AgentStage["status"] | undefined) {
  return value === "done" ? "Завершён" : value === "failed" ? "Ошибка" : value === "blocked" ? "Требуется проверка" : "Ожидает"
}
function saveJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
function saveSource(name: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name.split("/").at(-1) || "source.txt"
  a.click()
  URL.revokeObjectURL(url)
}

export default function MalikAgiConsole() {
  const [prompt, setPrompt] = useState(defaultPrompt)
  const [phase, setPhase] = useState<Phase>("idle")
  const [active, setActive] = useState<MalikAgiRole | null>(null)
  const [stages, setStages] = useState<AgentStage[]>([])
  const [result, setResult] = useState<MalikAgiResult | null>(null)
  const [error, setError] = useState("")
  const [selectedFile, setSelectedFile] = useState("")
  const [openStage, setOpenStage] = useState<MalikAgiRole | null>(null)
  const [pane, setPane] = useState<"files" | "review">("files")
  const [startedAt, setStartedAt] = useState("")
  const abortRef = useRef<AbortController | null>(null)

  const files = result?.evidence?.files || []
  const selected = files.find(file => file.path === selectedFile) || files[0]
  const verified = result?.status === "verified"
  const inspect = (event: string, data: Record<string, unknown>) => {
    if (event === "ready") { setStartedAt(String(data.acceptedAt || "")); return }
    if (event === "stage-start") { setActive(data.role as MalikAgiRole); setOpenStage(data.role as MalikAgiRole); return }
    if (event === "stage") {
      const stage = data as unknown as AgentStage
      setStages(previous => [...previous.filter(item => item.role !== stage.role), stage])
      setActive(null)
      return
    }
    if (event === "done") {
      const record = data as unknown as MalikAgiResult
      setResult(record)
      setStages(record.stages)
      setActive(null)
      setPhase("complete")
      setSelectedFile(record.evidence?.files[0]?.path || "")
      setOpenStage(null)
      return
    }
    if (event === "error") {
      setError(String(data.message || data.code || "Не удалось выполнить задачу"))
      setPhase("failed")
      setActive(null)
    }
  }

  const run = async () => {
    if (phase === "running") return
    const controller = new AbortController()
    abortRef.current = controller
    setPhase("running")
    setStages([])
    setActive(null)
    setResult(null)
    setError("")
    setSelectedFile("")
    setStartedAt("")
    setOpenStage(null)
    try {
      const response = await fetch("/api/agi", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      })
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}))
        throw new Error(String(problem.message || problem.code || "Ошибка сервиса"))
      }
      if (!response.body) throw new Error("Сервер не предоставил поток событий")
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = ""
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        pending += decoder.decode(chunk.value, { stream: true }).replace(/\r/g, "")
        for (;;) {
          const divider = pending.indexOf("\n\n")
          if (divider < 0) break
          const block = pending.slice(0, divider)
          pending = pending.slice(divider + 2)
          const event = block.split("\n").find(line => line.startsWith("event:"))?.slice(6).trim()
          const data = block.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n")
          if (!event || !data) continue
          try { inspect(event, JSON.parse(data) as Record<string, unknown>) }
          catch { /* A malformed event must not forge a successful result. */ }
        }
      }
      // This is an error unless a genuine done event changed phase.
      setPhase(current => current === "running" ? "failed" : current)
      setError(current => current || "Поток закончился без подтверждённого финального результата.")
    } catch (cause) {
      setError(controller.signal.aborted ? "Выполнение остановлено пользователем." : cause instanceof Error ? cause.message : "Ошибка выполнения")
      setPhase("failed")
      setActive(null)
    } finally {
      abortRef.current = null
    }
  }
  const cancel = () => abortRef.current?.abort()

  return (
    <div className="agi-shell">
      <aside className="agi-sidebar">
        <Link href="/dashboard" className="agi-brand"><span className="agi-mark">M</span><span><strong>MALIK AI</strong><small>v6.5 TITAN</small></span></Link>
        <nav aria-label="Навигация">
          <Link href="/dashboard"><ArrowLeft size={16} /> Вернуться в чат</Link>
          <div className="agi-nav-active"><Workflow size={16} /> AGI Orchestrator <span>BETA</span></div>
        </nav>
        <div className="agi-side-spacer" />
        <div className="agi-disclosure"><ShieldCheck size={17} /><span>Исследовательский прототип. Статус общего AGI не подтверждён.</span></div>
      </aside>

      <main className="agi-main">
        <header className="agi-topbar">
          <div><p className="agi-overline">SOVEREIGN HUB / EXPERIMENTAL SYSTEM</p><h1>MALIK AGI <span>ORCHESTRATOR</span></h1><p className="agi-muted">Четыре агента · реальные инструменты · проверяемые артефакты</p></div>
          <div className="agi-top-actions"><span className="agi-pill"><Activity size={14}/>{phase === "running" ? "Выполняется" : phase === "complete" ? "Выполнение завершено" : "Ожидает задачу"}</span><span className="agi-pill">Node.js CLI beta</span></div>
        </header>

        <div className="agi-body">
          <section className="agi-workspace">
            <div className="agi-section-heading"><div><p className="agi-overline">EXECUTION PIPELINE</p><h2>Реальная работа агентов</h2></div><span className="agi-muted">Никаких демонстрационных PASS</span></div>
            <div className="agi-progress" aria-label="Этапы работы">
              {agentRoles.map((role, index) => {
                const step = stages.find(item => item.role === role.id)
                return <div key={role.id} className="agi-progress-step"><span className={"agi-step-circle " + (step?.status === "done" ? "passed" : step?.status === "failed" || step?.status === "blocked" ? "problem" : active === role.id ? "in-progress" : "")}>{step?.status === "done" ? <CheckCircle2 size={16}/> : index + 1}</span><span>{role.title}</span></div>
              })}
            </div>
            <div className="agi-agent-grid">
              {agentRoles.map((role, index) => {
                const step = stages.find(item => item.role === role.id)
                const working = active === role.id && !step
                const expanded = openStage === role.id
                return <article className="agi-agent" key={role.id}>
                  <div className="agi-agent-head">
                    <span className="agi-agent-num">{String(index + 1).padStart(2, "0")}</span>
                    <div><h3>{role.title}</h3><p>{role.subtitle}</p></div>
                    <span className={"agi-stage-status " + (step?.status || (working ? "running" : ""))}>{working ? <><LoaderCircle size={14} className="agi-spin"/> Работа</> : statusText(step?.status)}</span>
                  </div>
                  <div className="agi-agent-body">
                    {step ? <><p className="agi-duration"><Clock3 size={13}/> {(step.durationMs / 1000).toFixed(1)} сек · ответ агента</p><button className="agi-expand" onClick={() => setOpenStage(expanded ? null : role.id)}>{expanded ? "Свернуть отчёт" : "Посмотреть полный отчёт"} <ChevronDown size={15}/></button>{expanded && <pre className="agi-report">{step.report}</pre>}</> : <p className="agi-empty">{working ? "Вызов модели или инструмента запущен. Ожидаются реальные результаты." : "Этот этап ещё не запускался."}</p>}
                  </div>
                </article>
              })}
            </div>

            <div className="agi-double">
              <section className="agi-panel">
                <div className="agi-panel-head"><h3><FileCode2 size={17}/> Созданные файлы</h3><span>{files.length ? files.length + " файлов" : "Ожидаем артефакты"}</span></div>
                {files.length ? <div className="agi-file-list">{files.map(file => <button key={file.path} onClick={() => {setSelectedFile(file.path); setPane("files")}} className={selected?.path === file.path ? "selected" : ""}><FileText size={14}/>{file.path}</button>)}</div> : <div className="agi-blank">Файлы появятся только после реальной работы сборщика.</div>}
              </section>
              <section className="agi-panel">
                <div className="agi-panel-head"><h3><Terminal size={17}/> Исходный код и ревью</h3><div className="agi-inline-actions"><button onClick={() => setPane("files")} className={pane === "files" ? "current" : ""}>Код</button><button onClick={() => setPane("review")} className={pane === "review" ? "current" : ""}>Ревью</button></div></div>
                <div className="agi-code-pane">{pane === "files" ? (selected ? <><div className="agi-code-title"><code>{selected.path}</code><button onClick={() => saveSource(selected.path, selected.content)}><Download size={14}/> Файл</button></div><pre>{selected.content}</pre></> : <p>Нет созданных файлов.</p>) : <pre>{stages.find(step => step.role === "verifier")?.report || "Отчёт проверяющего пока отсутствует."}</pre>}</div>
              </section>
            </div>
            <section className="agi-panel agi-summary">
              <div className="agi-panel-head"><h3><ShieldCheck size={17}/> Проверки и финальный результат</h3>{result && <span className={"agi-result-status " + (verified ? "success" : "caution")}>{verified ? "Проверено в ограниченном объёме" : result.status === "failed" ? "Не выполнено" : "Требуется проверка"}</span>}</div>
              {!result ? <div className="agi-blank">Здесь появятся реальные статусы статической проверки и изолированных Node-тестов. До запуска они не отмечаются как пройденные.</div> : <><div className="agi-proof-grid">
                <div><span>Статическая проверка</span><strong>{checkText(result.evidence?.staticCheck)}</strong></div>
                <div><span>Изолированный node --test</span><strong>{checkText(result.evidence?.unitCheck)}</strong></div>
                <div><span>Вердикт ревьюера</span><strong>{result.criticalVerdict.toUpperCase()}</strong></div>
                <div><span>Время выполнения</span><strong>{(result.durationMs / 1000).toFixed(1)} сек</strong></div>
              </div><p className="agi-note">{result.note}</p>
                {Boolean(result.evidence?.details.length) && <details className="agi-details"><summary>Ошибки, ограничения и слепые зоны</summary><ul>{result.evidence?.details.map((line, index) => <li key={index}>{line}</li>)}</ul></details>}
                <div className="agi-actions"><button onClick={() => saveJson("malik-agi-proof-" + result.runId + ".json", result)}><Download size={16}/> Скачать полный отчёт JSON</button><button onClick={() => saveJson("malik-agi-files-" + result.runId + ".json", result.evidence?.files || [])}><Code2 size={16}/> Экспорт исходных файлов JSON</button></div>
              </>}
            </section>
          </section>

          <aside className="agi-rail">
            <section className="agi-panel agi-prompt-panel">
              <div className="agi-panel-head"><h3>Твой запрос</h3><span>Только CLI · BETA</span></div>
              <label htmlFor="agi-prompt" className="agi-sr">Техническая задача для четырёх агентов</label>
              <textarea id="agi-prompt" value={prompt} disabled={phase === "running"} onChange={event => setPrompt(event.target.value)} rows={13} maxLength={4000} spellCheck={false}/>
              <div className="agi-prompt-footer"><span>{prompt.length}/4000</span>{phase === "running" ? <button className="agi-cta stop" onClick={cancel}><Square size={16}/> Остановить</button> : <button className="agi-cta" onClick={() => void run()} disabled={prompt.trim().length < 20}><Play size={16}/> Запустить 4 агентов</button>}</div>
            </section>
            <section className="agi-panel agi-final-panel">
              <div className="agi-panel-head"><h3>Финальный отчёт</h3><span>{phase === "running" ? "В процессе" : phase === "complete" ? "Получен" : "Не создан"}</span></div>
              {phase === "failed" ? <p className="agi-error"><CircleAlert size={17}/>{error || "Выполнение прервано."}</p> :
              phase === "running" ? <div className="agi-final-placeholder"><LoaderCircle size={25} className="agi-spin"/><strong>Агенты выполняют задачу</strong><p>Будут показаны только результаты, полученные от сервера.</p>{startedAt && <small>Старт: {new Date(startedAt).toLocaleTimeString("ru-RU")}</small>}</div> :
              result ? <div className="agi-final-content">
                <h4>{result.evidence?.title || "Миссия не завершена"}</h4>
                <p>{result.note}</p>
                <div><span>Проект</span><strong>{result.evidence?.projectId || "Нет"}</strong></div>
                <div><span>Реальные файлы</span><strong>{result.evidence?.files.length ?? 0}</strong></div>
                <div><span>Итерации сборки</span><strong>{result.evidence?.rounds ?? 0}</strong></div>
                <div><span>Статус</span><strong>{result.status}</strong></div>
                <div><span>Поставщик модели</span><strong>{result.evidence?.provenance?.provider || "Не указан"}</strong></div>
                <div><span>Область проверки</span><strong>Node.js CLI</strong></div>
                <button onClick={() => saveJson("malik-agi-report.json", result)}><Download size={15}/> Экспорт результата</button>
              </div> : <div className="agi-final-placeholder"><Circle size={24}/><strong>Результат ещё не получен</strong><p>После запуска здесь появятся проверяемые файлы, журнал и итоговая оценка.</p></div>}
            </section>
            <div className="agi-footnote"><ArrowUpRight size={14}/> Комплексная интеллектуальная система. Прототип не является доказанным AGI.</div>
          </aside>
        </div>
      </main>
    </div>
  )
}
