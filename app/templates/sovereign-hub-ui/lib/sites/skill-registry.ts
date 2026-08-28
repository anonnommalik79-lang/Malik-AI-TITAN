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
    priority: 72,
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
