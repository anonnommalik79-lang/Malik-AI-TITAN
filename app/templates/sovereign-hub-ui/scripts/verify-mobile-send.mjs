import assert from "node:assert/strict"
import fs from "node:fs"

const chat = fs.readFileSync("components/sovereign/chat-view.tsx", "utf8")
const home = fs.readFileSync("components/sovereign/hybrid/MalikHybridHome.tsx", "utf8")
const runtime = fs.readFileSync("components/sovereign/MalikTurnRuntime.tsx", "utf8")
const css = fs.readFileSync("app/chat-monochrome-final.css", "utf8")
const dashboard = fs.readFileSync("components/sovereign/dashboard.tsx", "utf8")

// Both full Chat and Home must handle iOS autofill/dictation even when React's
// onChange arrives later than the native textarea value.
assert.match(chat, /const rawText = \(textareaRef\.current\?\.value \|\| prompt\)\.trim\(\)/)
assert.match(chat, /onInput=\{\(event\) => setPrompt\(event\.currentTarget\.value\)\}/)
assert.match(chat, /onCompositionEnd=\{\(event\) => setPrompt\(event\.currentTarget\.value\)\}/)
assert.match(chat, /onClick=\{handleGuardedSubmit\}/)
assert.match(chat, /setPrompt\(rawText\)[\s\S]*Не удалось отправить/)
assert.match(home, /onSubmit\(event\.currentTarget\.value\)/)
assert.match(home, /onClick=\{\(\) => onSubmit\(textareaRef\.current\?\.value\)\}/)
assert.match(home, /const submit = \(nativeDraft\?: string\)/)
assert.match(home, /const text = \(nativeDraft \|\| prompt\)\.trim\(\)/)
assert.match(home, /onInput=\{\(event\) => onPromptChange\(event\.currentTarget\.value\)\}/)
assert.doesNotMatch(home, /const field = document\.querySelector<HTMLTextAreaElement>\("\.thome-composer textarea"\)/)

// Two HomeComposer instances are mounted, so a global query selects the wrong
// (possibly hidden) field. TurnRuntime must always use the tapped button's own.
assert.match(runtime, /button\.closest\("\.thome-composer, \.malik-inline-composer"\)/)
assert.match(runtime, /composer\?\.querySelector<HTMLTextAreaElement>\("textarea"\)/)
assert.doesNotMatch(runtime, /return document\.querySelector<HTMLTextAreaElement>\("\.thome-composer textarea"\)/)

// A visible mobile send control must be the hit target, and an invisible Voice
// button must never sit above it and swallow the tap.
assert.match(css, /iPhone send\/voice actions must receive taps/)
assert.match(css, /button:not\(\.is-hidden\):not\(:disabled\)/)
assert.match(css, /z-index: 31 !important;/)
assert.match(css, /button\.is-hidden[\s\S]*pointer-events: none !important;/)
assert.match(dashboard, /onSendMessage=\{handleSendMessage\}/)
console.log("PASS mobile send: native draft, correct home field, button hit target, handoff and error recovery")
