/** A website/code request remains in chat unless the user asks for a package. */
export function explicitlyRequestsPackagedProject(prompt: string) {
  const text = String(prompt || "").toLowerCase().replace(/\s+/g, " ")
  const asksForDelivery = /создай|сделай|собери|сгенерируй|подготовь|упакуй|выгрузи|дай|скачать|create|build|package|export|download/i.test(text)
  const namesProjectPayload = /проект|репозитор|исходник|все\s+файл|полный\s+код|сайт|приложен|project|repository|source\s+files?|all\s+files?|website|\bapp\b/i.test(text)
  const namesPackage = /\bzip\b|\.zip\b|архив|archive|bundle/i.test(text)
  const directProjectDownload = /(?:скачать|дай|download|export).{0,45}(?:проект|репозитор|исходник|все\s+файл|project|repository|source\s+files?|all\s+files?)/i.test(text)
    || /(?:проект|репозитор|исходник|все\s+файл|project|repository|source\s+files?|all\s+files?).{0,45}(?:скачать|download|export)/i.test(text)

  return directProjectDownload || (asksForDelivery && namesProjectPayload && namesPackage)
}
