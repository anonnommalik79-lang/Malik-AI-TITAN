import type { AIFileAttachment, AITaskType } from "./types"

export type SmartTaskType =
  | "chat"
  | "code"
  | "debug"
  | "project"
  | "image"
  | "video"
  | "file_analysis"
  | "research"

export type IntentScores = {
  componentScore: number
  projectScore: number
  debugScore: number
  imageScore: number
  videoScore: number
  fileScore: number
  researchScore: number
  chatScore: number
}

export type TaskDetection = {
  task: AITaskType
  smartTask: SmartTaskType
  confidence: number
  scores: IntentScores
  reason: string
  shouldUseProjectBuilder: boolean
  shouldReturnSingleComponent: boolean
}

const COMPONENT_PATTERNS: RegExp[] = [
  /\bcomponent\b/i,
  /\bui\s*component\b/i,
  /\breact\s*component\b/i,
  /\btsx\s*component\b/i,
  /\bbutton\b/i,
  /\bcard\b/i,
  /\binput\b/i,
  /\bnavbar\b/i,
  /\bmodal\b/i,
  /\bform\b/i,
  /компонент/i,
  /кнопк/i,
  /карточк/i,
  /инпут/i,
  /форма/i,
  /модал/i,
  /навигац/i,
  /создай\s+.*компонент/i,
]

const PROJECT_PATTERNS: RegExp[] = [
  /создай\s+сайт/i,
  /создай\s+проект/i,
  /создай\s+приложение/i,
  /полный\s+проект/i,
  /готовый\s+проект/i,
  /структур[ау]\s+пап/i,
  /package\.json/i,
  /frontend\s*\+\s*backend/i,
  /\blanding\s*page\b/i,
  /\bfull\s*app\b/i,
  /\bfull\s*project\b/i,
  /\bwebsite\b/i,
  /\bsite\b/i,
  /\bapp\b/i,
  /лендинг/i,
  /весь\s+проект/i,
]

const DEBUG_PATTERNS: RegExp[] = [
  /ошибк/i,
  /баг/i,
  /исправь/i,
  /почини/i,
  /не\s+работает/i,
  /console\s*error/i,
  /maximum\s+update\s+depth/i,
  /\bfix\b/i,
  /\bdebug\b/i,
  /\berror\b/i,
  /\bbug\b/i,
  /\bexception\b/i,
  /\btraceback\b/i,
]

const IMAGE_PATTERNS: RegExp[] = [
  /фото/i,
  /картин/i,
  /изображ/i,
  /логотип/i,
  /\bава\b/i,
  /\bavatar\b/i,
  /\bimage\b/i,
  /\bphoto\b/i,
  /\bpicture\b/i,
  /нарисуй/i,
]

const VIDEO_PATTERNS: RegExp[] = [
  /видео/i,
  /ролик/i,
  /анимац/i,
  /\bvideo\b/i,
  /\banimation\b/i,
  /\bclip\b/i,
  /\btrailer\b/i,
  /\breel\b/i,
]

const FILE_PATTERNS: RegExp[] = [
  /файл/i,
  /документ/i,
  /проанализируй/i,
  /\bfile\b/i,
  /\bpdf\b/i,
  /\bdocx\b/i,
  /\bxlsx\b/i,
  /\bcsv\b/i,
  /\banalyze\s+file\b/i,
]

const RESEARCH_PATTERNS: RegExp[] = [
  /найди/i,
  /исследуй/i,
  /сравни/i,
  /\bresearch\b/i,
  /\bcompare\b/i,
  /\bsources\b/i,
]

const NEGATIVE_PROJECT_FOR_COMPONENT: RegExp[] = [
  /прост(ой|ую|ая)/i,
  /один\s+компонент/i,
  /только\s+компонент/i,
  /single\s+component/i,
  /just\s+component/i,
  /button\.tsx/i,
]

function countMatches(text: string, patterns: RegExp[], weight: number) {
  return patterns.reduce((total, pattern) => total + (pattern.test(text) ? weight : 0), 0)
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function normalizePrompt(prompt: string) {
  return String(prompt || "").replace(/\s+/g, " ").trim()
}

export function detectTask(prompt: string, attachments: AIFileAttachment[] = []): TaskDetection {
  const text = normalizePrompt(prompt)
  const lower = text.toLowerCase()

  let componentScore = countMatches(lower, COMPONENT_PATTERNS, 25)
  let projectScore = countMatches(lower, PROJECT_PATTERNS, 28)
  let debugScore = countMatches(lower, DEBUG_PATTERNS, 32)
  let imageScore = countMatches(lower, IMAGE_PATTERNS, 30)
  let videoScore = countMatches(lower, VIDEO_PATTERNS, 34)
  let fileScore = attachments.length > 0 ? 90 : countMatches(lower, FILE_PATTERNS, 25)
  let researchScore = countMatches(lower, RESEARCH_PATTERNS, 18)
  let chatScore = 10

  const explicitComponent = hasAny(lower, COMPONENT_PATTERNS)
  const explicitProject = hasAny(lower, PROJECT_PATTERNS)
  const explicitDebug = hasAny(lower, DEBUG_PATTERNS)
  const explicitImage = hasAny(lower, IMAGE_PATTERNS)
  const explicitVideo = hasAny(lower, VIDEO_PATTERNS)
  const componentOnlySignal = hasAny(lower, NEGATIVE_PROJECT_FOR_COMPONENT)

  // Critical rule:
  // "Создай простой React компонент кнопки" => code, never project.
  if (explicitComponent && !explicitProject) {
    componentScore += 60
    projectScore = Math.max(0, projectScore - 40)
  }

  if (explicitComponent && componentOnlySignal) {
    componentScore += 45
    projectScore = Math.max(0, projectScore - 60)
  }

  // "Исправь ошибку в компоненте" => debug/code, not project unless explicit full project.
  if (explicitDebug && !explicitProject) {
    debugScore += 60
    projectScore = Math.max(0, projectScore - 60)
  }

  // Direct media tasks should win over generic words.
  if (explicitVideo) videoScore += 35
  if (explicitImage && !explicitVideo) imageScore += 35

  // Landing page/site/project must use Project Builder.
  if (explicitProject && !explicitComponent) {
    projectScore += 45
  }

  const scores: IntentScores = {
    componentScore,
    projectScore,
    debugScore,
    imageScore,
    videoScore,
    fileScore,
    researchScore,
    chatScore,
  }

  const ranked = [
    ["debug", debugScore],
    ["video", videoScore],
    ["image", imageScore],
    ["file_analysis", fileScore],
    ["project", projectScore],
    ["code", componentScore],
    ["research", researchScore],
    ["chat", chatScore],
  ] as const

  // Extra hard overrides for the exact risky cases.
  if (componentScore > 0 && componentScore >= projectScore) {
    return {
      task: "code",
      smartTask: "code",
      confidence: 0.96,
      scores,
      reason: "Simple UI/component request detected. Returning code/component only.",
      shouldUseProjectBuilder: false,
      shouldReturnSingleComponent: true,
    }
  }

  if (debugScore > 0 && debugScore >= projectScore) {
    return {
      task: "debug",
      smartTask: "debug",
      confidence: 0.94,
      scores,
      reason: "Debug/fix request detected. Do not create a new project.",
      shouldUseProjectBuilder: false,
      shouldReturnSingleComponent: explicitComponent,
    }
  }

  if (videoScore > 0 && videoScore >= imageScore) {
    return {
      task: "video",
      smartTask: "video",
      confidence: 0.93,
      scores,
      reason: "Video generation request detected.",
      shouldUseProjectBuilder: false,
      shouldReturnSingleComponent: false,
    }
  }

  if (imageScore > 0) {
    return {
      task: "image",
      smartTask: "image",
      confidence: 0.92,
      scores,
      reason: "Image generation request detected.",
      shouldUseProjectBuilder: false,
      shouldReturnSingleComponent: false,
    }
  }

  if (fileScore > 0) {
    return {
      task: "file_analysis",
      smartTask: "file_analysis",
      confidence: 0.86,
      scores,
      reason: "File analysis request detected.",
      shouldUseProjectBuilder: false,
      shouldReturnSingleComponent: false,
    }
  }

  if (projectScore > 0) {
    return {
      task: "project",
      smartTask: "project",
      confidence: 0.9,
      scores,
      reason: "Explicit site/project/app request detected. Project Builder allowed.",
      shouldUseProjectBuilder: true,
      shouldReturnSingleComponent: false,
    }
  }

  const best = [...ranked].sort((a, b) => b[1] - a[1])[0]
  if (!best || best[1] < 18) {
    return {
      task: "chat",
      smartTask: "chat",
      confidence: 0.55,
      scores,
      reason: "Low confidence. Falling back to chat.",
      shouldUseProjectBuilder: false,
      shouldReturnSingleComponent: false,
    }
  }

  const smartTask = best[0] as SmartTaskType
  return {
    task: smartTask as AITaskType,
    smartTask,
    confidence: Math.min(0.88, best[1] / 100),
    scores,
    reason: `Highest score selected: ${smartTask}.`,
    shouldUseProjectBuilder: smartTask === "project",
    shouldReturnSingleComponent: smartTask === "code" && explicitComponent,
  }
}

export function needsHeavyJob(task: AITaskType) {
  return task === "image" || task === "video" || task === "project"
}

export function shouldReturnSingleComponent(prompt: string) {
  return detectTask(prompt).shouldReturnSingleComponent
}

export function routeHintForPrompt(prompt: string) {
  const detection = detectTask(prompt)
  if (detection.task === "code") {
    return "Return only the requested component/code. Do not create a full app, site, folder tree, package.json or project unless explicitly asked."
  }
  if (detection.task === "project") {
    return "Create a full project with file tree, files, package.json and commands."
  }
  if (detection.task === "debug") {
    return "Explain the cause, then provide the smallest safe fix. Do not create a new project."
  }
  if (detection.task === "image") return "Route to image generation."
  if (detection.task === "video") return "Route to video generation."
  return "Answer normally."
}

export const INTENT_TEST_CASES = [
  { prompt: "Создай простой React компонент кнопки", expected: "code" },
  { prompt: "Создай premium dashboard card компонент", expected: "code" },
  { prompt: "Создай landing page для Sovereign Hub", expected: "project" },
  { prompt: "Создай полный проект AI dashboard", expected: "project" },
  { prompt: "Исправь ошибку Maximum update depth exceeded", expected: "debug" },
  { prompt: "Сделай аву Sovereign Hub", expected: "image" },
  { prompt: "Сделай видео рекламу MALIK AI", expected: "video" },
] as const

export function runIntentSelfTest() {
  return INTENT_TEST_CASES.map((item) => {
    const detected = detectTask(item.prompt)
    return {
      ...item,
      actual: detected.task,
      ok: detected.task === item.expected,
      confidence: detected.confidence,
      scores: detected.scores,
      reason: detected.reason,
    }
  })
}

