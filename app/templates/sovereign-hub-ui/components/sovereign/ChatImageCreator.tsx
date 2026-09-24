"use client"

/**
 * "Создать изображение" from the "+" menu of the chat and of the home
 * composer. The screen itself lives in ./image-studio/ImageStudio: templates
 * with covers painted by image models, a prompt panel with model, style,
 * aspect ratio, quality and count, and the results of each run.
 */

import {
  ImageStudio,
  type StudioAspectRatio,
  type StudioAttachment,
  type StudioCredits,
  type StudioResolution,
} from "./image-studio/ImageStudio"

export type ChatImageAspectRatio = StudioAspectRatio
export type ChatImageResolution = StudioResolution

export function ChatImageCreator(props: {
  attachments: StudioAttachment[]
  credits?: StudioCredits | null
  plan?: string
  onAddImage: () => void
  onAddFiles?: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  onClose: () => void
}) {
  return <ImageStudio {...props} />
}

export default ChatImageCreator
