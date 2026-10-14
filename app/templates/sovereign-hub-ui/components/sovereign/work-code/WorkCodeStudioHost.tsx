"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { OverlayPortal } from "../OverlayPortal"
import { ArtifactViewer } from "../os/ArtifactViewer"
import { WorkCodeStudio } from "./WorkCodeStudio"
import { WORK_CODE_OPEN_EVENT } from "./open"
import { studioLanguage, studioWord } from "./i18n"

/** The full-screen Code Studio, opened from the Work tools with openWorkCode(). */
export function WorkCodeStudioHost() {
  const [open, setOpen] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [language] = useState(studioLanguage)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(WORK_CODE_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(WORK_CODE_OPEN_EVENT, onOpen)
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !savedId) setOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, savedId])

  if (!open) return null
  return (
    <OverlayPortal>
      <div className="wcs-dialog" role="dialog" aria-modal="true" aria-label={studioWord(language, "title")} data-work-code-studio="">
        <div className="wcs-dialog__bar">
          <h2>Malik Work · {studioWord(language, "title")}</h2>
          <button type="button" className="wcs-button" onClick={() => setOpen(false)} aria-label={studioWord(language, "close")}><X size={16} aria-hidden="true" />{studioWord(language, "close")}</button>
        </div>
        <div className="wcs-dialog__body"><WorkCodeStudio onSaved={setSavedId} /></div>
      </div>
      {savedId ? <ArtifactViewer artifactId={savedId} onClose={() => setSavedId(null)} /> : null}
    </OverlayPortal>
  )
}
