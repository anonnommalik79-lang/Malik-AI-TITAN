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
 * The old Photo Generation studio is intentionally removed. The founder's
 * supplied artwork is rendered as-is: landscape on desktop/tablet and the
 * dedicated portrait artwork on phones.
 *
 * Native <img> is deliberate so Next.js never recompresses or resizes the
 * source files. object-contain preserves every pixel and the original aspect
 * ratio without crop or stretch.
 */
export function PhotoGenerationStudio(_props: PhotoGenerationStudioProps) {
  return (
    <main
      className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-black"
      data-view="photo-generation"
      aria-label="Voltframe AI скоро в Malik AI"
    >
      <picture className="block h-full w-full">
        <source media="(max-width: 767px)" srcSet="/voltframe/mobile.png" type="image/png" />
        <img
          src="/voltframe/desktop.png"
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
