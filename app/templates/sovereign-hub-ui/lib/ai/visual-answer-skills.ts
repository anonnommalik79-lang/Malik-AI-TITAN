import { allowsAnswerPhotoHints, planReferenceVisuals, type ReferenceVisualPlan } from "./reference-visual-policy"

/**
 * Visual answer skills: the contracts of the photo pipeline that illustrates
 * chat answers (reference photos, never AI generation). Each skill names the
 * real code that keeps its contract; scripts/verify-visual-skills.mjs checks
 * the contracts on that code. Selection is deterministic (no model call) and
 * lazy: a greeting, code, maths or «только текст» selects nothing, so no
 * lookup, cache or gallery code runs for it.
 */

export type VisualSkillId =
  | "visual-intent"
  | "reference-photo-search"
  | "source-verification"
  | "inline-photo-rendering"
  | "visual-context-memory"
  | "mobile-visual-layout"
  | "visual-performance-recovery"

export type VisualSkill = { id: VisualSkillId; name: string; contract: string; implementedBy: readonly string[] }

export const VISUAL_ANSWER_SKILLS: readonly VisualSkill[] = [
  {
    id: "visual-intent",
    name: "Visual intent",
    contract: "Photos only for concrete people, places, objects and products; none for greetings, code, maths, checklists, text editing, uploads, generation requests or «без фото/только текст».",
    implementedBy: ["lib/ai/reference-visual-policy.ts#allowsAnswerPhotoHints", "lib/ai/reference-visual-policy.ts#planReferenceVisuals"],
  },
  {
    id: "reference-photo-search",
    name: "Reference photo search",
    contract: "Official catalogues and Wikimedia first, optional free providers after; one shared lookup per subject, bounded time, never image generation credits.",
    implementedBy: ["lib/media/client-reference-cache.ts", "app/api/chat/reference-images/route.ts", "lib/media/reference-catalog.ts"],
  },
  {
    id: "source-verification",
    name: "Source verification",
    contract: "Only HTTPS images from approved hosts; every photo keeps its real source page, author or organisation and licence when known; a photo credits the picture, not the text.",
    implementedBy: ["lib/media/reference-catalog.ts#isSafeVisualUrl", "lib/media/reference-catalog.ts#sanitizeReferenceImages", "lib/media/source-reference-photos.ts#sourceReferencePhoto"],
  },
  {
    id: "inline-photo-rendering",
    name: "Inline photo rendering",
    contract: "The photo stands with its own subject: one subject gets a large hero, several get a numbered editorial gallery (wide 01, pairs, wide 04) with captions and clickable sources; model-written image URLs stay off in chat.",
    implementedBy: ["components/sovereign/MalikMarkdown.tsx#editorial", "components/sovereign/MalikVisualGallery.tsx#MalikReferenceImages"],
  },
  {
    id: "visual-context-memory",
    name: "Visual context memory",
    contract: "«покажи их фото» resolves the subjects from the previous turn; history keeps only the answer text and its photo hints, so a restored chat finds the same photos again from the cache.",
    implementedBy: ["lib/ai/reference-visual-policy.ts#planReferenceVisuals", "lib/ai/answer-photo-hints.ts#parseAnswerPhotoHints"],
  },
  {
    id: "mobile-visual-layout",
    name: "Mobile visual layout",
    contract: "Phones keep the gallery: wide photos full width, pairs side by side, no horizontal scroll, no layout jump when a photo is missing.",
    implementedBy: ["components/sovereign/answer-blocks.css#malik-editorial"],
  },
  {
    id: "visual-performance-recovery",
    name: "Visual performance and recovery",
    contract: "Text first; the newest answer's first photo loads eagerly, others when near the viewport; a broken photo is replaced or dropped without an empty frame; lookups retry once when the network returns, never in a loop.",
    implementedBy: ["components/sovereign/MalikVisualGallery.tsx#MalikReferenceImages", "lib/media/client-reference-cache.ts#reportReferenceImageFailure"],
  },
]

export type VisualSkillContext = { question: string; previousQuestion?: string; previousAnswer?: string; hasAttachment?: boolean }

/** Which visual skills an answer to this question needs (none = no photo code runs). */
export function selectVisualSkills(context: VisualSkillContext): { plan: ReferenceVisualPlan | null; skills: VisualSkillId[] } {
  const question = context.question || ""
  const hasAttachment = Boolean(context.hasAttachment)
  const plan = planReferenceVisuals(question, context.previousQuestion || "", hasAttachment, context.previousAnswer || "")
  if (!plan && !allowsAnswerPhotoHints(question, hasAttachment)) return { plan: null, skills: [] }
  const skills: VisualSkillId[] = ["visual-intent", "reference-photo-search", "source-verification", "inline-photo-rendering", "mobile-visual-layout", "visual-performance-recovery"]
  if (context.previousQuestion) skills.push("visual-context-memory")
  return { plan, skills }
}

export function visualSkillById(id: VisualSkillId): VisualSkill | undefined {
  return VISUAL_ANSWER_SKILLS.find((skill) => skill.id === id)
}
