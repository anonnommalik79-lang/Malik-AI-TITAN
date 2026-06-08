import type { Metadata } from "next"
import Link from "next/link"
import { ProofNavStrip } from "@/components/public/ProofWidgets"
import { CapabilitiesPanel } from "@/components/sovereign/capabilities"
import { HONEST_POSITIONING } from "@/lib/ai/safety"

export const metadata: Metadata = {
  title: "Capabilities | MALIK AI",
  description: "MALIK AI Capabilities Engine with 200 practical AI abilities.",
}

export default function CapabilitiesPage() {
  return (
    <>
      <div className="border-b border-white/10 bg-[#02050d] px-4 py-3 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3">
          <ProofNavStrip active="/capabilities" />
          <p className="max-w-3xl text-xs leading-5 text-slate-500">{HONEST_POSITIONING}</p>
          <div className="flex flex-wrap gap-4 text-xs">
            <Link href="/demo" className="text-cyan-300 hover:underline">
              Live demo
            </Link>
            <Link href="/status" className="text-cyan-300 hover:underline">
              Status
            </Link>
            <Link href="/press-kit" className="text-cyan-300 hover:underline">
              Press kit
            </Link>
          </div>
        </div>
      </div>
      <CapabilitiesPanel variant="page" />
    </>
  )
}
