import { ImageResponse } from "next/og"

export const size = {
  width: 512,
  height: 512,
}

export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
        }}
      >
        <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
          <rect width="512" height="512" rx="112" fill="#000000" />
          <path d="M68 342 241 168v174H68Z" fill="#ffffff" />
          <path d="M278 168h168L278 345V168Z" fill="#ffffff" />
        </svg>
      </div>
    ),
    size,
  )
}
