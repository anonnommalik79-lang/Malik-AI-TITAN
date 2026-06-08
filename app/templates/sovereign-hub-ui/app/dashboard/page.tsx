"use client";

import React from "react";
import * as DashboardModule from "@/components/sovereign/dashboard";

type AnyComponent = React.ComponentType<any>;

function DashboardFallback({ error }: { error?: string }) {
  return (
    <main className="min-h-[100dvh] bg-black text-white flex items-center justify-center p-6">
      <div className="max-w-lg rounded-[28px] border border-white/10 bg-white/[0.05] p-7 text-center shadow-2xl shadow-black/50 backdrop-blur-xl">
        <h1 className="text-2xl font-black">Dashboard export не найден</h1>
        <p className="mt-3 text-sm leading-6 text-white/60">
          {error || "В components/sovereign/dashboard.tsx нужен default export или Dashboard export."}
        </p>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  const Dashboard =
    ((DashboardModule as any).default ||
      (DashboardModule as any).Dashboard ||
      (DashboardModule as any).SovereignDashboard ||
      (DashboardModule as any).MalikDashboard ||
      null) as AnyComponent | null;

  if (!Dashboard) return <DashboardFallback />;

  return (
    <div data-malik-dashboard-page className="malik-dashboard-page-guard">
      <Dashboard />

      <style jsx global>{`
        .malik-dashboard-page-guard {
          width: 100vw;
          min-height: 100dvh;
          overflow-x: hidden;
          background: #000;
        }

        .malik-dashboard-page-guard main,
        .malik-dashboard-page-guard [data-dashboard-root],
        .malik-dashboard-page-guard [data-sovereign-dashboard] {
          max-width: 100vw;
        }
      `}</style>
    </div>
  );
}
