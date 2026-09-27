import "server-only"

import { createHash } from "node:crypto"

import { readPrivateJson, writePrivateJson } from "@/lib/server/private-json-store"
import { createGodProject, createGodTask, getGodProject, projectManifest } from "./project-state"

type MissionRecord = {
  version: 1
  ownerId: string
  keyHash: string
  projectId: string
  createdAt: string
}

type MissionStep = {
  type: string
  label: string
  dependencies: number[]
}

function ownerHash(ownerId: string) {
  return createHash("sha256").update(String(ownerId || "guest").trim().toLowerCase()).digest("hex")
}

function missionKeyHash(value: string) {
  return createHash("sha256").update(String(value || "").trim()).digest("hex")
}

function missionKey(ownerId: string, keyHash: string) {
  return `private/system/malik-god-missions/${ownerHash(ownerId)}/${keyHash}.json`
}

function inferSteps(goal: string): MissionStep[] {
  const text = goal.toLowerCase()
  const steps: MissionStep[] = []
  const add = (type: string, label: string, dependencies: number[] = []) => {
    const existing = steps.findIndex((step) => step.type === type)
    if (existing >= 0) return existing
    steps.push({ type, label, dependencies })
    return steps.length - 1
  }

  const research = /рынок|research|исслед|конкур|источник|market|startup|стартап|бизнес|invest/i.test(text)
    ? add("research", "Исследовать факты, рынок и ограничения")
    : -1
  const business = /бизнес|startup|стартап|бренд|brand|invest|pricing|рынок/i.test(text)
    ? add("business", "Собрать бизнес-модель и позиционирование", research >= 0 ? [research] : [])
    : -1
  const image = /изображ|фото|image|visual|бренд|brand|реклам|кампан/i.test(text)
    ? add("image", "Создать визуальные материалы", business >= 0 ? [business] : research >= 0 ? [research] : [])
    : -1
  const site = /сайт|site|website|landing|лендинг|web|startup|стартап|бизнес/i.test(text)
    ? add("website", "Создать рабочий сайт", business >= 0 ? [business] : [])
    : -1
  const video = /видео|video|ролик|реклам|promo|campaign|кампан/i.test(text)
    ? add("video", "Создать видео", image >= 0 ? [image] : business >= 0 ? [business] : [])
    : -1
  const music = /музык|трек|music|soundtrack|саунд|песн/i.test(text)
    ? add("music", "Создать музыку или саундтрек", video >= 0 ? [video] : [])
    : -1
  const data = /данн|csv|xlsx|аналит|forecast|прогноз|unit economics|экономик/i.test(text)
    ? add("analysis", "Проанализировать данные", research >= 0 ? [research] : [])
    : -1
  if (/презент|presentation|pitch|deck|инвест|invest/i.test(text)) {
    add("presentation", "Собрать финальную презентацию", [business, image, site, video, music, data].filter((index) => index >= 0))
  }
  if (/перев|translate|англ|english|қазақ|казах/i.test(text)) {
    add("translator", "Подготовить нужные языковые версии", steps.length ? [steps.length - 1] : [])
  }

  if (!steps.length) add("chat", "Выполнить цель и подготовить результат")
  return steps.slice(0, 16)
}

export async function createOrResumeMission(
  ownerId: string,
  input: { goal: string; title?: string; idempotencyKey: string },
) {
  const keyHash = missionKeyHash(input.idempotencyKey)
  const storageKey = missionKey(ownerId, keyHash)
  const existing = await readPrivateJson<MissionRecord>(storageKey)
  if (existing?.ownerId === ownerId && existing.keyHash === keyHash) {
    const project = await getGodProject(existing.projectId, ownerId)
    if (project) return { reused: true, project: projectManifest(project), plan: Object.values(project.tasks) }
  }

  const project = await createGodProject(ownerId, { goal: input.goal, title: input.title })
  const steps = inferSteps(input.goal)
  const taskIds: string[] = []

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]
    const task = await createGodTask(project.id, ownerId, {
      type: step.type,
      label: step.label,
      dependencies: step.dependencies.map((dependencyIndex) => taskIds[dependencyIndex]).filter(Boolean),
      idempotencyKey: `${input.idempotencyKey}:${step.type}:${index}`,
      maxAttempts: 3,
    })
    if (task) taskIds.push(task.id)
  }

  const record: MissionRecord = {
    version: 1,
    ownerId,
    keyHash,
    projectId: project.id,
    createdAt: new Date().toISOString(),
  }
  await writePrivateJson(storageKey, record)
  const ready = await getGodProject(project.id, ownerId)
  return { reused: false, project: ready ? projectManifest(ready) : projectManifest(project), plan: ready ? Object.values(ready.tasks) : [] }
}
