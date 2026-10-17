/** Creation intent wins over incidental dates and media words in a build brief. */
export function websiteIntent(prompt: string, hasProject = false): "create" | "edit" | "preview" | null {
  const text = String(prompt || "").replace(/```[\s\S]*?```/g, "").trim()
  if (!text || text.length > 28_000) return null
  const opening = text.split(/\r?\n/).filter(line => !/^\s*>/.test(line)).join(" ").slice(0, 2200)
  if (/^(?:как|почему|что такое|объясни|расскажи|how|why|what is|explain)(?!\p{L})/iu.test(opening)) return null
  if (/(?:не\s+(?:создавай|делай|строй|генерируй)|do not (?:create|build|generate)|don't (?:create|build))/iu.test(opening)) return null
  const site = /(?:сайт\p{L}*|лендинг\p{L}*|веб[- ]?приложени\p{L}*|веб[- ]?интерфейс\p{L}*|интерфейс|React[- ]?проект\p{L}*|website|\bsite\b|web\s*app|landing\s*page|homepage|сайтты)/iu
  const create = /(?:создай|создайте|сгенерируй|сгенерируйте|сделай|сделайте|собери|построй|разработай|сверстай|жаса|құр|\b(?:create|build|make|implement|design)\b)/iu
  const edit = /(?:добавь|измени|исправь|почини|замени|улучши|поменяй|удали|\b(?:add|change|fix|debug|replace|improve|remove)\b)/iu
  if (hasProject && /(?:открой|покажи|open|show).*(?:превью|предпросмотр|preview)/iu.test(opening)) return "preview"
  if (edit.test(opening) && (hasProject || site.test(opening))) return "edit"
  // «Create an image FOR my website» targets media, whereas «create a website
  // WITH images» targets a project. Co-occurrence alone is not creation intent.
  const target = site.exec(opening), media = /(?:фотографи|фото|картинк|изображени|видео|анимаци|\b(?:image|photo|video|animation|icon)\b)/iu.exec(opening)
  if (target && media && media.index < target.index && /(?:для|на|for|on)\s+(?:[\p{L}]+\s+){0,3}$/iu.test(opening.slice(media.index, target.index))) return null
  if (create.test(opening) && site.test(opening)) return "create"
  return null
}

export function lastWebsiteJob(messages: unknown): string | null {
  if (!Array.isArray(messages)) return null
  for (const message of [...messages].reverse().slice(0, 20)) {
    if (message?.role !== "assistant" || typeof message.content !== "string") continue
    const match = message.content.match(/```malik-project\s+([\s\S]*?)```/)
    if (!match) continue
    try {
      const id = JSON.parse(match[1]).id
      if (typeof id === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) return id
    } catch { /* A partial fence is not a project. */ }
  }
  return null
}
