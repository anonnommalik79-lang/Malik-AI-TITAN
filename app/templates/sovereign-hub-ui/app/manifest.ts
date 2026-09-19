import type { MetadataRoute } from "next"

type MalikManifest = MetadataRoute.Manifest & {
  share_target?: {
    action: string
    method: "POST"
    enctype: "multipart/form-data"
    params: { title: string; text: string; url: string; files: Array<{ name: string; accept: string[] }> }
  }
}

export default function manifest(): MalikManifest {
  return {
    name: "Malik AI",
    short_name: "Malik AI",
    description:
      "Malik AI — AI-платформа для текста, кода, веб-поиска, изображений, видео и презентаций.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          { name: "files", accept: ["image/*", "video/*", "application/pdf"] },
        ],
      },
    },
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
