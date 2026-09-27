import type { GodArtifact, GodArtifactKind } from "./contracts"

export type GodActionTarget =
  | "chat"
  | "image"
  | "video"
  | "music"
  | "sites"
  | "presentations"
  | "business"
  | "translator"
  | "analysis"
  | "projects"

export type GodQuickAction = {
  id: string
  label: string
  target: GodActionTarget
  inputArtifactId: string
  capability: string
}

const TARGETS: Partial<Record<GodArtifactKind, Array<Omit<GodQuickAction, "inputArtifactId">>>> = {
  image: [
    { id: "image-to-video", label: "Оживить в видео", target: "video", capability: "image-to-video" },
    { id: "image-edit", label: "Редактировать", target: "image", capability: "image-edit" },
    { id: "image-to-site", label: "Использовать на сайте", target: "sites", capability: "site-asset" },
    { id: "image-to-deck", label: "Добавить в презентацию", target: "presentations", capability: "presentation-asset" },
  ],
  video: [
    { id: "video-edit", label: "Редактировать видео", target: "video", capability: "video-to-video" },
    { id: "video-soundtrack", label: "Создать саундтрек", target: "music", capability: "video-soundtrack" },
    { id: "video-to-deck", label: "Добавить в проект", target: "projects", capability: "project-asset" },
  ],
  audio: [
    { id: "audio-to-video", label: "Использовать в видео", target: "video", capability: "video-audio" },
    { id: "audio-continue", label: "Продолжить трек", target: "music", capability: "continue-track" },
  ],
  website: [
    { id: "site-edit", label: "Изменить сайт", target: "sites", capability: "site-edit" },
    { id: "site-to-ads", label: "Создать рекламу", target: "business", capability: "site-to-ads" },
    { id: "site-to-deck", label: "Добавить в pitch deck", target: "presentations", capability: "project-to-deck" },
  ],
  presentation: [
    { id: "deck-edit", label: "Улучшить слайды", target: "presentations", capability: "slide-edit" },
    { id: "deck-translate", label: "Перевести презентацию", target: "translator", capability: "document-translate" },
  ],
  dataset: [
    { id: "dataset-analyze", label: "Анализировать данные", target: "analysis", capability: "data-analysis" },
    { id: "dataset-chart", label: "Сделать графики", target: "presentations", capability: "data-to-chart" },
  ],
  analysis: [
    { id: "analysis-to-deck", label: "Сделать слайды", target: "presentations", capability: "analysis-to-deck" },
    { id: "analysis-to-business", label: "Применить к бизнесу", target: "business", capability: "business-analysis" },
  ],
  "business-plan": [
    { id: "business-to-site", label: "Создать сайт", target: "sites", capability: "business-to-site" },
    { id: "business-to-deck", label: "Investor Deck", target: "presentations", capability: "business-to-deck" },
    { id: "business-to-video", label: "Промо-видео", target: "video", capability: "business-to-video" },
  ],
  document: [
    { id: "document-translate", label: "Перевести", target: "translator", capability: "document-translate" },
    { id: "document-analyze", label: "Анализировать", target: "analysis", capability: "document-analysis" },
  ],
  code: [
    { id: "code-preview", label: "Открыть preview", target: "sites", capability: "code-preview" },
    { id: "code-project", label: "Сохранить в проект", target: "projects", capability: "project-code" },
  ],
  text: [
    { id: "text-to-deck", label: "Сделать презентацию", target: "presentations", capability: "text-to-deck" },
    { id: "text-to-site", label: "Сделать сайт", target: "sites", capability: "text-to-site" },
  ],
}

export function artifactQuickActions(artifact: Pick<GodArtifact, "id" | "kind">): GodQuickAction[] {
  const actions = TARGETS[artifact.kind] || [
    { id: "continue-in-chat", label: "Продолжить в чате", target: "chat" as const, capability: "artifact-chat" },
  ]
  return actions.map((action) => ({ ...action, inputArtifactId: artifact.id }))
}
