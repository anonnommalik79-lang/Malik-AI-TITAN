"use client"

export type PhotoGenerationStudioProps = {
  username?: string
  onViewChange: (view: string) => void
  onOpenCodex: () => void
  onOpenCanvas?: (code?: string) => void
  onNewChat?: () => void
}

/**
 * Voltframe launch takeover.
 *
 * This view intentionally contains no old Photo Generation studio UI. The
 * artwork supplied by the founder is the whole product surface: landscape on
 * desktop/tablet and the dedicated portrait composition on mobile.
 *
 * Native <img> is deliberate. Next/Image would be allowed to transcode or
 * resize the artwork; this route serves the lossless source bytes unchanged.
 */
export function PhotoGenerationStudio(_props: PhotoGenerationStudioProps) {
  return (
    <main
      className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-black"
      data-view="photo-generation"
      aria-label="Voltframe AI скоро в Malik AI"
    >
      <picture className="block h-full w-full">
        <source
          media="(max-width: 767px)"
          srcSet="/api/voltframe-teaser/mobile"
          type="image/webp"
        />
        <img
          src="/api/voltframe-teaser/desktop"
          alt="Voltframe AI скоро в Malik AI"
          width={1672}
          height={941}
          draggable={false}
          decoding="async"
          fetchPriority="high"
          className="block h-full w-full select-none object-contain object-center"
        />
      </picture>
    </main>
  )
}

export default PhotoGenerationStudio
