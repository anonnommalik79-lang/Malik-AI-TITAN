"use client"

/** Local Malik AI branding asset — decorative layer only, never interactive. */
export const MALIK_DECOR_BG_SRC = "/images/welcome-reference-space.svg"

type MalikDecorBackgroundProps = {
  variant?: "home" | "chat"
}

export function MalikDecorBackground({ variant = "home" }: MalikDecorBackgroundProps) {
  return (
    <div className="malik-decor-bg" data-variant={variant} aria-hidden="true">
      <img
        src={MALIK_DECOR_BG_SRC}
        alt=""
        className="malik-decor-bg__image"
        decoding="async"
        loading="eager"
        fetchPriority="low"
        draggable={false}
      />
      <div className="malik-decor-bg__scrim" />
      <div className="malik-decor-bg__vignette" />
    </div>
  )
}
