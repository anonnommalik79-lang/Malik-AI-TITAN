"use client"

import { Check, Copy, FileCode2, Folder, Lock, Rocket, Shield } from "lucide-react"
import { useState } from "react"

interface MalikCodexFilesProps {
  selectedFiles: string[]
  onSelectedFilesChange: (files: string[]) => void
}

const fileGroups = [
  {
    title: "Project files",
    icon: Folder,
    files: [
      "app/templates/sovereign-hub-ui/components/sovereign/dashboard.tsx",
      "app/templates/sovereign-hub-ui/components/sovereign/chat-view.tsx",
      "app/templates/sovereign-hub-ui/components/sovereign/preview-panel.tsx",
      "app/templates/sovereign-hub-ui/components/sovereign/sidebar.tsx",
    ],
  },
  {
    title: "Generated files",
    icon: FileCode2,
    files: [
      "components/sovereign/core/feature-registry.ts",
      "components/sovereign/photo-generation/photo-generation-panel.tsx",
      "components/sovereign/generators/generator-panel.tsx",
    ],
  },
  {
    title: "Protected files",
    icon: Shield,
    files: ["ai_model.py", "run.py", "app/routes.py", "app/ai_engine.py", "app/brain.py"],
  },
  {
    title: "Deploy files",
    icon: Rocket,
    files: ["render.yaml", "requirements.txt", "docs/DEPLOY_CHECKLIST.md", ".env.example"],
  },
]

export function MalikCodexFiles({ selectedFiles, onSelectedFilesChange }: MalikCodexFilesProps) {
  const [copied, setCopied] = useState<string | null>(null)

  const toggle = (file: string) => {
    if (selectedFiles.includes(file)) {
      onSelectedFilesChange(selectedFiles.filter((item) => item !== file))
    } else {
      onSelectedFilesChange([...selectedFiles, file])
    }
  }

  const copy = async (file: string) => {
    await navigator.clipboard.writeText(file)
    setCopied(file)
    setTimeout(() => setCopied(null), 1400)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-black text-white">Files</h3>
            <p className="text-xs text-zinc-500">{selectedFiles.length} selected</p>
          </div>
          <Lock className="h-4 w-4 text-violet-200" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {fileGroups.map((group) => (
          <section key={group.title} className="mb-4">
            <div className="mb-2 flex items-center gap-2 px-2 text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500">
              <group.icon className="h-4 w-4" /> {group.title}
            </div>
            <div className="space-y-1">
              {group.files.map((file) => (
                <div key={file} className="group flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-white/5">
                  <button
                    type="button"
                    onClick={() => toggle(file)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/15 bg-black"
                  >
                    {selectedFiles.includes(file) && <Check className="h-3 w-3 text-cyan-200" />}
                  </button>
                  <button type="button" onClick={() => toggle(file)} className="min-w-0 flex-1 truncate text-left text-xs text-zinc-300">
                    {file}
                  </button>
                  <button type="button" onClick={() => copy(file)} className="rounded-lg p-1 text-zinc-500 hover:bg-white/10 hover:text-white">
                    {copied === file ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

export default MalikCodexFiles


