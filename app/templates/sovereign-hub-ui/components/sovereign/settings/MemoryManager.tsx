"use client"

import { useMemo, useState } from "react"
import { Check, Plus, Trash2, X } from "lucide-react"
import {
  MAX_MEMORY_ITEM_CHARS,
  MAX_MEMORY_ITEMS,
  addMalikMemory,
  clearMalikMemories,
  removeMalikMemory,
  updateMalikMemory,
  useMalikMemories,
} from "@/lib/malik-context"

export function MemoryManager() {
  const memories = useMalikMemories()
  const [draft, setDraft] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState("")
  const remaining = Math.max(0, MAX_MEMORY_ITEMS - memories.length)
  const canAdd = Boolean(draft.trim()) && remaining > 0

  const sorted = useMemo(
    () => [...memories].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [memories],
  )

  const add = () => {
    if (!canAdd) return
    addMalikMemory(draft)
    setDraft("")
  }

  const startEdit = (id: string, text: string) => {
    setEditingId(id)
    setEditingText(text)
  }

  const saveEdit = () => {
    if (!editingId || !editingText.trim()) return
    updateMalikMemory(editingId, editingText)
    setEditingId(null)
    setEditingText("")
  }

  return (
    <section className="mt-5 min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3 sm:p-4" aria-labelledby="malik-memory-title">
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h3 id="malik-memory-title" className="text-sm font-semibold text-zinc-100">Что Malik AI помнит</h3>
          <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">
            Только то, что вы добавили сами. Основная копия хранится в этом браузере; когда «Контекст» включён, компактная копия передаётся только вашему Malik AI runtime для текущих ответов. Любую запись можно изменить или удалить.
          </p>
        </div>
        <span className="shrink-0 pt-1 text-[11px] tabular-nums text-zinc-600">{memories.length}/{MAX_MEMORY_ITEMS}</span>
      </div>

      <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row">
        <input
          value={draft}
          maxLength={MAX_MEMORY_ITEM_CHARS}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault()
              add()
            }
          }}
          placeholder={remaining ? "Например: отвечай мне кратко на русском" : "Лимит памяти заполнен"}
          disabled={!remaining}
          aria-label="Новая запись памяти"
          className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-black px-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/[0.18] disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          onClick={add}
          disabled={!canAdd}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.06] px-4 text-[13px] font-medium text-zinc-100 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Запомнить
        </button>
      </div>

      {sorted.length ? (
        <div className="mt-3 max-h-[min(40vh,360px)] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
          {sorted.map((item) => {
            const editing = editingId === item.id
            return (
              <div key={item.id} className="min-w-0 rounded-xl border border-white/[0.06] bg-black/50 p-3">
                {editing ? (
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      autoFocus
                      value={editingText}
                      maxLength={MAX_MEMORY_ITEM_CHARS}
                      onChange={(event) => setEditingText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.nativeEvent.isComposing) saveEdit()
                        if (event.key === "Escape") setEditingId(null)
                      }}
                      className="h-11 min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#080808] px-3 text-[13px] text-zinc-100 outline-none focus:border-white/[0.2]"
                      aria-label="Изменить запись памяти"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={saveEdit} disabled={!editingText.trim()} className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-white/[0.1] px-3 text-zinc-300 hover:bg-white/[0.06] disabled:opacity-40 sm:flex-none" aria-label="Сохранить"><Check className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setEditingId(null)} className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-white/[0.08] px-3 text-zinc-500 hover:bg-white/[0.04] sm:flex-none" aria-label="Отменить"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-w-0 items-start gap-2">
                    <button type="button" onClick={() => startEdit(item.id, item.text)} className="min-w-0 flex-1 text-left text-[13px] leading-5 text-zinc-300 hover:text-zinc-100">
                      <span className="break-words">{item.text}</span>
                    </button>
                    <button type="button" onClick={() => removeMalikMemory(item.id)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-300" aria-label="Удалить запись памяти">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-white/[0.07] px-3 py-4 text-center text-xs text-zinc-600">
          Пока нет сохранённых записей.
        </div>
      )}

      {memories.length ? (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Удалить всю память Malik AI в этом браузере?")) clearMalikMemories()
            }}
            className="min-h-11 rounded-lg px-3 text-xs text-zinc-600 transition hover:bg-white/[0.04] hover:text-red-300"
          >
            Очистить всю память
          </button>
        </div>
      ) : null}
    </section>
  )
}

export default MemoryManager
