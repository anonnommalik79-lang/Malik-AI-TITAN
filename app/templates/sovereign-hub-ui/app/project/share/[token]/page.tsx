import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { resolvePublicProjectShare } from "@/lib/god-mode/share"
import styles from "./page.module.css"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ token: string }> }

function fmt(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : value
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const shared = await resolvePublicProjectShare(token)
  if (!shared) return { title: "Malik AI · Project", robots: { index: false, follow: false } }
  return {
    title: `${shared.project.title} · Malik AI`,
    description: shared.project.goal.slice(0, 180),
    robots: { index: false, follow: false },
    openGraph: {
      title: `${shared.project.title} · Malik AI`,
      description: shared.project.goal.slice(0, 180),
      type: "website",
    },
  }
}

export default async function SharedProjectPage({ params }: Props) {
  const { token } = await params
  const shared = await resolvePublicProjectShare(token)
  if (!shared) notFound()

  const project = shared.project
  const done = project.tasks.filter((task) => task.status === "completed").length
  const active = project.tasks.filter((task) => ["queued", "running", "waiting", "retrying"].includes(task.status)).length
  const failed = project.tasks.filter((task) => task.status === "failed").length

  return (
    <main className={styles.root}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>MALIK AI</div>
          <div className={styles.readonly}>READ ONLY PROJECT</div>
        </header>

        <section className={styles.hero}>
          <div className={styles.eyebrow}>PROJECT</div>
          <h1>{project.title}</h1>
          <p>{project.goal}</p>
          <div className={styles.meta}>
            <span>{project.status === "completed" ? "PROJECT READY" : project.status.toUpperCase()}</span>
            <span>Обновлено {fmt(project.updatedAt)}</span>
            <span>Ссылка действует до {fmt(shared.expiresAt)}</span>
          </div>
        </section>

        <section className={styles.metrics} aria-label="Project metrics">
          <article><strong>{project.tasks.length}</strong><span>задач</span></article>
          <article><strong>{done}</strong><span>готово</span></article>
          <article><strong>{active}</strong><span>в работе</span></article>
          <article><strong>{project.artifacts.length}</strong><span>артефактов</span></article>
          <article><strong>{failed}</strong><span>ошибок</span></article>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}><h2>Ход проекта</h2><span>{done}/{project.tasks.length}</span></div>
          <div className={styles.timeline}>
            {project.tasks.length ? project.tasks.map((task) => (
              <article className={styles.task} key={task.id}>
                <span className={styles.dot} data-status={task.status} />
                <div>
                  <strong>{task.label}</strong>
                  <p>{task.stage || task.type}</p>
                </div>
                <span className={styles.status}>{task.status}</span>
              </article>
            )) : <p className={styles.empty}>Задачи ещё не добавлены.</p>}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}><h2>Результаты</h2><span>{project.artifacts.length}</span></div>
          <div className={styles.artifacts}>
            {project.artifacts.length ? project.artifacts.map((artifact) => (
              <article className={styles.artifact} key={artifact.id}>
                <div><span>{artifact.kind}</span><strong>{artifact.title}</strong></div>
                <div className={styles.version}>v{artifact.version}{artifact.approved ? " · FINAL" : ""}</div>
              </article>
            )) : <p className={styles.empty}>Готовых результатов пока нет.</p>}
          </div>
        </section>

        <footer className={styles.footer}>
          <span>Создано в Malik AI</span>
          <span>Приватные provider URL, API-ключи и внутренние метаданные не опубликованы.</span>
        </footer>
      </section>
    </main>
  )
}
