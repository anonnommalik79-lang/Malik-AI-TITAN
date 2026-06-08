"use client"

import { useState } from "react"

type VideoLoopProps = {
  src: string
  poster: string
  className?: string
}

export function VideoLoop({ src, poster, className }: VideoLoopProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <img
        src={poster}
        alt=""
        className={className}
        style={{ objectFit: "cover", width: "100%", height: "100%", display: "block" }}
      />
    )
  }

  return (
    <video
      key={src}
      className={className}
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
    />
  )
}
