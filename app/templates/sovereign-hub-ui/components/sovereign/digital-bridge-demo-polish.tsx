"use client"

export function DigitalBridgeDemoPolish() {
  return (
    <style jsx global>{`
      .malik-dashboard-shell {
        --db-surface: rgba(5, 12, 28, .76);
        --db-surface-strong: rgba(8, 17, 38, .9);
        --db-border: rgba(148, 163, 184, .2);
        --db-cyan: #67e8f9;
        --db-blue: #60a5fa;
        --db-violet: #a78bfa;
        --db-fuchsia: #f0abfc;
        --db-emerald: #6ee7b7;
        --db-amber: #fbbf24;
      }

      .digital-bridge-demo-polish {
        position: fixed;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        overflow: hidden;
      }

      .digital-bridge-demo-polish::before,
      .digital-bridge-demo-polish::after {
        content: "";
        position: absolute;
        top: 64px;
        bottom: 0;
        width: min(36vw, 620px);
        opacity: .78;
        mix-blend-mode: screen;
        transform: translate3d(0, 0, 0);
      }

      .digital-bridge-demo-polish::before {
        left: 260px;
        background:
          radial-gradient(ellipse 68% 34% at 0% 34%, rgba(34, 211, 238, .46), transparent 72%),
          linear-gradient(105deg, rgba(103, 232, 249, .15) 0 1px, transparent 1px 42px),
          linear-gradient(70deg, rgba(96, 165, 250, .12) 0 1px, transparent 1px 58px);
        mask-image: linear-gradient(90deg, rgba(0,0,0,1), rgba(0,0,0,.56) 46%, transparent 100%);
        animation: digitalBridgeSweepLeft 12s ease-in-out infinite alternate;
      }

      .digital-bridge-demo-polish::after {
        right: 0;
        background:
          radial-gradient(ellipse 68% 34% at 100% 34%, rgba(217, 70, 239, .42), transparent 72%),
          linear-gradient(75deg, rgba(240, 171, 252, .12) 0 1px, transparent 1px 48px),
          linear-gradient(110deg, rgba(167, 139, 250, .12) 0 1px, transparent 1px 62px);
        mask-image: linear-gradient(270deg, rgba(0,0,0,1), rgba(0,0,0,.56) 46%, transparent 100%);
        animation: digitalBridgeSweepRight 13s ease-in-out infinite alternate;
      }

      .malik-sovereign-sidebar {
        background:
          radial-gradient(circle at 22% 6%, rgba(34, 211, 238, .12), transparent 30%),
          radial-gradient(circle at 88% 20%, rgba(168, 85, 247, .14), transparent 32%),
          linear-gradient(180deg, rgba(3, 7, 18, .98), rgba(2, 5, 16, .98)) !important;
      }

      .malik-sidebar-create {
        background: linear-gradient(135deg, #22d3ee 0%, #7c3aed 44%, #f0abfc 100%) !important;
        color: white !important;
        box-shadow: 0 18px 70px rgba(124, 58, 237, .32), 0 0 42px rgba(34, 211, 238, .18) !important;
      }

      .malik-sidebar-nav-button {
        border-color: rgba(148, 163, 184, .12) !important;
        background:
          linear-gradient(135deg, rgba(255,255,255,.045), rgba(255,255,255,.018)),
          radial-gradient(circle at 0% 50%, rgba(34, 211, 238, .08), transparent 36%) !important;
      }

      .malik-sidebar-nav-button[data-active="true"] {
        transform: translateX(4px);
        border-color: rgba(103, 232, 249, .32) !important;
        box-shadow: 0 18px 55px rgba(0,0,0,.45), 0 0 38px rgba(34, 211, 238, .16) !important;
      }

      .malik-sidebar-nav-button::after {
        content: "";
        position: absolute;
        inset: 0;
        opacity: 0;
        background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,.13) 46%, transparent 72%);
        transform: translateX(-130%);
        transition: opacity .2s ease;
      }

      .malik-sidebar-nav-button:hover::after,
      .malik-sidebar-nav-button[data-active="true"]::after {
        opacity: 1;
        animation: digitalBridgeCardShine 3.8s ease-in-out infinite;
      }

      .studio-shell,
      .final-intelligence-home,
      .unbreakable-home,
      .command-center-home,
      .digital-bridge-section,
      .malik-media-generator-shell {
        position: relative;
        isolation: isolate;
        background:
          radial-gradient(ellipse 58% 34% at 50% 0%, rgba(96, 165, 250, .18), transparent 70%),
          radial-gradient(ellipse 42% 42% at 9% 42%, rgba(34, 211, 238, .2), transparent 72%),
          radial-gradient(ellipse 42% 42% at 91% 42%, rgba(217, 70, 239, .18), transparent 72%),
          linear-gradient(180deg, rgba(2, 6, 23, .96), rgba(3, 7, 18, .98) 58%, #02030a) !important;
      }

      .studio-shell::before,
      .final-intelligence-home::before,
      .unbreakable-home::before,
      .command-center-home::before,
      .digital-bridge-section::before,
      .malik-media-generator-shell::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        background:
          radial-gradient(circle at 14% 18%, rgba(186, 230, 253, .72) 0 1.2px, transparent 2.2px),
          radial-gradient(circle at 84% 24%, rgba(245, 208, 254, .58) 0 1.2px, transparent 2.2px),
          radial-gradient(circle at 50% 86%, rgba(129, 140, 248, .5) 0 1px, transparent 2px),
          linear-gradient(rgba(148, 163, 184, .05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(148, 163, 184, .045) 1px, transparent 1px);
        background-size: 420px 280px, 520px 340px, 360px 240px, 48px 48px, 48px 48px;
        mask-image: linear-gradient(to bottom, rgba(0,0,0,.78), rgba(0,0,0,.34) 56%, transparent 100%);
        opacity: .74;
      }

      .studio-shell::after,
      .final-intelligence-home::after,
      .unbreakable-home::after,
      .command-center-home::after,
      .digital-bridge-section::after,
      .malik-media-generator-shell::after {
        content: "DIGITAL BRIDGE DEMO READY";
        position: absolute;
        right: clamp(18px, 3vw, 48px);
        top: 82px;
        z-index: 3;
        border: 1px solid rgba(103, 232, 249, .22);
        border-radius: 999px;
        background: rgba(8, 17, 38, .72);
        color: rgba(224, 242, 254, .86);
        box-shadow: 0 0 34px rgba(34, 211, 238, .12);
        padding: 8px 12px;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: .18em;
        backdrop-filter: blur(18px);
      }

      .studio-inner,
      .final-intelligence-inner,
      .ub-inner,
      .cmd-inner,
      .digital-bridge-section > .mx-auto,
      .malik-media-generator-shell > * {
        position: relative;
        z-index: 2;
      }

      .studio-card,
      .fi-glass-card,
      .ub-card,
      .cmd-card,
      .digital-bridge-section .rounded-3xl,
      .digital-bridge-section .rounded-\\[2rem\\],
      .digital-bridge-section .rounded-\\[1\\.25rem\\] {
        border-color: rgba(148, 163, 184, .18) !important;
        background:
          linear-gradient(135deg, rgba(15, 23, 42, .84), rgba(6, 11, 26, .72)),
          radial-gradient(circle at 12% 0%, rgba(34, 211, 238, .11), transparent 34%),
          radial-gradient(circle at 88% 4%, rgba(168, 85, 247, .12), transparent 34%) !important;
        box-shadow:
          0 24px 90px rgba(0,0,0,.46),
          inset 0 1px 0 rgba(255,255,255,.06),
          0 0 42px rgba(34, 211, 238, .06) !important;
        backdrop-filter: blur(18px);
      }

      .studio-card:hover,
      .fi-glass-card:hover,
      .ub-card:hover,
      .cmd-card:hover,
      .digital-bridge-section .rounded-3xl:hover,
      .digital-bridge-section .rounded-\\[2rem\\]:hover {
        border-color: rgba(103, 232, 249, .28) !important;
        transform: translate3d(0, -2px, 0);
        box-shadow:
          0 28px 105px rgba(0,0,0,.5),
          inset 0 1px 0 rgba(255,255,255,.07),
          0 0 56px rgba(124, 58, 237, .12) !important;
      }

      .studio-page-head h1,
      .fi-header h1,
      .ub-header h1,
      .cmd-header h1,
      .digital-bridge-section h1 {
        background: linear-gradient(90deg, #fff 0%, #dbeafe 34%, var(--db-cyan) 58%, var(--db-fuchsia) 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent !important;
        text-shadow: 0 0 40px rgba(103, 232, 249, .08);
      }

      .studio-page-head,
      .fi-header,
      .ub-header,
      .cmd-header,
      .digital-bridge-section .mb-8 {
        border: 1px solid rgba(148, 163, 184, .14);
        border-radius: 28px;
        background:
          linear-gradient(135deg, rgba(255,255,255,.06), rgba(255,255,255,.025)),
          radial-gradient(circle at 10% 0%, rgba(34, 211, 238, .12), transparent 34%),
          radial-gradient(circle at 88% 0%, rgba(217, 70, 239, .12), transparent 34%);
        padding: clamp(18px, 2vw, 28px);
        box-shadow: 0 24px 80px rgba(0,0,0,.34);
      }

      .studio-topbar,
      .fi-topbar,
      .ub-topbar,
      .cmd-topbar {
        background: rgba(2, 6, 23, .72) !important;
        border-bottom: 1px solid rgba(148, 163, 184, .12);
        box-shadow: 0 18px 60px rgba(0,0,0,.24);
        backdrop-filter: blur(20px);
      }

      .studio-topbar button,
      .fi-topbar button,
      .ub-topbar button,
      .cmd-topbar button,
      .search-filter-row button,
      .studio-chip-row button,
      .ratio-grid button,
      .digital-bridge-section button {
        border-color: rgba(148, 163, 184, .16) !important;
        background: rgba(15, 23, 42, .58) !important;
        color: rgba(226, 232, 240, .9) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
      }

      .studio-topbar button:hover,
      .fi-topbar button:hover,
      .ub-topbar button:hover,
      .cmd-topbar button:hover,
      .search-filter-row button:hover,
      .studio-chip-row button:hover,
      .ratio-grid button:hover,
      .digital-bridge-section button:hover {
        border-color: rgba(103, 232, 249, .34) !important;
        background: rgba(34, 211, 238, .1) !important;
        color: white !important;
        transform: translateY(-1px);
      }

      .studio-topbar-status,
      .fi-topbar-status,
      .ub-topbar-status,
      .cmd-topbar-status {
        filter: drop-shadow(0 0 22px rgba(124, 58, 237, .22));
      }

      .studio-metric-card,
      .fi-metric-card,
      .ub-metric,
      .cmd-metric,
      .search-result,
      .quick-link,
      .photo-gallery-item,
      .cmd-agent-node,
      .ub-threat-item,
      .ub-anomaly,
      .cmd-mission-row,
      .cmd-event {
        border-color: rgba(148, 163, 184, .16) !important;
        background:
          linear-gradient(135deg, rgba(255,255,255,.055), rgba(255,255,255,.018)),
          radial-gradient(circle at 0% 0%, rgba(34, 211, 238, .1), transparent 38%) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
      }

      .search-command-bar,
      .studio-field textarea,
      .studio-field input,
      .studio-field select,
      .digital-bridge-section input {
        border-color: rgba(103, 232, 249, .2) !important;
        background: rgba(2, 6, 23, .72) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 0 38px rgba(34, 211, 238, .07);
      }

      .photo-gallery-item img {
        filter: saturate(1.12) contrast(1.05);
      }

      .photo-gallery-item::after,
      .cmd-agent-map::after,
      .ub-shield-visual::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,.08) 48%, transparent 72%);
        transform: translateX(-130%);
        animation: digitalBridgeCardShine 7s ease-in-out infinite;
      }

      .cmd-agent-map,
      .ub-shield-visual,
      .fi-orchestrator-map {
        filter: drop-shadow(0 0 30px rgba(34, 211, 238, .12));
      }

      .projects-workspace-view .project-demo-orbit,
      .design-system-view .project-demo-orbit,
      .chats-workspace-view .project-demo-orbit {
        position: absolute;
        right: 4%;
        top: 10%;
        width: 280px;
        height: 280px;
        border-radius: 999px;
        border: 1px solid rgba(103, 232, 249, .16);
        box-shadow: 0 0 90px rgba(34, 211, 238, .12), inset 0 0 60px rgba(124, 58, 237, .14);
        animation: digitalBridgePulse 9s linear infinite;
      }

      .projects-workspace-view .project-demo-orbit::before,
      .design-system-view .project-demo-orbit::before,
      .chats-workspace-view .project-demo-orbit::before {
        content: "";
        position: absolute;
        inset: 52px;
        border-radius: inherit;
        border: 1px dashed rgba(240, 171, 252, .22);
      }

      .malik-media-generator-shell {
        min-height: 100%;
      }

      @keyframes digitalBridgeSweepLeft {
        from { transform: translate3d(-2vw, 1vh, 0); opacity: .58; }
        to { transform: translate3d(2vw, -1vh, 0); opacity: .92; }
      }

      @keyframes digitalBridgeSweepRight {
        from { transform: translate3d(2vw, 1vh, 0); opacity: .58; }
        to { transform: translate3d(-2vw, -1vh, 0); opacity: .92; }
      }

      @keyframes digitalBridgeCardShine {
        0%, 42% { transform: translateX(-130%); }
        72% { transform: translateX(130%); }
        100% { transform: translateX(130%); }
      }

      @keyframes digitalBridgePulse {
        from { transform: rotate(0deg) scale(.96); opacity: .5; }
        50% { opacity: .86; }
        to { transform: rotate(360deg) scale(1.04); opacity: .5; }
      }

      @media (max-width: 1024px) {
        .digital-bridge-demo-polish::before {
          left: 0;
        }

        .studio-shell::after,
        .final-intelligence-home::after,
        .unbreakable-home::after,
        .command-center-home::after,
        .digital-bridge-section::after,
        .malik-media-generator-shell::after {
          display: none;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .digital-bridge-demo-polish::before,
        .digital-bridge-demo-polish::after,
        .malik-sidebar-nav-button::after,
        .photo-gallery-item::after,
        .cmd-agent-map::after,
        .ub-shield-visual::after,
        .project-demo-orbit {
          animation: none !important;
        }
      }
    `}</style>
  )
}

export default DigitalBridgeDemoPolish
