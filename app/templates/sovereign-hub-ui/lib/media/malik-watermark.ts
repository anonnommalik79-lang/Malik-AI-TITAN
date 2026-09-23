import "server-only"

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Branded Malik AI watermark used on generated image masters.
 * The mark follows the user's two-triangle logo and keeps a translucent
 * icon + "Malik AI" wordmark at the bottom-right without a backing box.
 */
export function createMalikImageWatermarkSvg(imageWidth: number) {
  // Large enough to remain legible on mobile previews, while the SVG's own
  // whitespace keeps the mark away from the southeast edge of the picture.
  const width = Math.round(clamp(imageWidth * 0.13, 108, 460))
  const height = Math.round(width * 0.66)

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 200 132">
    <g>
      <g transform="translate(30 12)">
        <path d="M0 68 60 8v60H0Z" fill="#000" opacity=".34" transform="translate(2 2)"/>
        <path d="M72 8h60L72 68V8Z" fill="#000" opacity=".34" transform="translate(2 2)"/>
        <path d="M0 68 60 8v60H0Z" fill="#fff" opacity=".78"/>
        <path d="M72 8h60L72 68V8Z" fill="#fff" opacity=".78"/>
      </g>
      <text
        x="96"
        y="110"
        text-anchor="middle"
        font-family="Inter, Arial, Helvetica, sans-serif"
        font-size="25"
        font-weight="650"
        letter-spacing=".2"
        fill="#fff"
        opacity=".74"
        stroke="#000"
        stroke-opacity=".28"
        stroke-width="1.2"
        paint-order="stroke"
      >Malik AI</text>
    </g>
  </svg>`)
}
