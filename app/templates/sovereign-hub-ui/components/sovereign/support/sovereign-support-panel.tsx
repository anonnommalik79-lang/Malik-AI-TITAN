"use client"

import { ArrowUpRight, CreditCard, Settings } from "lucide-react"
import { AccountDialog } from "../account/AccountDialog"
import styles from "../account/account-panels.module.css"

const FAQ = [
  ["Какие модели доступны бесплатно?", "MalikAI20B и MalikAI120B Fast. Нажмите название модели рядом с полем запроса, чтобы переключиться. Остальная линейка открывается с MalikAI Plus."],
  ["Когда Malik AI ищет в интернете?", "Когда вы просите найти информацию, спрашиваете «что такое» или задаёте вопрос о свежих данных. Обычное общение, работа с текстом и кодом не запускают поиск. Поиск можно отключить в настройках контекста."],
  ["Почему модель временно недоступна?", "Причиной может быть лимит или сбой провайдера. Попробуйте позже или выберите другую доступную модель. Malik AI не подменяет выбранную модель незаметно."],
  ["Где хранятся мои диалоги?", "История рабочей области сохраняется в этом браузере. Перед очисткой данных браузера скачайте копию в разделе «Настройки → Аккаунт → Экспорт»."],
  ["Как подключить MalikAI Plus?", "Откройте «Подписка» и отправьте заявку из своего аккаунта. Пока подключение подтверждается вручную; нажатие кнопки не означает оплату или активацию."],
]

export function SovereignSupportPanel({ onClose, onOpenSettings, onOpenBilling }: { onClose: () => void; onOpenSettings: () => void; onOpenBilling: () => void }) {
  return (
    <AccountDialog title="Помощь с Malik AI" description="Ответы на частые вопросы и связь с поддержкой." onClose={onClose}>
      <div className={styles.scroll}>
        <h2 className={styles.sectionTitle}>Чем помочь?</h2>
        <p className={styles.muted}>Начните с нужного раздела или найдите ответ ниже.</p>
        <div className={styles.actions}><button className={styles.button} onClick={onOpenSettings}><Settings size={16} />Настройки</button><button className={styles.button} onClick={onOpenBilling}><CreditCard size={16} />Подписка</button></div>
        <div className={styles.faq}>{FAQ.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
        <div className={styles.contact}><div><h2 className={styles.sectionTitle}>Не нашли ответ?</h2><p className={styles.muted}>Опишите проблему и приложите скриншот без API-ключей.</p></div><a className={styles.primaryButton} href="https://t.me/Sovereign_Hub" target="_blank" rel="noopener noreferrer">Написать в Telegram<ArrowUpRight size={16} /></a></div>
      </div>
    </AccountDialog>
  )
}

export default SovereignSupportPanel

