import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://malikaiworld.world/",
      changeFrequency: "daily",
      priority: 1,
    },
  ]
}
