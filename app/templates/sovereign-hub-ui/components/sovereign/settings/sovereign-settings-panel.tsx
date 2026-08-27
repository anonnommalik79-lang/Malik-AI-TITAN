"use client"

import { useState } from "react"
import { Brain, Download, LogOut, Settings, User } from "lucide-react"
import { MALIK_MODELS, canUseMalikModel, type MalikModelId } from "@/lib/ai/malik-models"
import { loadResponseDepth, saveResponseDepth, canUseUltra, type ResponseDepth } from "@/lib/ai/response-depth"
import { useWebSearchEnabled } from "@/lib/ai/web-search-preference"
import type { AIPlan } from "@/lib/ai/types"
import { useContextEnabled } from "@/lib/malik-context"
import { AccountDialog } from "../account/AccountDialog"
import styles from "../account/account-panels.module.css"

const TABS = [
  { id: "general", title: "Основные", icon: Settings },
  { id: "context", title: "Контекст", icon: Brain },
  { id: "account", title: "Аккаунт", icon: User },
] as const

export function SovereignSettingsPanel({ username, email, plan, selectedModelId, onModelChange, onLogout, onClose, onOpenBilling, onExport }: {
  username: string
  email?: string
  plan: AIPlan
  selectedModelId: MalikModelId
  onModelChange: (id: MalikModelId) => void
  onLogout: () => void
  onClose: () => void
  onOpenBilling: () => void
  onExport: () => void
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("general")
  const [memoryOn, setMemoryOn] = useContextEnabled()
  const [webOn, setWebOn] = useWebSearchEnabled()
  const [depth, setDepth] = useState(() => loadResponseDepth(plan))
  const plus = plan !== "free"

  return (
    <AccountDialog title="Настройки" description="Ваш Malik AI. Ваш привычный способ работы." onClose={onClose}>
      <div className={styles.settings}>
        <nav className={styles.tabs} aria-label="Разделы настроек">
          {TABS.map(({ id, title, icon: Icon }) => (
            <button key={id} aria-current={tab === id ? "page" : undefined} className={styles.tab} onClick={() => setTab(id)}><Icon size={17} />{title}</button>
          ))}
        </nav>
        <div className={styles.content}>
          {tab === "general" && <>
            <h2 className={styles.sectionTitle}>Ответы и модели</h2>
            <p className={styles.muted}>Изменения сохраняются в этом браузере.</p>
            <div className={styles.row}>
              <div className={styles.rowCopy}><label htmlFor="settings-model">Модель</label><p>Применяется к текущему диалогу.</p></div>
              <select id="settings-model" className={styles.select} value={selectedModelId} onChange={(event) => onModelChange(event.target.value as MalikModelId)}>
                {MALIK_MODELS.map((model) => <option key={model.id} value={model.id} disabled={!canUseMalikModel(model.id, plan)}>{model.label}{model.tier === "pro" && !plus ? " · Plus" : ""}</option>)}
              </select>
            </div>
            <div className={styles.row}>
              <div className={styles.rowCopy}><label htmlFor="settings-depth">Стиль ответа</label><p>По умолчанию для новых сообщений.</p></div>
              <select id="settings-depth" className={styles.select} value={depth} onChange={(event) => { const next = event.target.value as ResponseDepth; setDepth(next); saveResponseDepth(next) }}>
                <option value="fast">Кратко и по делу</option><option value="deep">Подробно</option>
                {canUseUltra(plan) && <option value="ultra">Максимальная глубина</option>}
              </select>
            </div>
            <div className={styles.row}><div className={styles.rowCopy}><span>Оформление</span><p>Чёрный фон и светлый текст.</p></div><span className={styles.muted}>Тёмное</span></div>
          </>}
          {tab === "context" && <>
            <h2 className={styles.sectionTitle}>Контекст и веб-поиск</h2>
            <div className={styles.row}><div className={styles.rowCopy}><span id="settings-web-label">Поиск по необходимости</span><p>«Поищи», «что такое» и свежие факты — с источниками. Обычный разговор — без поиска.</p></div><button type="button" role="switch" aria-labelledby="settings-web-label" aria-checked={webOn} onClick={() => setWebOn(!webOn)} className={styles.switch} /></div>
            <div className={styles.row}><div className={styles.rowCopy}><span id="settings-memory-label">Контекст диалога</span><p>Передавать модели предыдущие сообщения. Если выключить, отправляется только текущий запрос.</p></div><button type="button" role="switch" aria-labelledby="settings-memory-label" aria-checked={memoryOn} onClick={() => setMemoryOn(!memoryOn)} className={styles.switch} /></div>
            <p className={styles.note}>Выбор модели не меняется автоматически при ошибке провайдера.</p>
          </>}
          {tab === "account" && <>
            <h2 className={styles.sectionTitle}>Ваш аккаунт</h2>
            <div className={styles.account}><span className={styles.avatar}>{(username || "М").slice(0, 1).toUpperCase()}</span><div><strong>{username || "Гость"}</strong><p className={styles.email}>{email || "Гостевой доступ · без регистрации"}</p></div></div>
            <div className={styles.row}><div className={styles.rowCopy}><span>Подписка</span><p>{plus ? "MalikAI Plus" : "Бесплатный"}</p></div><button className={styles.button} onClick={onOpenBilling}>Управление</button></div>
            <div className={styles.row}><div className={styles.rowCopy}><span>Сохранённые диалоги</span><p>Скачать копию истории из этого браузера.</p></div><button className={styles.button} onClick={onExport}><Download size={16} />Экспорт</button></div>
            <p className={styles.note}>{email ? "Вход защищён WorkOS. Адрес аккаунта определяется вашей сессией, а не настройками браузера." : "Войдите, чтобы подключить подписку к вашему аккаунту."}</p>
            <div className={styles.actions}>{email ? <button className={styles.button + " " + styles.danger} onClick={onLogout}><LogOut size={16} />Выйти</button> : <a className={styles.primaryButton} href="/sign-in">Войти в аккаунт</a>}</div>
          </>}
        </div>
      </div>
    </AccountDialog>
  )
}

export default SovereignSettingsPanel

