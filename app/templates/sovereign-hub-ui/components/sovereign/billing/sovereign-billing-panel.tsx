"use client"

import { useState } from "react"
import { Check, Loader2 } from "lucide-react"
import type { AIPlan } from "@/lib/ai/types"
import { PUBLIC_PLANS } from "@/lib/billing/plans"
import { AccountDialog } from "../account/AccountDialog"
import styles from "../account/account-panels.module.css"

export function SovereignBillingPanel({ plan, authenticated, onClose }: { plan: AIPlan; authenticated: boolean; onClose: () => void }) {
  const [status, setStatus] = useState("")
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [orderId, setOrderId] = useState("")
  const [checkoutUrl, setCheckoutUrl] = useState("")
  const plus = plan !== "free"

  const upgrade = async () => {
    if (!authenticated) { window.location.assign("/sign-in"); return }
    setLoading(true)
    setError(false)
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro" }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.message || "Не удалось создать заявку. Попробуйте позже.")
      setOrderId(data.order.id)
      setStatus(data.message)
      if (typeof data.checkoutUrl === "string" && data.checkoutUrl.startsWith("https://t.me/")) setCheckoutUrl(data.checkoutUrl)
    } catch (err) {
      setError(true)
      setStatus(err instanceof Error ? err.message : "Ошибка соединения. Заявка не подтверждена.")
    } finally { setLoading(false) }
  }

  const verify = async () => {
    setLoading(true)
    setError(false)
    try {
      const response = await fetch("/api/billing/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) })
      const data = await response.json()
      if (!response.ok) throw new Error("Не удалось проверить заявку. Обратитесь в поддержку с её номером.")
      const approved = data.order?.status === "approved"
      setStatus(approved ? "MalikAI Plus активирован." : data.order?.status === "rejected" ? "Заявка отклонена. Уточните причину в поддержке." : "Заявка ещё ожидает подтверждения.")
      if (approved) window.dispatchEvent(new Event("malik-plan-updated"))
    } catch (err) {
      setError(true)
      setStatus(err instanceof Error ? err.message : "Не удалось проверить статус.")
    } finally { setLoading(false) }
  }

  return (
    <AccountDialog title="Выберите свой Malik AI" description="Два тарифа. Одна рабочая область. Выберите доступ, который подходит вашим задачам." onClose={onClose} wide>
      <div className={styles.scroll}>
        <div className={styles.plans}>
          {PUBLIC_PLANS.map((item) => {
            const isPlus = item.id === "pro"
            const current = isPlus === plus
            return (
              <article key={item.id} className={styles.plan + (isPlus ? " " + styles.plus : "")}>
                <div className={styles.planHeading}><h2>{item.title}</h2>{current && <span className={styles.badge}>Ваш тариф</span>}</div>
                <p className={styles.price}>{item.price}</p>
                <p className={styles.planDescription}>{item.description}</p>
                <button className={isPlus ? styles.primaryButton : styles.button} onClick={isPlus ? upgrade : undefined} disabled={!isPlus || current || loading || Boolean(orderId)}>
                  {loading && isPlus && <Loader2 size={16} className="animate-spin" />}
                  {current ? "Текущий тариф" : isPlus ? orderId ? "Заявка отправлена" : authenticated ? "Подключить Plus" : "Войти и подключить Plus" : "Базовый доступ"}
                </button>
                <ul className={styles.features}>{item.features.map((feature) => <li key={feature}><Check size={16} /><span>{feature}</span></li>)}</ul>
              </article>
            )
          })}
        </div>
        {status && <div className={styles.notice + (error ? " " + styles.error : "")} role={error ? "alert" : "status"}>
          {status}
          {orderId && <p className={styles.muted}>Номер: {orderId}</p>}
          {orderId && !plus && <div className={styles.actions}>
            {checkoutUrl && <a className={styles.button} href={checkoutUrl} target="_blank" rel="noopener noreferrer">Продолжить в поддержке</a>}
            <button className={styles.button} disabled={loading} onClick={verify}>Проверить активацию</button>
          </div>}
        </div>}
        <p className={styles.note}>Подключение Plus пока подтверждается вручную. Стоимость согласуется до оплаты. Доступ к моделям зависит также от доступности и лимитов их провайдеров; «безлимит» не обещаем.</p>
      </div>
    </AccountDialog>
  )
}

export default SovereignBillingPanel

