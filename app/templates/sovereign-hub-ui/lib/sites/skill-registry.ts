export type SiteSkillCategory =
  | "layout"
  | "components"
  | "accessibility"
  | "typography"
  | "motion"
  | "icons"
  | "commerce"
  | "dashboard"
  | "content"
  | "forms"

export type SiteSkill = {
  id: string
  name: string
  category: SiteSkillCategory
  source: string
  repo: string
  url: string
  role: string
  capabilities: string[]
  triggers: string[]
  /**
   * The part that actually changes the output. A skill name tells the planner
   * nothing; a concrete, checkable rule does. These are injected verbatim into
   * the planner prompt.
   */
  rules: string[]
  always?: boolean
  priority: number
}

// IMPORTANT: these repositories are reference sources, not runtime dependencies.
// Malik AI does not copy arbitrary repository code into generated sites. The
// skill engine extracts design/architecture constraints, then renders its own
// standalone HTML/CSS/JS deterministically.
export const SITE_SKILLS: SiteSkill[] = [
  {
    id: "tailwind-layout",
    name: "Responsive Layout System",
    category: "layout",
    source: "Tailwind CSS",
    repo: "tailwindlabs/tailwindcss",
    url: "https://github.com/tailwindlabs/tailwindcss",
    role: "Responsive spacing, breakpoints, grids and utility-first composition patterns.",
    capabilities: ["responsive-grid", "spacing-scale", "mobile-first", "container-system", "visual-rhythm"],
    triggers: ["responsive", "адаптив", "mobile", "телефон", "grid", "сетка", "layout"],
    always: true,
    rules: [
      "Mobile-first: every section must work at 360px before it works at 1440px.",
      "One spacing scale across the page; no ad-hoc margins.",
      "Grids collapse to a single column on small screens, never scroll sideways.",
    ],
    priority: 100,
  },
  {
    id: "radix-accessibility",
    name: "Accessible Interaction Primitives",
    category: "accessibility",
    source: "Radix Primitives",
    repo: "radix-ui/primitives",
    url: "https://github.com/radix-ui/primitives",
    role: "Keyboard-safe disclosure, dialog, menu, focus and interaction semantics.",
    capabilities: ["keyboard-nav", "aria", "focus-management", "dialogs", "menus", "accordion"],
    triggers: ["menu", "меню", "faq", "accordion", "modal", "dialog", "форма", "form"],
    always: true,
    rules: [
      "FAQ and menus are keyboard operable and announce their open state.",
      "Every interactive element has a visible focus style.",
      "Nothing conveys meaning by colour alone.",
    ],
    priority: 98,
  },
  {
    id: "shadcn-composition",
    name: "Product UI Composition",
    category: "components",
    source: "shadcn/ui",
    repo: "shadcn-ui/ui",
    url: "https://github.com/shadcn-ui/ui",
    role: "Clean product composition, cards, controls, section hierarchy and restrained states.",
    capabilities: ["cards", "buttons", "forms", "tabs", "section-composition", "product-ui"],
    triggers: ["saas", "startup", "product", "продукт", "сервис", "platform", "платформа"],
    always: true,
    rules: [
      "Cards, buttons and badges share one radius, one border and one shadow language.",
      "A section is a heading, a lead sentence and a consistent set of items — not a pile of variants.",
    ],
    priority: 96,
  },
  {
    id: "lucide-iconography",
    name: "Consistent Iconography",
    category: "icons",
    source: "Lucide",
    repo: "lucide-icons/lucide",
    url: "https://github.com/lucide-icons/lucide",
    role: "Consistent lightweight icon language and icon sizing rules.",
    capabilities: ["icon-scale", "semantic-icons", "stroke-consistency"],
    triggers: ["icon", "икон", "feature", "преимуществ", "dashboard", "панель"],
    always: true,
    rules: [
      "Icons are one stroke weight and one size per context.",
      "An icon supports a label; it never replaces one.",
    ],
    priority: 90,
  },
  {
    id: "motion-interactions",
    name: "Motion & Micro-interactions",
    category: "motion",
    source: "Motion",
    repo: "motiondivision/motion",
    url: "https://github.com/motiondivision/motion",
    role: "Subtle entrance motion, hover feedback and reduced-motion-safe interactions.",
    capabilities: ["entrance-motion", "hover-feedback", "spring-feel", "reduced-motion"],
    triggers: ["animation", "анимац", "motion", "interactive", "интерактив", "premium", "премиум"],
    always: true,
    rules: [
      "Motion is under 300ms and only on hover, focus and disclosure.",
      "Nothing moves on load that would delay reading the first screen.",
    ],
    priority: 88,
  },
  {
    id: "flowbite-marketing",
    name: "Marketing Section Patterns",
    category: "content",
    source: "Flowbite",
    repo: "themesberg/flowbite",
    url: "https://github.com/themesberg/flowbite",
    role: "Marketing-page section ordering, CTA structure, nav and content-density patterns.",
    capabilities: ["hero", "cta", "navbar", "pricing", "testimonials", "faq"],
    triggers: ["landing", "лендинг", "pricing", "цены", "тариф", "cta", "отзыв", "testimonial"],
    rules: [
      "Marketing sections follow claim → evidence → action.",
      "Testimonials and logos appear only if the request supplied real ones.",
    ],
    priority: 84,
  },
  {
    id: "daisy-theme-system",
    name: "Theme Token System",
    category: "typography",
    source: "daisyUI",
    repo: "saadeghi/daisyui",
    url: "https://github.com/saadeghi/daisyui",
    role: "Theme tokens, contrast pairs, component state colors and coherent visual scales.",
    capabilities: ["theme-tokens", "contrast", "surface-scale", "state-colors", "radius-scale"],
    triggers: ["theme", "тема", "color", "цвет", "dark", "black", "light", "brand"],
    rules: [
      "Theme is one coherent palette derived from the subject, applied to every surface.",
      "Accent is used for action, never for decoration.",
    ],
    priority: 82,
  },
  {
    id: "chakra-forms",
    name: "Accessible Form UX",
    category: "forms",
    source: "Chakra UI",
    repo: "chakra-ui/chakra-ui",
    url: "https://github.com/chakra-ui/chakra-ui",
    role: "Readable form states, labels, validation hierarchy and touch-friendly controls.",
    capabilities: ["form-layout", "validation", "labels", "touch-targets", "feedback-states"],
    triggers: ["form", "форма", "contact", "контакт", "checkout", "регистрац", "login", "вход"],
    rules: [
      "Every field has a label, a hint where useful, and a visible error state.",
      "Submit states are explicit: idle, busy, done, failed.",
    ],
    priority: 78,
  },
  {
    id: "mantine-dashboard",
    name: "Application & Dashboard Layout",
    category: "dashboard",
    source: "Mantine",
    repo: "mantinedev/mantine",
    url: "https://github.com/mantinedev/mantine",
    role: "Dense application layouts, dashboard cards, data hierarchy and responsive shells.",
    capabilities: ["app-shell", "dashboard-grid", "metrics", "data-density", "responsive-panels"],
    triggers: ["dashboard", "панель", "admin", "crm", "analytics", "аналит", "metrics", "метрик"],
    rules: [
      "Data sections lead with the number, then the label, then the context.",
      "Dense layouts keep an 8px rhythm and stay scannable in one pass.",
    ],
    priority: 76,
  },
  {
    id: "mui-enterprise",
    name: "Enterprise Information Architecture",
    category: "components",
    source: "Material UI",
    repo: "mui/material-ui",
    url: "https://github.com/mui/material-ui",
    role: "Enterprise information hierarchy, tables, dense controls and predictable navigation.",
    capabilities: ["enterprise-nav", "tables", "information-hierarchy", "dense-controls"],
    triggers: ["enterprise", "b2b", "корпорат", "table", "таблиц", "erp", "admin"],
    rules: [
      "Navigation is predictable and shallow; the user always knows where they are.",
      "Tables and dense controls keep row height and alignment consistent.",
    ],
    priority: 72,
  },
  {
    id: "vercel-geist-craft",
    name: "Product Landing Craft",
    category: "layout",
    source: "Geist / Vercel",
    repo: "vercel/geist-font",
    url: "https://github.com/vercel/geist-font",
    role: "Restraint, precise spacing and confident typographic scale used by top developer products.",
    capabilities: ["type-scale", "restraint", "whitespace", "precision"],
    triggers: ["saas", "landing", "лендинг", "продукт", "startup", "стартап", "developer", "tech"],
    rules: [
      "Hero headline 6-11 words, one idea, no slogan stacking.",
      "One accent colour only; everything else is neutral.",
      "Whitespace above decoration: no gradients or glows that do not encode meaning.",
    ],
    priority: 94,
  },
  {
    id: "stripe-clarity",
    name: "Commercial Trust Structure",
    category: "content",
    source: "Stripe docs patterns",
    repo: "stripe/stripe-docs-patterns",
    url: "https://stripe.com",
    role: "Explaining a commercial product so a buyer understands price, value and next step without friction.",
    capabilities: ["pricing-clarity", "objection-handling", "proof", "conversion-path"],
    triggers: ["pricing", "цена", "тариф", "оплат", "payment", "подписк", "billing", "commerce", "магаз"],
    rules: [
      "Pricing shows what is included, not adjectives; every plan lists concrete bullets.",
      "Each claim is followed by the evidence for it, or it is cut.",
      "One primary action per screen; secondary actions never compete visually.",
    ],
    priority: 90,
  },
  {
    id: "linear-hierarchy",
    name: "Dark Product Hierarchy",
    category: "typography",
    source: "Linear-style product UI",
    repo: "linear/design-principles",
    url: "https://linear.app",
    role: "Dark interfaces that stay legible: layered surfaces, tight rhythm and deliberate contrast steps.",
    capabilities: ["dark-ui", "contrast-steps", "surface-layers", "rhythm"],
    triggers: ["dark", "темн", "черн", "dashboard", "панел", "app", "интерфейс", "product"],
    rules: [
      "Dark theme uses at least three surface levels, never one flat black.",
      "Body text stays at or above 4.5:1 contrast; muted text never drops below 3:1.",
      "Section rhythm is one spacing scale reused, not per-section improvisation.",
    ],
    priority: 88,
  },
  {
    id: "content-truth",
    name: "Honest Copy Discipline",
    category: "content",
    source: "Malik editorial rules",
    repo: "malik-ai/content-rules",
    url: "https://malikaiworld.world",
    role: "Copy that says something specific and never fabricates proof.",
    capabilities: ["specific-copy", "no-fabrication", "localisation"],
    triggers: [],
    rules: [
      "Never invent customer names, logos, review counts, awards or certifications.",
      "Prefer a real detail from the request over an impressive-sounding generality.",
      "Write in the language of the request, including section labels and buttons.",
    ],
    always: true,
    priority: 96,
  },
  {
    id: "web-vitals",
    name: "Performance And Semantics",
    category: "accessibility",
    source: "web.dev vitals guidance",
    repo: "GoogleChrome/web-vitals",
    url: "https://github.com/GoogleChrome/web-vitals",
    role: "Semantic structure and a page that stays fast and stable while it loads.",
    capabilities: ["semantics", "landmarks", "no-layout-shift", "single-h1"],
    triggers: [],
    rules: [
      "Exactly one h1; every section has a heading in order.",
      "Landmarks are real elements: header, nav, main, section, footer.",
      "Nothing depends on an external asset to render the first screen.",
    ],
    always: true,
    priority: 92,
  },
]

function normalize(value: string) {
  return value.toLowerCase().replace(/ё/g, "е")
}

function scoreSkill(skill: SiteSkill, text: string) {
  if (skill.always) return skill.priority + 100
  let score = skill.priority
  for (const trigger of skill.triggers) {
    if (text.includes(normalize(trigger))) score += 35
  }
  return score
}

export function selectSiteSkills(prompt: string, template = "") {
  const text = normalize(`${prompt} ${template}`)
  const ranked = SITE_SKILLS
    .map((skill) => ({ skill, score: scoreSkill(skill, text) }))
    .sort((a, b) => b.score - a.score)

  const core = ranked.filter(({ skill }) => skill.always)
  const contextual = ranked.filter(({ skill }) => !skill.always).slice(0, 5)
  const selected = [...core, ...contextual]

  return Array.from(new Map(selected.map(({ skill }) => [skill.id, skill])).values()).slice(0, 9)
}

export function publicSkillSources(skills: SiteSkill[]) {
  return skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    category: skill.category,
    source: skill.source,
    repo: skill.repo,
    url: skill.url,
    role: skill.role,
    capabilities: skill.capabilities,
  }))
}
