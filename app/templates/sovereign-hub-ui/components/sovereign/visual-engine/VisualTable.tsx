"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search, Table2 } from "lucide-react"
import type { TableBlock } from "@/lib/visual/schema"
import { formatCurrency, formatNumber, formatPercent } from "@/lib/visual/format"
import { Fullscreen, VisualCard, csvCell, download, fileName, useToast, useVisualField } from "./shared"

type Cell = string | number | null
type Sort = { column: number; direction: "asc" | "desc" } | null
const isSort = (value: unknown): value is Sort => value === null || Boolean(value && typeof value === "object"
  && Number.isInteger((value as { column: unknown }).column) && ["asc", "desc"].includes((value as { direction: string }).direction))
const isFilters = (value: unknown): value is Record<string, string> => Boolean(value && typeof value === "object" && !Array.isArray(value)
  && Object.values(value as object).every((item) => typeof item === "string"))

/** Cells show the number; the unit sits once, in the column header. */
function display(value: Cell, column: TableBlock["columns"][number], digits?: number) {
  if (value === null) return "—"
  if (typeof value === "string") return value
  if (column.kind === "percent") return formatPercent(value)
  if (column.kind === "currency") return formatCurrency(value, column.currency || "USD", digits)
  return formatNumber(value)
}

function compare(a: Cell, b: Cell) {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a).localeCompare(String(b), "ru", { numeric: true, sensitivity: "base" })
}

function TableBody({ block, storeKey, persist, big }: { block: TableBlock; storeKey: string; persist: boolean; big?: boolean }) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useVisualField<Sort>(storeKey, persist, "sort", null, isSort)
  const [filters, setFilters] = useVisualField<Record<string, string>>(storeKey, persist, "filters", {}, isFilters)
  const [page, setPage] = useState(0)
  const [toast, say] = useToast()
  const pageSize = big ? 50 : block.pageSize || 10
  const numeric = block.columns.map((column) => column.kind !== "text" && column.kind !== "date")
  // One decimal style per money column: $2.00 beside $2.50, never $2 beside $2.50.
  const digits = useMemo(() => block.columns.map((column, at) => column.kind === "currency"
    ? (block.rows.some((row) => typeof row[at] === "number" && !Number.isInteger(row[at]) && Math.abs(row[at] as number) < 100) ? 2 : 0)
    : undefined), [block])

  // Text columns with a handful of distinct values become filters.
  const filterable = useMemo(() => block.columns.map((column, at) => {
    if (numeric[at]) return null
    const values = [...new Set(block.rows.map((row) => row[at]).filter((value): value is string => typeof value === "string" && value.length > 0))]
    return values.length >= 2 && values.length <= 12 && values.length < block.rows.length ? values.sort((a, b) => a.localeCompare(b, "ru")) : null
  }).map((values, at) => (values ? { at, values } : null)).filter(Boolean).slice(0, 2) as Array<{ at: number; values: string[] }>, [block, numeric])

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    let list = block.rows.map((row, at) => ({ row, at }))
    if (needle) list = list.filter(({ row }) => row.some((value, at) => display(value, block.columns[at]).toLocaleLowerCase().includes(needle)))
    for (const [key, value] of Object.entries(filters)) if (value) list = list.filter(({ row }) => row[Number(key)] === value)
    if (sort && sort.column < block.columns.length) {
      const factor = sort.direction === "asc" ? 1 : -1
      list = [...list].sort((a, b) => factor * compare(a.row[sort.column], b.row[sort.column]) || a.at - b.at)
    }
    return list
  }, [block, query, filters, sort])

  const best = useMemo(() => {
    if (!block.highlight) return null
    const values = block.rows.map((row) => row[block.highlight!.column]).filter((value): value is number => typeof value === "number")
    if (!values.length) return null
    return block.highlight.best === "max" ? Math.max(...values) : Math.min(...values)
  }, [block])

  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, pages - 1)
  const visible = rows.slice(current * pageSize, current * pageSize + pageSize)
  const cycleSort = (column: number) => {
    setPage(0)
    if (!sort || sort.column !== column) return setSort({ column, direction: numeric[column] ? "desc" : "asc" })
    if (sort.direction === (numeric[column] ? "desc" : "asc")) return setSort({ column, direction: numeric[column] ? "asc" : "desc" })
    setSort(null)
  }
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); say("Скопировано") } catch { say("Не удалось скопировать") }
  }
  const exportCsv = () => {
    const lines = [block.columns.map((column) => csvCell(column.label)).join(","), ...rows.map(({ row }) => row.map(csvCell).join(","))]
    download(fileName(block.title, "csv"), "﻿" + lines.join("\n"), "text/csv;charset=utf-8")
  }

  return <>
    <div className="mv-table__tools">
      <label className="mv-search"><Search aria-hidden="true" /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} placeholder="Поиск по таблице" aria-label="Поиск по таблице" /></label>
      {filterable.map(({ at, values }) => <select key={at} className="mv-select" value={filters[at] || ""} aria-label={`Фильтр: ${block.columns[at].label}`}
        onChange={(event) => { setFilters({ ...filters, [at]: event.target.value }); setPage(0) }}>
        <option value="">{block.columns[at].label}: все</option>
        {values.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>)}
      <button type="button" className="mv-btn" onClick={exportCsv}><Download aria-hidden="true" />CSV</button>
    </div>
    <div className="mv-tablewrap" style={big ? { maxHeight: "65vh" } : undefined}>
      <table className="mv-table">
        <thead><tr>{block.columns.map((column, at) => {
          const active = sort?.column === at
          const Icon = active ? (sort!.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
          return <th key={at} className={numeric[at] ? "is-num" : undefined} aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : "none"} scope="col">
            <button type="button" onClick={() => cycleSort(at)}>{column.label}{column.unit && column.kind !== "currency" ? <span style={{ color: "#8f8f8f", fontWeight: 500 }}> · {column.unit}</span> : null}<Icon aria-hidden="true" /></button>
          </th>
        })}</tr></thead>
        <tbody>
          {visible.length ? visible.map(({ row, at: index }) => <tr key={index}>{row.map((value, at) => {
            const text = display(value, block.columns[at], digits[at])
            const isBest = best !== null && block.highlight?.column === at && value === best
            return <td key={at} className={[numeric[at] ? "is-num" : "", isBest ? "is-best" : ""].filter(Boolean).join(" ") || undefined} onClick={() => copy(text)} title="Нажмите, чтобы скопировать">{text}</td>
          })}</tr>) : <tr><td className="mv-table__empty" colSpan={block.columns.length}>Ничего не найдено</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="mv-pager">
      <span>{rows.length === block.rows.length ? `${block.rows.length} строк` : `${rows.length} из ${block.rows.length}`}</span>
      {pages > 1 ? <span className="mv-pager__nav">
        <button type="button" className="mv-iconbtn" onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0} aria-label="Предыдущая страница"><ChevronLeft /></button>
        <span>{current + 1} / {pages}</span>
        <button type="button" className="mv-iconbtn" onClick={() => setPage(Math.min(pages - 1, current + 1))} disabled={current >= pages - 1} aria-label="Следующая страница"><ChevronRight /></button>
      </span> : null}
    </div>
    {toast}
  </>
}

export function VisualTable({ block, storeKey, persist }: { block: TableBlock; storeKey: string; persist: boolean }) {
  const [full, setFull] = useState(false)
  return <>
    <VisualCard block={block} icon={<Table2 />} label="Таблица" onFullscreen={() => setFull(true)}>
      <TableBody block={block} storeKey={storeKey} persist={persist} />
    </VisualCard>
    <Fullscreen open={full} onClose={() => setFull(false)}>
      <VisualCard block={block} icon={<Table2 />} label="Таблица" big>
        <TableBody block={block} storeKey={storeKey} persist={persist} big />
      </VisualCard>
    </Fullscreen>
  </>
}
