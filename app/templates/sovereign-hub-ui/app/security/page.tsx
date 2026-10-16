import Link from "next/link"
import { PublicPageShell, PublicSection } from "@/components/public/PublicPageShell"
import { TrustSecurityList } from "@/components/public/ProofWidgets"
import { PROFESSIONAL_DISCLAIMER } from "@/lib/ai/safety"

export const metadata = {
  title: "Security — MALIK AI",
  description: "Trust and security overview for MALIK AI public deployment.",
}

export default function SecurityPage() {
  return (
    <PublicPageShell
      activeNav="/security"
      title="Trust & security"
      subtitle="How MALIK AI handles providers, secrets and public proof surfaces."
    >
      <PublicSection title="Security principles">
        <TrustSecurityList />
      </PublicSection>

      <PublicSection title="Safe public routes">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <Link href="/api/ai/status" className="text-cyan-300 hover:underline">
              /api/ai/status
            </Link>{" "}
            — booleans and safe metadata only
          </li>
          <li>
            <Link href="/api/ai/capabilities" className="text-cyan-300 hover:underline">
              /api/ai/capabilities
            </Link>{" "}
            — public capability registry
          </li>
          <li>
            <Link href="/status" className="text-cyan-300 hover:underline">
              /status
            </Link>{" "}
            — human-readable status page
          </li>
        </ul>
      </PublicSection>

      <PublicSection title="Privacy & terms">
        <p>Для поддержки и диагностики Malik AI сохраняет текст запросов авторизованных пользователей и ответы ассистента, время, выбранную модель и статус ошибок. Эти записи может просматривать только подтверждённый аккаунт владельца сервиса; другие пользователи доступа не имеют.</p>
        <p>Журнал шифруется на сервере. Известные форматы ключей и паролей маскируются автоматически, но это не гарантирует распознавания всех секретов: не отправляйте пароли, API-ключи и конфиденциальные данные в чат. Скрытые рассуждения моделей и исходные аудиозаписи в этот журнал не добавляются.</p>
        <p>Временное серверное хранилище не гарантирует сохранность после перезапуска или развёртывания. Для вопросов о данных и запросов на удаление: hello@malik.ai. Это описание обработки данных, а не замена полной политики конфиденциальности и условий сервиса.</p>
      </PublicSection>

      <p className="text-xs text-slate-500">{PROFESSIONAL_DISCLAIMER}</p>
    </PublicPageShell>
  )
}
