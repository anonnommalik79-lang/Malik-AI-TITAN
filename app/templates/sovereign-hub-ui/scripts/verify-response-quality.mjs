import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

const moduleCache = new Map()
function loadTypeScriptModule(file) {
  const absolute = path.resolve(file)
  if (moduleCache.has(absolute)) return moduleCache.get(absolute).exports

  const source = fs.readFileSync(absolute, "utf8")
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  const box = { exports: {} }
  moduleCache.set(absolute, box)

  const resolveTs = (base) => {
    const candidates = [base, base + ".ts", base + ".tsx", path.join(base, "index.ts"), path.join(base, "index.tsx")]
    return candidates.find((candidate) => fs.existsSync(candidate))
  }

  const localRequire = (name) => {
    if (name.startsWith("@/")) {
      const target = resolveTs(path.resolve(process.cwd(), name.slice(2)))
      if (!target) throw new Error(`cannot resolve app alias ${name}`)
      return loadTypeScriptModule(target)
    }
    if (name.startsWith(".")) {
      const target = resolveTs(path.resolve(path.dirname(absolute), name))
      if (!target) throw new Error(`cannot resolve relative import ${name} from ${absolute}`)
      return loadTypeScriptModule(target)
    }
    throw new Error(`unexpected external require(${name})`)
  }

  new Function("require", "module", "exports", js)(localRequire, box, box.exports)
  return box.exports
}

const intelligence = loadTypeScriptModule("lib/ai/response-intelligence.ts")
const {
  MALIK_RESPONSE_FEATURES,
  analyzeResponseRequest,
  buildMalikResponseSystemPrompt,
  cleanModelText,
  selectedResponseFeatures,
} = intelligence

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures += 1
    console.error(`  FAIL ${name}\n       ${error.message.split("\n")[0]}`)
  }
}

console.log("\nMALIK Answer DNA")

check("contains exactly 80 independently named response modules", () => {
  assert.equal(MALIK_RESPONSE_FEATURES.length, 80)
  assert.equal(new Set(MALIK_RESPONSE_FEATURES.map((feature) => feature.id)).size, 80)
  assert.equal(new Set(MALIK_RESPONSE_FEATURES.map((feature) => feature.name)).size, 80)
  for (const feature of MALIK_RESPONSE_FEATURES) {
    assert.ok(feature.instruction.length > 40, `${feature.id} is a name without a behaviour`)
    assert.ok(feature.signals.length > 0, `${feature.id} can never fire`)
  }
})

check("twenty of them are about the conversation, not the answer", () => {
  const conversational = [
    "no-flattery", "admit-ignorance", "one-question-max", "turn-length-mirror", "skip-the-known",
    "graceful-refusal", "name-use", "humour-match", "small-talk-exit", "fix-before-explain",
    "no-grovelling", "single-path", "time-honesty", "correction-grace", "stand-ground",
    "peer-register", "local-reality", "mixed-language", "promise-ledger", "repair-not-repeat",
  ]
  assert.equal(conversational.length, 20)
  const ids = new Set(MALIK_RESPONSE_FEATURES.map((feature) => feature.id))
  for (const id of conversational) assert.ok(ids.has(id), `missing conversation module: ${id}`)
})

/* ------------------------------------- reading the person, not just the task */

const signalsFor = (prompt) => new Set(analyzeResponseRequest(prompt).signals)

check("hears frustration in swearing, repetition and shouting", () => {
  assert.ok(signalsFor("опять не работает блять").has("frustrated"))
  assert.ok(signalsFor("СКОЛЬКО МОЖНО ЭТО ИСПРАВЛЯТЬ").has("frustrated"))
  assert.ok(signalsFor("ничего не работает").has("frustrated"))
  assert.equal(signalsFor("как устроен рендер в react").has("frustrated"), false)
  // An acronym is not a raised voice.
  assert.equal(signalsFor("API").has("frustrated"), false)
  // \b never forms a boundary beside a Cyrillic letter, so every Russian
  // pattern here has to be guarded by hand. This is the regression test.
  assert.ok(signalsFor("да блять").has("frustrated"))
  assert.ok(signalsFor("хрен пойми что").has("frustrated"))
})

check("a greeting on its own is still a greeting", () => {
  assert.ok(signalsFor("привет").has("conversation"))
  assert.ok(signalsFor("сәлем").has("conversation"))
  // …but a word that merely starts with one is not.
  assert.equal(signalsFor("history of react rendering").has("conversation"), false)
})

check("puts the fix before the explanation for a frustrated person", () => {
  const prompt = buildMalikResponseSystemPrompt({ prompt: "опять не работает, сколько можно" })
  assert.match(prompt, /Fix First/)
  assert.match(prompt, /frustrated person gets the fix in the first line/)
  assert.match(prompt, /No Grovelling/)
})

check("hears a deadline and stops offering options", () => {
  assert.ok(signalsFor("срочно надо до завтра").has("urgent"))
  assert.ok(signalsFor("горит дедлайн, что делать").has("urgent"))
  assert.equal(signalsFor("какая погода сегодня").has("urgent"), false)
  assert.match(buildMalikResponseSystemPrompt({ prompt: "срочно, дедлайн, что выбрать" }), /Single Path/)
})

check("hears a correction and neither grovels nor caves", () => {
  assert.ok(signalsFor("ты не прав, я же просил другое").has("correction"))
  assert.ok(signalsFor("ты перепутал").has("correction"))
  assert.equal(signalsFor("что-то не так с кодом").has("correction"), false)
  const prompt = buildMalikResponseSystemPrompt({ prompt: "ты не прав, я же говорил" })
  assert.match(prompt, /Correction Grace/)
  assert.match(prompt, /Grounded Disagreement/)
})

check("answers a greeting as a greeting, not as a menu", () => {
  assert.ok(signalsFor("привет").has("conversation"))
  assert.ok(signalsFor("сәлем, как дела").has("conversation"))
  assert.match(buildMalikResponseSystemPrompt({ prompt: "привет, как дела" }), /Small Talk Exit/)
})

check("knows the user is in Kazakhstan, not San Francisco", () => {
  assert.ok(signalsFor("как открыть ИП в Казахстане").has("local"))
  assert.ok(signalsFor("сколько стоит в тенге").has("local"))
  assert.ok(signalsFor("оплата через kaspi").has("local"))
  assert.equal(signalsFor("как открыть счёт в банке").has("local"), false)
  assert.match(buildMalikResponseSystemPrompt({ prompt: "как принимать оплату в Казахстане через kaspi" }), /Local Reality/)
})

check("drops the basics for someone who does this for a living", () => {
  assert.ok(signalsFor("я разработчик, не объясняй основы").has("expert"))
  assert.equal(signalsFor("объясни что такое api").has("expert"), false)
  assert.match(buildMalikResponseSystemPrompt({ prompt: "я разработчик, нужен способ кешировать запросы" }), /Peer Register/)
})

check("an ordinary turn still gets the always-on conversation rules", () => {
  const prompt = buildMalikResponseSystemPrompt({ prompt: "Что такое рендер?" })
  assert.match(prompt, /No Flattery/)
  assert.match(prompt, /Honest Ignorance/)
  assert.match(prompt, /One Question Rule/)
})

check("a calm turn is not told how to handle an angry one", () => {
  const prompt = buildMalikResponseSystemPrompt({ prompt: "Что такое рендер?" })
  for (const absent of ["Fix First", "Single Path", "Correction Grace", "Peer Register", "Local Reality"]) {
    assert.doesNotMatch(prompt, new RegExp(absent), `${absent} must not fire on a neutral question`)
  }
})

check("ten of them are about doing, not saying", () => {
  const agency = [
    "act-dont-instruct", "confirm-irreversible", "no-phantom-actions", "receipt-not-promise",
    "partial-delivery", "produce-the-artifact", "resume-dont-restart", "voice-of-the-user",
    "platform-fit", "state-the-cost",
  ]
  assert.equal(agency.length, 10)
  const ids = new Set(MALIK_RESPONSE_FEATURES.map((feature) => feature.id))
  for (const id of agency) assert.ok(ids.has(id), `missing agency module: ${id}`)
})

check("never claims an action it did not perform — on every single turn", () => {
  // The one rule of the ten that earns a slot in every request.
  for (const prompt of ["Что такое рендер?", "привет", "напиши функцию", "опубликуй пост"]) {
    assert.match(buildMalikResponseSystemPrompt({ prompt }), /No Phantom Actions/, prompt)
  }
})

check("asks before anything public, paid or permanent", () => {
  const prompt = buildMalikResponseSystemPrompt({ prompt: "опубликуй это в инстаграм и спиши кредиты" })
  assert.match(prompt, /Confirm Before Irreversible/)
  assert.match(prompt, /State The Cost/)
})

check("writes a caption for the place it is going, in the person's own voice", () => {
  const prompt = buildMalikResponseSystemPrompt({ prompt: "придумай подпись для поста в инстаграм для моего бизнеса" })
  assert.match(prompt, /Platform Fit/)
  assert.match(prompt, /Their Voice, Not Yours/)
})

check("the agency modules stay out of an ordinary question", () => {
  const prompt = buildMalikResponseSystemPrompt({ prompt: "Что такое рендер?" })
  for (const absent of ["Confirm Before Irreversible", "State The Cost", "Platform Fit", "Receipt, Not Promise"]) {
    assert.doesNotMatch(prompt, new RegExp(absent), `${absent} must not fire on a neutral question`)
  }
})

check("the conversation modules never crowd out the code contract", () => {
  const prompt = buildMalikResponseSystemPrompt({ prompt: "напиши компонент на react с загрузкой данных" })
  assert.match(prompt, /Executable Code/)
  assert.match(prompt, /CODING CONTRACT/)
})

check("calibrates short and complex requests differently", () => {
  const simple = analyzeResponseRequest("Что такое рендер?")
  const complex = analyzeResponseRequest("Дай подробный пошаговый план запуска, сравни варианты, риски и бюджет для нового продукта")
  assert.equal(simple.complexity, "simple")
  assert.match(simple.targetLength, /2-4/)
  assert.equal(complex.complexity, "complex")
})

check("activates comparison intelligence only when it is useful", () => {
  const profile = analyzeResponseRequest("Сравни три модели по скорости, цене и качеству")
  const names = selectedResponseFeatures(profile).map((feature) => feature.name)
  assert.ok(names.includes("Comparison Matrix"))
  assert.ok(names.includes("Decision Matrix"))
})

check("activates runnable and copy-ready code intelligence", () => {
  const profile = analyzeResponseRequest("Исправь ошибку TypeScript и дай готовый код")
  const names = selectedResponseFeatures(profile).map((feature) => feature.name)
  assert.ok(names.includes("Executable Code"))
  assert.ok(names.includes("Copy Ready"))
  assert.ok(names.includes("Verification Loop"))
})

check("web answers require inline evidence and forbid invented links", () => {
  const prompt = buildMalikResponseSystemPrompt({ prompt: "Какие новости сегодня?", usedWeb: true, currentDate: "2026-09-01" })
  assert.match(prompt, /inline as \[n\]/)
  assert.match(prompt, /Never invent a citation/)
  assert.match(prompt, /Current date: 2026-09-01/)
})

check("cleanup removes hidden thought without flattening Markdown", () => {
  const raw = "<think>private</think>\n# Заголовок\n\n- пункт\n\n```ts\n  const value = 1\n```"
  const clean = cleanModelText(raw)
  assert.ok(!clean.includes("private"))
  assert.match(clean, /^# Заголовок/m)
  assert.match(clean, /^- пункт/m)
  assert.match(clean, /```ts\n  const value = 1\n```/)
})

console.log("\nwiring")

check("the primary router uses the adaptive response contract", () => {
  const router = fs.readFileSync("lib/malik-god-router.ts", "utf8")
  const cleanTextBody = router.match(/function cleanText\(value: unknown\) \{[\s\S]*?\n\}/)?.[0] || ""
  assert.match(router, /buildMalikResponseSystemPrompt/)
  assert.match(router, /cleanModelText/)
  assert.ok(!/replace\(\/\\s\+\/g/.test(cleanTextBody), "main answer whitespace must not be flattened")
})

check("the UI supports tables, code copy and bounded word-safe reveal", () => {
  const markdown = fs.readFileSync("components/sovereign/MalikMarkdown.tsx", "utf8")
  const dashboard = fs.readFileSync("components/sovereign/dashboard.tsx", "utf8")
  assert.match(markdown, /malik-md-table/)
  assert.match(markdown, /navigator\.clipboard\.writeText/)
  assert.match(dashboard, /answer\.match\(\/\\S\+\\s\*\|\\s\+\/g\)/)
  assert.match(dashboard, /Math\.min\(24/)
})

console.log(failures ? `\n${failures} failing\n` : "\nall response-quality checks passed\n")
process.exit(failures ? 1 : 0)
