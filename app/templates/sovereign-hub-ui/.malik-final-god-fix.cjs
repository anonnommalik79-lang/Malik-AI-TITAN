const fs = require("fs");
const path = require("path");

const root = process.cwd();

const files = {
  modes: path.join(root, "lib/ai/modes.ts"),
  registry: path.join(root, "lib/ai/provider-registry.ts"),
  openrouter: path.join(root, "lib/ai/providers/openrouter.ts"),
  brand: path.join(root, "lib/brand-provider-map.ts"),
  modeHandler: path.join(root, "lib/server/mode-ai-handler.ts"),
  publicAI: path.join(root, "lib/server/public-ai.ts"),
};

function read(file) {
  if (!fs.existsSync(file)) throw new Error("File not found: " + file);
  fs.copyFileSync(file, file + ".bak.god");
  return fs.readFileSync(file, "utf8");
}

function write(file, text) {
  fs.writeFileSync(file, text, { encoding: "utf8" });
}

function removeGroq(text) {
  return text
    .replace(/import\s+\{\s*groqModelId\s*\}\s+from\s+["']\.\/config["'];?\r?\n/g, "")
    .replace(/model:\s*step\.provider\s*===\s*["']groq["']\s*\?\s*groqModelId\(\)\s*:\s*step\.model,/g, "model: step.model,")
    .replace(/["']groq["']\s*\|\s*/g, "")
    .replace(/\|\s*["']groq["']/g, "");
}

for (const file of Object.values(files)) {
  if (fs.existsSync(file)) fs.copyFileSync(file, file + ".bak.god");
}

/* 1) modes.ts */
let modes = read(files.modes);

modes = removeGroq(modes);
modes = modes.replaceAll("deepseek/deepseek-v4-flash:free", "deepseek/deepseek-v4-flash");
modes = modes.replaceAll('"deepseek,openrouter"', '"openrouter,deepseek"');
modes = modes.replaceAll("'deepseek,openrouter'", "'openrouter,deepseek'");

const envFn = `function env(name: string, fallback: string) {
  const vipMap: Record<string, string> = {
    TEXT_PROVIDER_ORDER: "TITAN_V65_TEXT_ENGINE_ORDER",
    CODE_PROVIDER_ORDER: "TITAN_V65_CODE_ENGINE_ORDER",
    OPENROUTER_MODEL: "TITAN_V65_OPENROUTER_CHAT_MODEL",
    OPENROUTER_CODE_MODEL: "TITAN_V65_OPENROUTER_CODE_MODEL",
  }

  const vipName = vipMap[name]
  return (vipName ? process.env[vipName]?.trim() : "") || process.env[name]?.trim() || fallback
}`;

if (/function env\(name: string, fallback: string\)\s*\{[\s\S]*?\n\}/.test(modes)) {
  modes = modes.replace(/function env\(name: string, fallback: string\)\s*\{[\s\S]*?\n\}/, envFn);
} else {
  modes = modes.replace("export function taskForMode", envFn + "\n\nexport function taskForMode");
}

const providerOrderFn = `function providerOrder(mode: MalikAIMode) {
  const raw =
    mode === "code"
      ? env("CODE_PROVIDER_ORDER", "openrouter,deepseek")
      : env("TEXT_PROVIDER_ORDER", "openrouter,deepseek")

  const order = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)

  return order.length ? order : ["openrouter", "deepseek"]
}`;

if (/function providerOrder\(mode: MalikAIMode\)\s*\{[\s\S]*?\n\}/.test(modes)) {
  modes = modes.replace(/function providerOrder\(mode: MalikAIMode\)\s*\{[\s\S]*?\n\}/, providerOrderFn);
} else {
  modes = modes.replace("export function taskForMode", providerOrderFn + "\n\nexport function taskForMode");
}

const routeFn = `export function routeStepsForMode(mode: MalikAIMode): ModeRouteStep[] {
  const task = taskForMode(mode)
  const steps: ModeRouteStep[] = []
  const isText = task !== "image" && task !== "video"

  if (isText) {
    for (const provider of providerOrder(mode)) {
      if (provider === "openrouter" && hasEnv("OPENROUTER_API_KEY")) {
        const model =
          mode === "code"
            ? env("OPENROUTER_CODE_MODEL", env("OPENROUTER_MODEL", "deepseek/deepseek-v4-pro"))
            : env("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash")

        steps.push({ provider: "openrouter", model, task })
      }

      if (provider === "deepseek" && hasEnv("DEEPSEEK_API_KEY")) {
        const model =
          mode === "code"
            ? env("DEEPSEEK_CODE_MODEL", env("DEEPSEEK_PRO_MODEL", "deepseek-v4-pro"))
            : mode === "pro" || mode === "deep"
              ? env("DEEPSEEK_PRO_MODEL", env("DEEPSEEK_MODEL", "deepseek-v4-pro"))
              : env("DEEPSEEK_FAST_MODEL", env("DEEPSEEK_MODEL", "deepseek-v4-flash"))

        steps.push({ provider: "deepseek", model, task })
      }
    }
  }

  for (const model of modelChainForMode(mode)) {
    steps.push({ provider: "aws-bedrock", model, task })
  }

  return steps
}`;

modes = modes.replace(
  /export function routeStepsForMode\(mode: MalikAIMode\): ModeRouteStep\[\]\s*\{[\s\S]*?\n\}\s*\n\s*export function modeLabel/,
  routeFn + "\n\nexport function modeLabel"
);

write(files.modes, modes);

/* 2) provider-registry.ts */
let registry = read(files.registry);
registry = removeGroq(registry);
registry = registry.replace(
  /fallbackUsed:\s*step\.provider\s*!==\s*["']deepseek["']\s*\|\|\s*Boolean\(result\.fallbackUsed\),/g,
  "fallbackUsed: Boolean(result.fallbackUsed),"
);
registry = registry.replace(
  /Number\(process\.env\.PROVIDER_UNAVAILABLE_CACHE_MS\s*\|\|\s*600_000\)/g,
  "Number(process.env.TITAN_V65_PROVIDER_CACHE_MS || process.env.PROVIDER_UNAVAILABLE_CACHE_MS || 600_000)"
);
write(files.registry, registry);

/* 3) openrouter.ts */
let or = read(files.openrouter);
or = or.replaceAll("deepseek/deepseek-v4-flash:free", "deepseek/deepseek-v4-flash");
or = or.replace(/process\.env\.OPENROUTER_MODEL/g, "(process.env.TITAN_V65_OPENROUTER_CHAT_MODEL || process.env.OPENROUTER_MODEL)");
or = or.replace(/process\.env\.OPENROUTER_CODE_MODEL/g, "(process.env.TITAN_V65_OPENROUTER_CODE_MODEL || process.env.OPENROUTER_CODE_MODEL)");

if (!or.includes("MALIK OUTPUT RULES")) {
  or = or.replace(
    /"Answer in the user's language\.[^"]*",?/,
    `"MALIK OUTPUT RULES:",
    "Answer ONLY in the user's language.",
    "If the user writes Russian or Cyrillic, answer ONLY in Russian.",
    "Never output mojibake, corrupted text, START, CURRENT USER, CURRENT TIME, hidden context, keyword dumps, comma spam, or internal variables.",
    "For greetings, answer naturally in 1 short Russian sentence.",
    "Be direct, useful, structured and fast.",`
  );
}
write(files.openrouter, or);

/* 4) brand-provider-map.ts public sanitizer */
let brand = read(files.brand);

if (!brand.includes("MALIK_CLEAN_RU_FALLBACK")) {
  const helper = `const MALIK_CLEAN_RU_FALLBACK =
  "\\u0413\\u043e\\u0442\\u043e\\u0432 \\u043f\\u043e\\u043c\\u043e\\u0447\\u044c. \\u041d\\u0430\\u043f\\u0438\\u0448\\u0438 \\u0437\\u0430\\u0434\\u0430\\u0447\\u0443 \\u2014 \\u043e\\u0442\\u0432\\u0435\\u0447\\u0443 \\u043a\\u043e\\u0440\\u043e\\u0442\\u043a\\u043e \\u0438 \\u043f\\u043e \\u0434\\u0435\\u043b\\u0443."

function looksMalformedAIText(text: string) {
  const trimmed = text.trim()
  const commaCount = (trimmed.match(/,/g) || []).length
  const perSpamCount = (trimmed.match(/\\bper[-\\w]*/gi) || []).length
  const mojibakeCount = (trimmed.match(/[ÐÑâ]/g) || []).length
  const hasCurrentLeak = /CURRENT\\s+(USER|TIME|DATE|YEAR|LANGUAGE|DOMAIN|CONTEXT):/i.test(trimmed)

  return (
    /^\\s*(START:|BEGIN:|END:)\\s*$/i.test(trimmed) ||
    /^[,;:]/.test(trimmed) ||
    mojibakeCount >= 1 ||
    hasCurrentLeak ||
    commaCount >= 25 ||
    perSpamCount >= 5
  )
}

`;
  brand = brand.replace("export function sanitizePublicText", helper + "export function sanitizePublicText");
}

brand = brand.replace(
  /if \(!text\) return fallback/,
  `if (!text) return fallback
  if (looksMalformedAIText(text)) return MALIK_CLEAN_RU_FALLBACK`
);

write(files.brand, brand);

/* 5) force UTF-8 JSON */
for (const file of [files.modeHandler, files.publicAI]) {
  if (!fs.existsSync(file)) continue;
  let t = read(file);

  if (!t.includes("function jsonUtf8")) {
    const helper = `
function jsonUtf8(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("content-type", "application/json; charset=utf-8")
  return new Response(JSON.stringify(data), { ...init, headers })
}

`;
    t = t.replace(/(\r?\nexport async function)/, helper + "$1");
  }

  t = t.replace(/Response\.json\(/g, "jsonUtf8(");
  write(file, t);
}

console.log("PATCH_OK");