export type MalikTemplateMode = "chat" | "website" | "app" | "business" | "image" | "video" | "code" | "data"

export type MalikTemplateCategory =
  | "AI & SaaS"
  | "Финансы"
  | "E-commerce"
  | "Недвижимость"
  | "Luxury & Fashion"
  | "Рестораны"
  | "Travel"
  | "Health"
  | "Portfolio & Agency"
  | "Tech & Web3"

export type MalikTemplate = {
  id: string
  title: string
  description: string
  category: MalikTemplateCategory
  mode: MalikTemplateMode
  preview: string
  prompt: string
  featured: boolean
  hero: string
  visual: number
}

type TemplateSeed = readonly [id: string, title: string, description: string, hero: string]
type TemplateGroup = { category: MalikTemplateCategory; templates: readonly TemplateSeed[] }

const PHOTO_IDS = [
  "photo-1460925895917-afdab827c52f","photo-1556761175-b413da4baf72","photo-1516321318423-f06f85e504b3","photo-1456513080510-7bf3a84b82f8","photo-1589829545856-d10d557cf95f","pexels:3182773","photo-1542744173-8e7e53415bb0","photo-1522202176988-66273c2fd55f","photo-1517245386807-bb43f82c33c4","photo-1499750310107-5fef28a66643",
  "photo-1523240795612-9a054b0db644","photo-1522071820081-009f0129c71c","photo-1454165804606-c3d57bc86b40","photo-1498050108023-c5249f4df085","photo-1555066931-4365d14bab8c","photo-1515879218367-8466d910aaa4","photo-1504384308090-c894fdcc538d","photo-1518770660439-4636190af475","photo-1558494949-ef010cbdcc31","photo-1563986768609-322da13575f3",
  "pexels:3861969","photo-1497366754035-f200968a6e72","photo-1487058792275-0ad4aaf24ca7","photo-1560518883-ce09059eeffa","photo-1507003211169-0a1dd7228f2d","photo-1503376780353-7e6692767b70","photo-1492144534655-ae79c964c9d7","photo-1504674900247-0877df9cc836","photo-1523275335684-37898b6baf30","photo-1492684223066-81342ee5ff30",
  "photo-1551288049-bebda4e38f71","photo-1556742049-0cfed4f6a45d","photo-1451187580459-43490279c0fa","pexels:3182812","photo-1625246333195-78d9c38ad449","photo-1576091160399-112ba8d25d1d","photo-1540575467063-178a50c2df87","pexels:1181244","photo-1500530855697-b586d89ba3ee","photo-1469854523086-cc02fe5d8800",
  "photo-1534528741775-53994a69daeb","pexels:1181298","photo-1541961017774-22349e4a1262","photo-1485846234645-a62644f84728","pexels:1181354","pexels:3861958","photo-1506905925346-21bda4d32df4","pexels:1181675","photo-1518005020951-eccb494ad742","photo-1472214103451-9374bd1c798e",
  "pexels:3861972","photo-1536440136628-849c177e76a1","pexels:3861964","photo-1614850523459-c2f4c699c52e","pexels:3861976","photo-1446776811953-b23d57bd21aa","photo-1592210454359-9043f067919b","pexels:3182811","pexels:3183150","pexels:3183197",
  "photo-1639762681485-074b7f938ba0","photo-1558618666-fcd25c85cd64","photo-1504639725590-34d0984388bd","pexels:3184418","photo-1512941937669-90a1b58e7e9c","photo-1526374965328-7f61d4dc18c5","photo-1531297484001-80022131f5a1","photo-1496181133206-80ce9b88a853","photo-1531482615713-2afd69097998","photo-1519389950473-47ba0277781c",
  "photo-1551836022-d5d88e9218df","pexels:3184436","pexels:3184454","photo-1565008576549-57569a49371d","pexels:3184465","photo-1461896836934-ffe607ba8211","photo-1574717024653-61fd2cf4d44d","pexels:3184306","photo-1497215728101-856f4ea42174","photo-1516321165247-4aa89a48be28",
  "photo-1552664730-d307ca884978","photo-1521737711867-e3b97375f902","photo-1551434678-e076c223a692","photo-1553877522-43269d4ea984","photo-1497366811353-6870744d04b2","photo-1521791136064-7986c2920216","photo-1560179707-f14e90ef3623","photo-1560250097-0b93528c311a","photo-1573496359142-b8d87734a5a2","photo-1573496799652-408c2ac9fe98",
  "photo-1580489944761-15a19d654956","photo-1524504388940-b1c1722653e1","photo-1544005313-94ddf0286df2","photo-1517841905240-472988babdf9","photo-1503023345310-bd7c1de61c7d","photo-1515886657613-9f3515b0c78f","photo-1490481651871-ab68de25d43d","pexels:3184287","photo-1521295121783-8a321d551ad2","photo-1500534314209-a25ddb2bd429"
] as const

const FEATURED_IDS = new Set([
  "neural-command","agent-os","apex-finance","vault-bank","atelier-store","aurelia-jewelry","estate-noir","horizon-villas","elan-maison","noir-atelier","ember","omakase","atlas-travel","santorini-escape","vital-clinic","derma-atelier","studio-mono","motion-lab","dev-grid","cyber-shield"
])

const GROUPS: readonly TemplateGroup[] = [
  { category: "AI & SaaS", templates: [
    ["neural-command","Neural Command","Премиальный запуск AI-платформы с мощным hero, продуктовым demo и CTA.","AI that runs the work"],
    ["agent-os","AgentOS","Сайт для AI-агентов, автоматизаций и автономных workflow.","Deploy an AI workforce"],
    ["signal-ai","Signal AI","Минималистичный AI-сервис для аналитики, сигналов и решений.","Turn noise into signal"],
    ["orbit-saas","Orbit SaaS","Чистый SaaS-сайт с dashboard preview, pricing и social proof.","Everything moves in one orbit"],
    ["vector-intelligence","Vector Intelligence","Технологичный сайт для data/ML продукта с enterprise-подачей.","Intelligence at production scale"],
    ["blackbox-studio","Blackbox Studio","Тёмный launch-сайт для генеративного AI и creative tools.","Create beyond the prompt"],
    ["atlas-copilot","Atlas Copilot","B2B AI copilot с workflows, integrations и case studies.","A copilot for serious teams"],
    ["nova-automate","Nova Automate","Автоматизация процессов с визуальными flows и быстрым onboarding.","Automate what slows you down"],
    ["quantum-analytics","Quantum Analytics","AI analytics product с KPI, forecasting и enterprise trust.","See the next move sooner"],
    ["current-cloud","Current Cloud","Современный cloud AI SaaS с сильной editorial-типографикой.","Cloud software, finally clear"]
  ]},
  { category: "Финансы", templates: [
    ["apex-finance","Apex Finance","Финансовый сайт уровня private banking с премиальной типографикой.","Capital with conviction"],
    ["ledger-prime","Ledger Prime","B2B fintech платформа для платежей, отчётности и контроля.","Finance without friction"],
    ["vault-bank","VaultBank","Digital banking landing с trust-блоками и premium product UI.","Banking built around you"],
    ["capital-os","CapitalOS","Инвестиционный SaaS с market data, портфелями и аналитикой.","Operate capital intelligently"],
    ["quorum-advisory","Quorum Advisory","Бутик-консалтинг для капитала, M&A и стратегических сделок.","Advice for decisive capital"],
    ["fintech-pulse","Fintech Pulse","Современный fintech продукт с интерактивной dashboard-подачей.","Money moves. Stay ahead."],
    ["hedge-lab","HedgeLab","Quant/hedge fund сайт с data-driven эстетикой и performance blocks.","Research. Risk. Return."],
    ["invest-iq","InvestIQ","Инвестиционная аналитика с понятным onboarding и premium UI.","Invest with a sharper edge"],
    ["crypto-ledger","Crypto Ledger","Web3 finance platform с институциональным визуальным языком.","Digital assets, institutional grade"],
    ["cfo-suite","CFO Suite","Финансовая операционная система для CFO и команд.","Your finance team, upgraded"]
  ]},
  { category: "E-commerce", templates: [
    ["atelier-store","Atelier Store","Editorial e-commerce для fashion и premium lifestyle брендов.","Objects worth keeping"],
    ["mono-goods","Mono Goods","Минималистичный магазин предметов, техники и дизайна.","Less noise. Better objects."],
    ["aurelia-jewelry","Aurelia Jewelry","Luxury jewelry storefront с крупными product visuals.","Made to be remembered"],
    ["scent-house","Scent House","Парфюмерный магазин с атмосферной editorial-подачей.","A signature in the air"],
    ["sneaker-lab","Sneaker Lab","Streetwear/sneaker commerce с динамичной product grid.","Built for the next drop"],
    ["furniture-maison","Furniture Maison","Премиальный интерьерный магазин с room stories и каталогом.","Live with better design"],
    ["skincare-atelier","Skincare Atelier","Beauty commerce с чистой medical-luxury эстетикой.","Clinical care, beautifully made"],
    ["tech-market","Tech Market","Современный electronics storefront с specs и comparisons.","Future-ready by default"],
    ["watch-bureau","Watch Bureau","Luxury watch shop с акцентом на детали и heritage.","Time, engineered beautifully"],
    ["gourmet-market","Gourmet Market","Премиальный food market с rich photography и curated sets.","Taste, carefully curated"]
  ]},
  { category: "Недвижимость", templates: [
    ["estate-noir","Estate Noir","Luxury real estate с cinematic hero и curated listings.","Property, elevated"],
    ["horizon-villas","Horizon Villas","Виллы и курортная недвижимость с панорамными визуалами.","Own the horizon"],
    ["arc-residence","Arc Residence","Архитектурный девелопмент с floor plans и premium storytelling.","A new standard of living"],
    ["skyline-realty","Skyline Realty","Городская недвижимость с поиском, картой и agent profiles.","Find your place in the city"],
    ["alpine-retreat","Alpine Retreat","Шале, resort residences и mountain luxury.","Above ordinary"],
    ["riviera-homes","Riviera Homes","Coastal property showcase с lifestyle-first подачей.","Live by the water"],
    ["urban-loft","Urban Loft","Современные квартиры и lofts с brutal minimal design.","City living, refined"],
    ["palm-estates","Palm Estates","Премиальные дома и виллы с warm luxury эстетикой.","Private living, perfected"],
    ["nordic-house","Nordic House","Скандинавская архитектура и property showcase.","Space with intention"],
    ["architectura","Architectura","Real estate + architecture studio для landmark проектов.","Build what lasts"]
  ]},
  { category: "Luxury & Fashion", templates: [
    ["elan-maison","Élan Maison","Luxury fashion house с editorial главной и seasonal collection.","Modern luxury, without noise"],
    ["noir-atelier","Noir Atelier","Тёмный couture-сайт с большой типографикой и fashion film feel.","Cut from a darker cloth"],
    ["maison-aure","Maison Aure","Светлый quiet-luxury бренд с refined product storytelling.","Quietly exceptional"],
    ["mode-26","MODE 26","Fashion campaign site с bold grid и magazine layout.","The season starts here"],
    ["velour","Velour","Premium accessories/lifestyle brand с tactile visual language.","Made to be felt"],
    ["monochrome","Monochrome","Black-and-white fashion brand с gallery-driven layout.","Nothing extra"],
    ["lux-cars","LUX Cars","Премиальный automotive showroom с cinematic hero.","Performance, presented properly"],
    ["haute-jewelry","Haute Jewelry","High jewelry showcase с editorial close-ups и appointments.","Rare by design"],
    ["signature-watches","Signature Watches","Swiss-inspired watch brand с heritage sections.","Precision becomes character"],
    ["art-house","Art House","Gallery/collectible design store с museum-like композицией.","Collect what moves you"]
  ]},
  { category: "Рестораны", templates: [
    ["ember","EMBER","Fine dining сайт с cinematic food photography и reservation CTA.","Fire, craft, flavor"],
    ["omakase","OMAKASE","Японский tasting-menu сайт с минимализмом и атмосферой.","Trust the chef"],
    ["riviera-bistro","Riviera Bistro","Средиземноморский ресторан с lively editorial стилем.","A table by the coast"],
    ["black-truffle","Black Truffle","Dark luxury restaurant с menu storytelling и events.","Dining after dark"],
    ["caffe-roma","Caffè Roma","Итальянское кафе с warm typography и mobile-first menu.","Espresso. Pasta. Roma."],
    ["maison-patisserie","Maison Pâtisserie","Премиальная кондитерская с delicate product showcase.","Made by hand, gone too fast"],
    ["rooftop-88","Rooftop 88","Городской rooftop bar с nightlife визуалом и bookings.","Dinner above the city"],
    ["nordic-table","Nordic Table","Скандинавский ресторан с природной и чистой эстетикой.","Simple ingredients, exact craft"],
    ["steak-house","Steak House","Премиальный steakhouse с bold typography и reservation flow.","Prime cuts. No compromise."],
    ["wine-cellar","Wine Cellar","Wine bar/restaurant с curated list, tastings и memberships.","Drink something worth remembering"]
  ]},
  { category: "Travel", templates: [
    ["atlas-travel","Atlas Travel","Премиальная travel agency с destinations, itineraries и booking.","Go somewhere worth the story"],
    ["santorini-escape","Santorini Escape","Luxury island hotel/travel site с bright cinematic imagery.","Wake up above the Aegean"],
    ["nomad-club","Nomad Club","Modern travel membership для remote professionals.","Work from somewhere better"],
    ["alpine-journey","Alpine Journey","Mountain travel and lodge experience с cinematic routes.","Take the road higher"],
    ["safari-reserve","Safari Reserve","Luxury safari lodge с immersive nature storytelling.","Wild, without compromise"],
    ["island-house","Island House","Boutique resort website с calm editorial layout.","Your private pace"],
    ["tokyo-guide","Tokyo Guide","City guide + booking experience с modern editorial cards.","Tokyo, properly curated"],
    ["desert-lodge","Desert Lodge","Desert resort с atmospheric photography и premium booking.","Silence looks good here"],
    ["yacht-club","Yacht Club","Yacht charter и private marine experiences.","Own the open water"],
    ["air-journey","Air Journey","Premium aviation/private travel service.","Travel without the terminal"]
  ]},
  { category: "Health", templates: [
    ["vital-clinic","Vital Clinic","Современная medical clinic с trust, doctors и booking.","Care, made clear"],
    ["derma-atelier","Derma Atelier","Premium dermatology/beauty clinic с clean luxury визуалом.","Science for better skin"],
    ["dental-one","Dental One","High-end dental practice с прозрачными услугами и записью.","A better reason to smile"],
    ["forma-fitness","Forma Fitness","Premium gym/fitness club с memberships и trainer profiles.","Built for your strongest form"],
    ["calm-therapy","Calm Therapy","Mental wellness/therapy сайт с мягкой editorial подачей.","A quieter place to begin"],
    ["longevity-lab","Longevity Lab","Longevity/diagnostics clinic с data-driven premium design.","Health, measured forward"],
    ["medica","Medica","Multi-specialty healthcare platform с doctors и appointments.","Healthcare without the maze"],
    ["wellness-house","Wellness House","Spa, recovery and wellness membership experience.","Recover beautifully"],
    ["sports-lab","Sports Lab","Performance medicine и sports science с metrics-first UI.","Train with better data"],
    ["pediatrics-care","Pediatrics Care","Современная детская клиника с friendly, clean design.","Care parents can trust"]
  ]},
  { category: "Portfolio & Agency", templates: [
    ["studio-mono","Studio Mono","Minimal creative agency portfolio с большими кейсами.","Work that needs no decoration"],
    ["north-creative","North Creative","Brand agency с punchy art direction и case studies.","Brands with a point of view"],
    ["brutalist-portfolio","Brutalist Portfolio","Экспериментальное портфолио дизайнера с raw typography.","Make it impossible to ignore"],
    ["motion-lab","Motion Lab","Motion/3D studio с reels, transitions и immersive projects.","Ideas in motion"],
    ["architect-portfolio","Architect Portfolio","Архитектор/студия с project-led grid и plans.","Spaces with a thesis"],
    ["photo-journal","Photo Journal","Фотографическое портфолио с magazine-style narrative.","Stories, framed"],
    ["brand-bureau","Brand Bureau","Identity studio с strategy, systems и launch cases.","Identity with backbone"],
    ["product-studio","Product Studio","Digital product agency с UI previews и measurable outcomes.","Products people keep using"],
    ["type-foundry","Type Foundry","Typography/type design studio с experimental specimen pages.","Letters with character"],
    ["director-reel","Director Reel","Film director/production portfolio с cinematic showreel.","Film first"]
  ]},
  { category: "Tech & Web3", templates: [
    ["dev-grid","DevGrid","Developer platform с docs, API examples и enterprise CTA.","Build faster at the edge"],
    ["api-forge","API Forge","API-first infrastructure startup с technical product storytelling.","Infrastructure developers enjoy"],
    ["cyber-shield","CyberShield","Cybersecurity SaaS с dark enterprise aesthetics.","Security without blind spots"],
    ["data-cloud","DataCloud","Data infrastructure platform с product diagrams и benchmarks.","Move data like it matters"],
    ["chain-os","ChainOS","Blockchain infrastructure site с institutional design.","The operating layer for onchain"],
    ["wallet-x","Wallet X","Crypto wallet experience с clean product-first landing.","Your assets. Your control."],
    ["infra-stack","InfraStack","Cloud/devops platform с architecture diagrams и trust blocks.","Infrastructure that stays out of the way"],
    ["quantum-labs","Quantum Labs","Deep-tech research company с futuristic editorial design.","Compute beyond the obvious"],
    ["robotics-one","Robotics One","Robotics company с hardware hero и industrial visuals.","Machines that move work forward"],
    ["space-systems","Space Systems","Aerospace/space-tech startup с mission-driven storytelling.","Engineering beyond Earth"]
  ]}
]

function previewUrl(photoId: string) {
  if (photoId.startsWith("pexels:")) {
    const id = photoId.slice("pexels:".length)
    return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1200&h=760&fit=crop`
  }
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1200&h=760&q=88`
}

export const MALIK_TEMPLATES: MalikTemplate[] = GROUPS.flatMap((group, groupIndex) =>
  group.templates.map(([id, title, description, hero], templateIndex) => ({
    id,
    title,
    description,
    category: group.category,
    mode: "website" as const,
    preview: previewUrl(PHOTO_IDS[groupIndex * 10 + templateIndex]),
    prompt: `Открой конструктор сайтов Malik AI и создай премиальный production-ready сайт по шаблону «${title}». ${description} Визуальное направление: ${hero}. Сделай полноценную адаптивную структуру, сильную типографику, реальные секции продукта, mobile-first UX и полностью редактируемый результат без дешёвого стеклянного или шаблонного вида.`,
    featured: FEATURED_IDS.has(id),
    hero,
    visual: (groupIndex * 3 + templateIndex) % 10,
  })),
)

export const FEATURED_MALIK_TEMPLATES = MALIK_TEMPLATES.filter((template) => template.featured)
export const HOME_MALIK_TEMPLATES = [...FEATURED_MALIK_TEMPLATES, ...MALIK_TEMPLATES.filter((template) => !template.featured)].slice(0, 40)
export const MALIK_TEMPLATE_CATEGORIES: readonly MalikTemplateCategory[] = GROUPS.map((group) => group.category)

export function targetViewForTemplate(template: MalikTemplate): string {
  switch (template.mode) {
    case "chat": return "home"
    case "website": return "website-generation"
    case "app":
    case "data": return "dashboard-generation"
    case "business": return "business-command-center"
    case "image": return "photo-generation"
    case "video": return "video-generation"
    case "code": return "code-generation"
  }
}
