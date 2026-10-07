import assert from "node:assert/strict"
import fs from "node:fs"

const read = (path) => fs.readFileSync(path, "utf8")
const video = read("components/sovereign/video-generation/VideoGenerationStudio.tsx")
const videoModels = read("app/api/media/video/models/route.ts")
const videoRoute = read("app/api/media/video/route.ts")
const music = read("components/sovereign/music-generation/MusicGenerationStudio.tsx")
const musicProvider = read("lib/server/deapi-music.ts")
const musicStatus = read("app/api/media/music/status/route.ts")

assert.doesNotMatch(video, /mobileModelOpen|setMobileModelOpen/)
assert.match(video, /id="mv2-mobile-models"[\s\S]{0,100}is-always-open/)
assert.match(video, /MOBILE_MODELS\.map/)
assert.match(video, /modelAvailability\[model\.id\] !== false/)
assert.match(video, /duration !== 10 \|\| model\.id === "magichour" \|\| model\.id === "runway"/)
assert.match(video, /provider,\n\s*\}\),/)
for (const id of ["novai","magichour","pixazo","cliptaps","h3","dashscope","pollo","runway","fal","luma","veo"]) {
  assert.match(videoModels, new RegExp("\\b" + id + ":\\s*"), "models endpoint missing " + id)
  assert.ok(videoRoute.includes('"' + id + '"'), "video route missing " + id)
}

assert.doesNotMatch(music, /Auto · Malik Router|Malik Music v1|cycleModel|modelChoice|modelMenuOpen/)
assert.match(music, /data-real-music-provider/)
assert.match(music, /const \[lyricsEnabled, setLyricsEnabled\] = useState\(false\)/)
assert.match(music, /Проверяю, что это реальный воспроизводимый трек/)
assert.match(music, /onLoadedMetadata[\s\S]{0,900}status: "ready"/)
assert.match(music, /onError[\s\S]{0,900}status: "failed"/)

const submitStart = musicProvider.indexOf("export async function submitDeapiMusic")
const submitEnd = musicProvider.indexOf("async function getDeapiFallbackJob", submitStart)
const submit = musicProvider.slice(submitStart, submitEnd)
assert.doesNotMatch(submit, /createDeferredMusicJob/)
assert.match(submit, /submitFreeAiMusic/)
assert.match(submit, /submitDeapiFallback/)
assert.match(musicStatus, /result\.status === "done"/)
assert.match(musicStatus, /directMediaUrl\(result\.resultUrl/)

console.log("Video mobile models + real music delivery contract: OK")
