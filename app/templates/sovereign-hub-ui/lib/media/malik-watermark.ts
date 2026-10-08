import "server-only"

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Official Malik AI two-triangle icon, embedded in the actual generated image.
 * Path coordinates match public/brand/malik-mark.svg byte-for-byte.
 * Small bottom-left signature with a thin dark outline for light scenes.
 * No extra text, backgrounds or expensive second image processing pass.
 */
export function createMalikImageWatermarkSvg(imageWidth: number) {
  const width = Math.round(clamp(imageWidth * 0.06, 32, 180))
  const height = Math.round(width * 0.7)
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="-12 -10 124 78">
    <g fill="#ffffff" fill-opacity=".83" stroke="#050505" stroke-opacity=".54" stroke-width="3" stroke-linejoin="round">
      <path d="M4 53 46 11v42H4Z"/>
      <path d="M55 11h41L55 53V11Z"/>
    </g>
  </svg>`)
}
