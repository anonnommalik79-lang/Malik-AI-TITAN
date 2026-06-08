/** Unique hero imagery per main section — IDs must not repeat as hero elsewhere. */
export function unsplashPhoto(id: string, width = 1200) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80`
}

export const SECTION_HERO_PHOTOS = {
  "photo-generation": "photo-1550751827-4bd374c1f58b",
  "video-generation": "photo-1489599846737-34aac775127d",
  "command-center": "photo-1504639725590-34d0984388bd",
  "ai-generator": "photo-1639762681485-074b7f938ba0",
  "website-generation": "photo-1522071820081-009f0129c71c",
  "final-intelligence": "photo-1487058792275-0ad4aaf24ca7",
  "unbreakable-ai": "photo-1563986768609-322da13575f3",
} as const

export type SectionHeroId = keyof typeof SECTION_HERO_PHOTOS

export function sectionHeroUrl(section: SectionHeroId, width = 1200) {
  return unsplashPhoto(SECTION_HERO_PHOTOS[section], width)
}

export type VideoClip = {
  src: string
  poster: string
}

/** Autoplay loop clips for Video Generation (Pexels, muted). */
export const VIDEO_STYLE_CLIPS: Record<string, VideoClip> = {
  cinematic: {
    src: "https://videos.pexels.com/video-files/2491284/2491284-hd_1920_1080_30fps.mp4",
    poster: unsplashPhoto("photo-1489599846737-34aac775127d", 900),
  },
  edit: {
    src: "https://videos.pexels.com/video-files/855412/855412-hd_1920_1080_25fps.mp4",
    poster: unsplashPhoto("photo-1598483644766-792bd69c9e18", 900),
  },
  neon: {
    src: "https://videos.pexels.com/video-files/3045163/3045163-sd_640_360_30fps.mp4",
    poster: unsplashPhoto("photo-1536440136628-849c177e76a1", 900),
  },
  launch: {
    src: "https://videos.pexels.com/video-files/3254065/3254065-hd_1920_1080_25fps.mp4",
    poster: unsplashPhoto("photo-1478720568477-152d9b8e9fcd", 900),
  },
  orbit: {
    src: "https://videos.pexels.com/video-files/2889610/2889610-hd_1920_1080_30fps.mp4",
    poster: unsplashPhoto("photo-1446776811953-b23d57bd21aa", 900),
  },
  timeline: {
    src: "https://videos.pexels.com/video-files/7578552/7578552-hd_1920_1080_25fps.mp4",
    poster: unsplashPhoto("photo-1614850523459-c2f4c699c52e", 900),
  },
}

export const VIDEO_STORYBOARD_CLIPS: VideoClip[] = [
  {
    src: "https://videos.pexels.com/video-files/3129957/3129957-sd_640_360_24fps.mp4",
    poster: unsplashPhoto("photo-1512941937669-90a1b58e7e9c", 700),
  },
  {
    src: "https://videos.pexels.com/video-files/7693319/7693319-hd_1920_1080_25fps.mp4",
    poster: unsplashPhoto("photo-1499750310107-5fef28a66643", 700),
  },
  {
    src: "https://videos.pexels.com/video-files/3255275/3255275-hd_1920_1080_25fps.mp4",
    poster: unsplashPhoto("photo-1542744173-8e7e53415bb0", 700),
  },
  {
    src: "https://videos.pexels.com/video-files/3195394/3195394-sd_640_360_30fps.mp4",
    poster: unsplashPhoto("photo-1556761175-b413da4baf72", 700),
  },
]
