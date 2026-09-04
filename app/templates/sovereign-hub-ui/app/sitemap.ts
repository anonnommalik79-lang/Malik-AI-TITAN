import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://malikaiworld.world/",
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://malikaiworld.world/business",
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ]
}
