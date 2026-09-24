/**
 * The stylesheet of a single slide.
 *
 * It is adopted by the shadow root every slide is drawn in (SlideRenderer),
 * so nothing from the app's global CSS can reach a slide and nothing here can
 * leak out. The slide is a fixed 1280 × 720 canvas — exactly 13.333 × 7.5
 * inches, the PowerPoint page — and the web renderer, the show, the printed
 * PDF and the .pptx export are all laid out against that one size.
 *
 * Colours come from --deck-* custom properties set on .deck-slide from the
 * theme (themes.ts), which is also what the .pptx export reads.
 */
export const DECK_CSS = `
:host {
  display: block !important;
  position: relative !important;
  width: 1280px !important;
  height: 720px !important;
  max-width: none !important;
  min-width: 1280px !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: none !important;
  box-shadow: none !important;
  transform: none !important;
}

.deck-slide {
  position: relative;
  width: 1280px;
  height: 720px;
  overflow: hidden;
  background: var(--deck-bg);
  color: var(--deck-text);
  font-family: var(--deck-body-font);
  font-size: 22px;
  font-weight: 400;
  line-height: 1.4;
  /* A slide is often drawn inside a <button> (thumbnails, recent decks), and
     buttons centre their text. Everything a button would hand down is reset
     here so a thumbnail is the same slide as the one in the editor. */
  text-align: left;
  letter-spacing: normal;
  text-transform: none;
  white-space: normal;
  font-style: normal;
  font-variant: normal;
  word-spacing: normal;
  word-break: normal;
  overflow-wrap: break-word;
  text-indent: 0;
  text-shadow: none;
  direction: ltr;
  -webkit-text-fill-color: currentColor;
  -webkit-font-smoothing: antialiased;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
:where(.deck-slide) *, :where(.deck-slide) *::before, :where(.deck-slide) *::after { box-sizing: border-box; }
:where(.deck-slide) :where(h1, h2, h3, p, ul, table) { margin: 0; }

.deck-h {
  margin: 0;
  font-family: var(--deck-heading-font);
  font-weight: var(--deck-heading-weight);
  letter-spacing: -0.028em;
  line-height: 1.04;
  color: var(--deck-text);
  text-wrap: balance;
}
.deck-muted { color: var(--deck-muted); }
.deck-accent { color: var(--deck-accent); }

.deck-pad { position: absolute; inset: 72px; display: flex; flex-direction: column; }
.deck-head { flex: 0 0 auto; min-height: 118px; display: flex; align-items: flex-end; margin-bottom: 36px; }
.deck-head .deck-h { font-size: 52px; max-width: 1100px; }
.deck-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
/* Numbers and plans read as a composition when they sit in the middle of the
   space, not pinned under the headline with a hole beneath them. */
.deck-body--center { justify-content: center; padding-bottom: 40px; }

.deck-page {
  position: absolute;
  right: 72px;
  bottom: 30px;
  font-size: 13px;
  color: var(--deck-muted);
  font-variant-numeric: tabular-nums;
  letter-spacing: .04em;
}

.deck-kicker {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--deck-accent);
}

.deck-panel {
  background: var(--deck-surface);
  border: 1px solid var(--deck-border);
  border-radius: 18px;
}

.deck-image {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--deck-surface);
  overflow: hidden;
}
.deck-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
.deck-image-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background:
    radial-gradient(120% 90% at 20% 10%, color-mix(in srgb, var(--deck-accent) 14%, transparent), transparent 60%),
    radial-gradient(100% 80% at 90% 100%, color-mix(in srgb, var(--deck-text) 7%, transparent), transparent 55%),
    var(--deck-surface);
  color: var(--deck-muted);
  font-size: 15px;
  letter-spacing: .08em;
  text-transform: uppercase;
}

/* --- title --- */
.deck-title-slide .deck-copy {
  position: absolute;
  left: 72px;
  right: 72px;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.deck-title-slide[data-image="true"] .deck-copy { right: 632px; }
.deck-title-slide .deck-h { font-size: 84px; margin: 22px 0 26px; }
.deck-title-slide[data-image="true"] .deck-h { font-size: 66px; }
.deck-title-slide .deck-sub { font-size: 26px; line-height: 1.4; color: var(--deck-muted); max-width: 900px; }
.deck-title-slide .deck-image { right: 0; width: 580px; }
.deck-title-rule { width: 72px; height: 4px; background: var(--deck-accent); border-radius: 2px; }

/* --- section --- */
.deck-section-slide .deck-copy { position: absolute; left: 72px; right: 72px; bottom: 110px; }
.deck-section-slide .deck-num { font-family: var(--deck-heading-font); font-size: 150px; font-weight: 800; line-height: .9; color: var(--deck-accent); letter-spacing: -0.04em; }
.deck-section-slide .deck-h { font-size: 72px; margin: 24px 0 18px; }
.deck-section-slide .deck-sub { font-size: 26px; color: var(--deck-muted); max-width: 880px; }

/* --- bullets --- */
.deck-intro { margin: -18px 0 22px; font-size: 22px; color: var(--deck-muted); max-width: 1000px; }
.deck-rows { display: flex; flex-direction: column; height: 100%; }
.deck-row {
  display: grid;
  grid-template-columns: 56px 400px minmax(0, 1fr);
  gap: 28px;
  align-items: start;
  flex: 1 1 0;
  max-height: 118px;
  padding: 18px 0;
  border-top: 1px solid var(--deck-border);
}
.deck-row b { font-size: 15px; font-weight: 800; color: var(--deck-accent); letter-spacing: .06em; padding-top: 5px; }
.deck-row strong { font-family: var(--deck-heading-font); font-size: 29px; font-weight: var(--deck-heading-weight); line-height: 1.15; letter-spacing: -0.015em; }
.deck-row p { margin: 0; font-size: 22px; line-height: 1.42; color: var(--deck-muted); }
.deck-row:only-child, .deck-rows[data-count="2"] .deck-row { max-height: 170px; }

/* --- two columns --- */
.deck-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: stretch; }
.deck-col { padding: 36px 40px 40px; min-height: 280px; }
.deck-col h3 { margin: 0 0 24px; font-family: var(--deck-heading-font); font-size: 31px; font-weight: var(--deck-heading-weight); letter-spacing: -0.015em; }
.deck-col:first-child h3 { color: var(--deck-muted); }
.deck-col:last-child h3 { color: var(--deck-accent); }
.deck-col ul, .deck-imgtext ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 16px; }
.deck-col li, .deck-imgtext li { position: relative; padding-left: 28px; font-size: 23px; line-height: 1.4; }
.deck-col li::before, .deck-imgtext li::before {
  content: "";
  position: absolute;
  left: 0;
  top: .62em;
  width: 10px;
  height: 2px;
  background: var(--deck-accent);
}

/* --- stat --- */
.deck-stats { display: grid; gap: 40px; align-content: center; }
.deck-stat { border-top: 3px solid var(--deck-accent); padding-top: 22px; min-width: 0; }
.deck-stat-value {
  font-family: var(--deck-heading-font);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.045em;
  color: var(--deck-accent);
  white-space: nowrap;
}
.deck-stat-label { margin-top: 20px; font-size: 24px; line-height: 1.35; color: var(--deck-text); }
.deck-context { position: absolute; left: 72px; right: 200px; bottom: 34px; font-size: 16px; color: var(--deck-muted); }

/* --- quote --- */
.deck-quote-slide .deck-copy { position: absolute; left: 110px; right: 110px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; }
.deck-quote-mark { font-family: var(--deck-heading-font); font-size: 220px; line-height: .6; height: 110px; color: var(--deck-accent); font-weight: 800; }
.deck-quote-text { font-family: var(--deck-heading-font); font-size: 48px; line-height: 1.22; letter-spacing: -0.02em; text-wrap: balance; }
.deck-quote-by { margin-top: 40px; font-size: 21px; }
.deck-quote-by strong { display: block; font-weight: 700; }
.deck-quote-by span { color: var(--deck-muted); }

/* --- image + text --- */
.deck-imgtext .deck-image { width: 540px; }
.deck-imgtext[data-side="right"] .deck-image { right: 0; }
.deck-imgtext[data-side="left"] .deck-image { left: 0; }
.deck-imgtext .deck-copy { position: absolute; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; }
.deck-imgtext[data-side="right"] .deck-copy { left: 72px; right: 612px; }
.deck-imgtext[data-side="left"] .deck-copy { left: 612px; right: 72px; }
.deck-imgtext .deck-h { font-size: 50px; margin-bottom: 26px; }
.deck-imgtext .deck-text { margin: 0 0 24px; font-size: 22px; line-height: 1.5; color: var(--deck-muted); }

/* --- cards --- */
.deck-cards { display: grid; gap: 24px; align-items: stretch; }
.deck-card { padding: 34px 32px 36px; display: flex; flex-direction: column; min-width: 0; min-height: 300px; }
.deck-card b { font-size: 15px; font-weight: 800; letter-spacing: .08em; color: var(--deck-accent); }
.deck-card h3 { margin: 40px 0 14px; font-family: var(--deck-heading-font); font-size: 32px; font-weight: var(--deck-heading-weight); line-height: 1.12; letter-spacing: -0.015em; }
.deck-card p { margin: 0; font-size: 21px; line-height: 1.45; color: var(--deck-muted); }

/* --- timeline --- */
.deck-timeline { position: relative; display: grid; gap: 24px; padding-top: 60px; }
.deck-timeline::before { content: ""; position: absolute; left: 0; right: 0; top: 68px; height: 2px; background: var(--deck-border); }
.deck-step { position: relative; min-width: 0; }
.deck-step-label { position: absolute; top: -58px; left: 0; font-size: 15px; font-weight: 800; letter-spacing: .06em; color: var(--deck-accent); white-space: nowrap; }
.deck-step-dot { width: 18px; height: 18px; border-radius: 50%; background: var(--deck-accent); box-shadow: 0 0 0 6px var(--deck-bg); }
.deck-step h3 { margin: 32px 0 12px; font-family: var(--deck-heading-font); font-size: 28px; font-weight: var(--deck-heading-weight); line-height: 1.15; letter-spacing: -0.012em; }
.deck-step p { margin: 0; font-size: 20px; line-height: 1.45; color: var(--deck-muted); padding-right: 12px; }

/* --- comparison --- */
.deck-table { width: 100%; border-collapse: collapse; font-size: 23px; }
.deck-table th, .deck-table td { padding: 17px 20px; border-bottom: 1px solid var(--deck-border); text-align: left; vertical-align: top; }
.deck-table thead th { font-size: 17px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; border-bottom: 2px solid var(--deck-border); }
.deck-table thead th:nth-child(2) { color: var(--deck-muted); }
.deck-table thead th:nth-child(3) { color: var(--deck-accent); }
.deck-table tbody th { font-weight: 700; color: var(--deck-muted); width: 26%; }
.deck-table tbody td:last-child { font-weight: 700; }
.deck-verdict { margin-top: 26px; font-size: 22px; font-weight: 700; display: flex; gap: 14px; align-items: baseline; }
.deck-verdict::before { content: ""; flex: 0 0 28px; height: 3px; background: var(--deck-accent); transform: translateY(-6px); }

/* --- chart --- */
.deck-chart { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 48px; height: 100%; }
.deck-chart[data-takeaway="false"] { grid-template-columns: minmax(0, 1fr); }
.deck-bars { display: flex; align-items: flex-end; gap: 18px; height: 100%; padding-bottom: 42px; position: relative; border-bottom: 2px solid var(--deck-border); }
.deck-bar { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; position: relative; }
.deck-bar-fill { width: 100%; max-width: 110px; border-radius: 10px 10px 0 0; background: var(--deck-accent); min-height: 4px; }
.deck-bar-value { font-size: 18px; font-weight: 800; margin-bottom: 10px; font-variant-numeric: tabular-nums; }
.deck-bar-label { position: absolute; bottom: -38px; left: 0; right: 0; text-align: center; font-size: 15px; color: var(--deck-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.deck-unit { font-size: 17px; color: var(--deck-muted); margin: -24px 0 22px; }
.deck-takeaway { align-self: start; border-left: 3px solid var(--deck-accent); padding-left: 24px; font-size: 25px; line-height: 1.35; font-family: var(--deck-heading-font); font-weight: var(--deck-heading-weight); }

/* --- closing --- */
.deck-closing-slide .deck-copy { position: absolute; inset: 0 110px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
.deck-closing-slide .deck-h { font-size: 76px; margin: 28px 0 24px; }
.deck-closing-slide .deck-sub { font-size: 26px; color: var(--deck-muted); max-width: 900px; }
.deck-contact { margin-top: 42px; padding: 12px 22px; border-radius: 999px; border: 1px solid var(--deck-border); font-size: 20px; font-weight: 700; color: var(--deck-accent); }

/* ------------------------------------------------------------- shapes
 *
 * Soft light behind the content, drawn per layout: a glow in a corner, a ring
 * behind a chapter number, a halo behind a closing line. Photo layouts have
 * their photograph instead.
 */
.deck-deco { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.deck-deco i,
.deck-deco b { position: absolute; display: block; border-radius: 50%; }
.deck-deco i {
  right: -240px;
  top: -280px;
  width: 660px;
  height: 660px;
  background: radial-gradient(circle, color-mix(in srgb, var(--deck-accent) 24%, transparent) 0%, transparent 66%);
}
.deck-deco b {
  left: -180px;
  bottom: -250px;
  width: 460px;
  height: 460px;
  background: radial-gradient(circle, color-mix(in srgb, var(--deck-accent) 12%, transparent) 0%, transparent 66%);
}
.deck-slide[data-dark="false"] .deck-deco i { background: radial-gradient(circle, color-mix(in srgb, var(--deck-accent) 13%, transparent) 0%, transparent 66%); }
.deck-slide[data-dark="false"] .deck-deco b { background: radial-gradient(circle, color-mix(in srgb, var(--deck-accent) 7%, transparent) 0%, transparent 66%); }
.deck-slide[data-layout="section"] .deck-deco b {
  left: auto;
  right: -140px;
  bottom: -200px;
  width: 620px;
  height: 620px;
  background: none;
  border: 2px solid color-mix(in srgb, var(--deck-accent) 30%, transparent);
  box-shadow: inset 0 0 0 60px color-mix(in srgb, var(--deck-accent) 4%, transparent);
}
.deck-slide[data-layout="closing"] .deck-deco i { right: 50%; top: -360px; transform: translateX(50%); width: 900px; height: 900px; }
.deck-slide[data-layout="closing"] .deck-deco b {
  left: 50%;
  bottom: -520px;
  width: 1000px;
  height: 700px;
  transform: translateX(-50%);
  background: none;
  border: 2px solid color-mix(in srgb, var(--deck-accent) 22%, transparent);
}
.deck-slide:is([data-layout="hero"], [data-layout="gallery"], [data-layout="image-text"]) .deck-deco { display: none; }

/* ------------------------------------------------------------- photos */
.deck-credit {
  position: absolute;
  right: 12px;
  bottom: 10px;
  z-index: 2;
  max-width: 78%;
  overflow: hidden;
  padding: 4px 10px;
  border-radius: 99px;
  background: rgba(0, 0, 0, .5);
  color: rgba(255, 255, 255, .88);
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.deck-image-empty { font-size: 0; }
/* The cover photo meets the text on a diagonal, not a hard vertical edge. */
.deck-title-slide .deck-image { width: 610px; clip-path: polygon(15% 0, 100% 0, 100% 100%, 0 100%); }
/* Photo beside text: a framed picture, not half the slide painted over. */
.deck-imgtext .deck-image {
  top: 44px;
  bottom: 44px;
  width: 520px;
  border-radius: 28px;
  box-shadow: 0 30px 70px rgba(0, 0, 0, .28);
}
.deck-imgtext[data-side="right"] .deck-image { right: 44px; }
.deck-imgtext[data-side="left"] .deck-image { left: 44px; }
.deck-imgtext[data-side="right"] .deck-copy { left: 72px; right: 620px; }
.deck-imgtext[data-side="left"] .deck-copy { left: 620px; right: 72px; }

/* --- hero: one photograph, the words over it --- */
.deck-hero-photo { position: absolute; inset: 0; overflow: hidden; background: var(--deck-surface); }
.deck-hero-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.deck-hero-photo .deck-image-empty {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(90% 90% at 80% 20%, color-mix(in srgb, var(--deck-accent) 45%, transparent), transparent 60%),
    radial-gradient(80% 80% at 10% 100%, color-mix(in srgb, var(--deck-accent) 25%, transparent), transparent 60%),
    #0b0b0f;
}
.deck-hero-shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(0, 0, 0, .8) 0%, rgba(0, 0, 0, .5) 42%, rgba(0, 0, 0, .1) 74%, rgba(0, 0, 0, 0) 100%),
    linear-gradient(0deg, rgba(0, 0, 0, .55) 0%, rgba(0, 0, 0, 0) 48%);
}
.deck-hero .deck-copy { position: absolute; left: 88px; right: 360px; bottom: 96px; }
.deck-hero .deck-kicker { color: #fff; opacity: .82; }
.deck-hero .deck-h {
  margin: 18px 0 0;
  font-size: 86px;
  line-height: 1.02;
  color: #fff;
  text-shadow: 0 6px 34px rgba(0, 0, 0, .35);
}
.deck-hero .deck-sub { margin: 26px 0 0; max-width: 760px; font-size: 28px; line-height: 1.38; color: rgba(255, 255, 255, .86); }

/* --- features: icon cards --- */
.deck-features { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
.deck-features[data-count="4"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.deck-feature {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  padding: 32px 30px 34px;
  overflow: hidden;
  border: 1px solid var(--deck-border);
  border-radius: 26px;
  background: var(--deck-surface);
}
.deck-feature::after {
  content: "";
  position: absolute;
  right: -60px;
  top: -60px;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--deck-accent) 14%, transparent), transparent 70%);
}
.deck-features[data-count="4"] .deck-feature { flex-direction: row; align-items: center; gap: 24px; padding: 26px 30px; }
.deck-features:is([data-count="5"], [data-count="6"]) .deck-feature { gap: 14px; padding: 24px 24px 26px; }
.deck-feature-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 66px;
  height: 66px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--deck-accent) 16%, transparent);
  color: var(--deck-accent);
}
.deck-feature-icon svg { width: 32px; height: 32px; }
.deck-features:is([data-count="5"], [data-count="6"]) .deck-feature-icon { width: 54px; height: 54px; border-radius: 16px; }
.deck-features:is([data-count="5"], [data-count="6"]) .deck-feature-icon svg { width: 26px; height: 26px; }
.deck-feature h3 { margin: 0 0 8px; font-family: var(--deck-heading-font); font-size: 27px; font-weight: var(--deck-heading-weight); line-height: 1.15; letter-spacing: -0.015em; }
.deck-feature p { margin: 0; font-size: 19px; line-height: 1.45; color: var(--deck-muted); }
.deck-features:is([data-count="5"], [data-count="6"]) .deck-feature h3 { font-size: 23px; }
.deck-features:is([data-count="5"], [data-count="6"]) .deck-feature p { font-size: 17px; }

/* --- process: arrows --- */
.deck-process { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.deck-process[data-count="4"] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.deck-process[data-count="5"] { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.deck-process-step { min-width: 0; }
.deck-process-step + .deck-process-step { margin-left: -22px; }
.deck-process-arrow {
  position: relative;
  height: 158px;
  padding: 28px 58px 24px 58px;
  background:
    linear-gradient(135deg, color-mix(in srgb, #fff 16%, transparent), transparent 60%),
    var(--deck-accent);
  color: var(--deck-on-accent);
  clip-path: polygon(0 0, calc(100% - 40px) 0, 100% 50%, calc(100% - 40px) 100%, 0 100%, 40px 50%);
}
.deck-process-step:first-child .deck-process-arrow { padding-left: 34px; clip-path: polygon(0 0, calc(100% - 40px) 0, 100% 50%, calc(100% - 40px) 100%, 0 100%); }
.deck-process-step:nth-child(even) .deck-process-arrow {
  background:
    linear-gradient(135deg, color-mix(in srgb, #fff 10%, transparent), transparent 60%),
    color-mix(in srgb, var(--deck-accent) 80%, var(--deck-bg));
}
.deck-process-arrow b { display: block; font-size: 15px; font-weight: 800; letter-spacing: .12em; opacity: .72; }
.deck-process-arrow h3 { margin: 8px 0 0; font-family: var(--deck-heading-font); font-size: 25px; font-weight: var(--deck-heading-weight); line-height: 1.12; }
.deck-process[data-count="5"] .deck-process-arrow h3 { font-size: 21px; }
.deck-process-step p { margin: 0; padding: 22px 30px 0 40px; font-size: 19px; line-height: 1.45; color: var(--deck-muted); }
.deck-process-step:first-child p { padding-left: 16px; }
.deck-process[data-count="5"] .deck-process-step p { font-size: 17px; }

/* --- gallery: photographs side by side --- */
.deck-gallery { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; height: 100%; }
.deck-gallery[data-count="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.deck-gallery-item { display: flex; flex-direction: column; min-width: 0; min-height: 0; margin: 0; }
.deck-gallery-photo {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--deck-border);
  border-radius: 24px;
  background: var(--deck-surface);
  box-shadow: 0 24px 50px rgba(0, 0, 0, .22);
}
.deck-gallery-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.deck-gallery-photo .deck-image-empty { position: absolute; inset: 0; }
.deck-gallery-item figcaption { margin-top: 16px; font-family: var(--deck-heading-font); font-size: 22px; font-weight: var(--deck-heading-weight); line-height: 1.25; }

.deck-features[data-count="3"] .deck-feature { min-height: 320px; padding: 36px 32px 38px; }
.deck-features[data-count="3"] .deck-feature-icon { width: 74px; height: 74px; border-radius: 22px; }
.deck-features[data-count="3"] .deck-feature-icon svg { width: 36px; height: 36px; }
.deck-features[data-count="3"] .deck-feature h3 { font-size: 29px; }
.deck-features[data-count="3"] .deck-feature p { font-size: 20px; }
.deck-slide[data-dark="false"] .deck-feature::after { opacity: .45; }
/* The page number moves to the free corner when the photo takes the right. */
.deck-imgtext[data-side="right"] .deck-page { right: auto; left: 72px; }

/* --- cards: a line of accent on top, a number in a pill --- */
.deck-card { position: relative; overflow: hidden; }
.deck-card::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: linear-gradient(90deg, var(--deck-accent), color-mix(in srgb, var(--deck-accent) 20%, transparent)); }
.deck-card b {
  align-self: flex-start;
  padding: 6px 12px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--deck-accent) 14%, transparent);
}

/* ---------------------------------------------------------- inline editing */

.deck-edit { outline: none; border-radius: 6px; cursor: text; transition: box-shadow .12s; }
.deck-slide[data-editable="true"] .deck-edit:hover { box-shadow: 0 0 0 2px color-mix(in srgb, var(--deck-accent) 35%, transparent); }
.deck-slide[data-editable="true"] .deck-edit:focus { box-shadow: 0 0 0 2px var(--deck-accent); }
.deck-edit:empty::before { content: attr(data-placeholder); opacity: .4; }

/* ------------------------------------------------------------- assembling
 *
 * data-build="true" is a slide that has just been written. The headline is
 * typed by the renderer; everything else waits for it (--t, set on the slide)
 * and then takes its place in reading order. --n is an element's position in
 * its row of siblings, --m a list item's position inside its column.
 */

@keyframes deck-rise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
@keyframes deck-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes deck-grow-x { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes deck-grow-y { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes deck-pop { 0% { opacity: 0; transform: scale(.55); } 70% { opacity: 1; transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
@keyframes deck-wipe { from { clip-path: inset(0 0 0 100%); } to { clip-path: inset(0 0 0 0); } }
@keyframes deck-blink { 50% { opacity: 0; } }

.deck-caret {
  display: inline-block;
  width: 0;
  height: .9em;
  margin: 0 -1px -0.08em 0;
  border-left: 3px solid var(--deck-accent);
  animation: deck-blink .9s steps(1) infinite;
}
.deck-caret[data-done="true"] { animation: deck-fade .3s reverse forwards; animation-delay: .5s; }

.deck-slide[data-build="true"] {
  --ease: cubic-bezier(.2, .8, .2, 1);
  --t: 800ms;
  /* Pace: below 1 when the writing is ahead of the show and it catches up. */
  --k: 1;
}
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card, .deck-step, .deck-bar, .deck-table tbody tr, .deck-feature, .deck-process-step, .deck-gallery-item):nth-child(1) { --n: 1; }
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card, .deck-step, .deck-bar, .deck-table tbody tr, .deck-feature, .deck-process-step, .deck-gallery-item):nth-child(2) { --n: 2; }
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card, .deck-step, .deck-bar, .deck-table tbody tr, .deck-feature, .deck-process-step, .deck-gallery-item):nth-child(3) { --n: 3; }
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card, .deck-step, .deck-bar, .deck-table tbody tr, .deck-feature, .deck-process-step, .deck-gallery-item):nth-child(4) { --n: 4; }
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card, .deck-step, .deck-bar, .deck-table tbody tr, .deck-feature, .deck-process-step, .deck-gallery-item):nth-child(5) { --n: 5; }
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card, .deck-step, .deck-bar, .deck-table tbody tr, .deck-feature, .deck-process-step, .deck-gallery-item):nth-child(6) { --n: 6; }
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card, .deck-step, .deck-bar, .deck-table tbody tr, .deck-feature, .deck-process-step, .deck-gallery-item):nth-child(7) { --n: 7; }
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card, .deck-step, .deck-bar, .deck-table tbody tr, .deck-feature, .deck-process-step, .deck-gallery-item):nth-child(n+8) { --n: 8; }
.deck-slide[data-build="true"] li:nth-child(1) { --m: 1; }
.deck-slide[data-build="true"] li:nth-child(2) { --m: 2; }
.deck-slide[data-build="true"] li:nth-child(3) { --m: 3; }
.deck-slide[data-build="true"] li:nth-child(4) { --m: 4; }
.deck-slide[data-build="true"] li:nth-child(5) { --m: 5; }
.deck-slide[data-build="true"] li:nth-child(n+6) { --m: 6; }

/* Before the headline: the frame of the slide. */
.deck-slide[data-build="true"] :is(.deck-kicker, .deck-num) { animation: deck-rise .5s var(--ease) both; }
.deck-slide[data-build="true"] .deck-quote-mark { animation: deck-pop .6s var(--ease) both; }
.deck-slide[data-build="true"] .deck-image { animation: deck-wipe .9s var(--ease) both; animation-delay: .15s; }
.deck-slide[data-build="true"] .deck-closing-slide .deck-title-rule { animation: deck-grow-x .5s var(--ease) both; }

/* After the headline: everything else, in reading order. */
.deck-slide[data-build="true"] :is(.deck-title-slide, .deck-section-slide) .deck-title-rule {
  transform-origin: left center;
  animation: deck-grow-x .55s var(--ease) both;
  animation-delay: calc(var(--t) * var(--k, 1));
}
.deck-slide[data-build="true"] :is(.deck-sub, .deck-intro, .deck-text, .deck-quote-by, .deck-unit) {
  animation: deck-rise .6s var(--ease) both;
  animation-delay: calc((var(--t) + 150ms) * var(--k, 1));
}
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card) {
  animation: deck-rise .6s var(--ease) both;
  animation-delay: calc((var(--t) + var(--n, 1) * 160ms) * var(--k, 1));
}
.deck-slide[data-build="true"] .deck-stat { border-top-color: transparent; position: relative; }
.deck-slide[data-build="true"] .deck-stat::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: -3px;
  height: 3px;
  background: var(--deck-accent);
  transform-origin: left center;
  animation: deck-grow-x .7s var(--ease) both;
  animation-delay: calc((var(--t) + var(--n, 1) * 160ms) * var(--k, 1));
}
.deck-slide[data-build="true"] :is(.deck-col, .deck-imgtext) li {
  animation: deck-rise .5s var(--ease) both;
  animation-delay: calc((var(--t) + var(--n, 1) * 160ms + var(--m, 1) * 100ms + 120ms) * var(--k, 1));
}
.deck-slide[data-build="true"] .deck-timeline::before {
  transform-origin: left center;
  animation: deck-grow-x .9s var(--ease) both;
  animation-delay: calc(var(--t) * var(--k, 1));
}
.deck-slide[data-build="true"] .deck-step {
  animation: deck-rise .6s var(--ease) both;
  animation-delay: calc((var(--t) + 200ms + var(--n, 1) * 170ms) * var(--k, 1));
}
.deck-slide[data-build="true"] .deck-step-dot {
  animation: deck-pop .5s var(--ease) both;
  animation-delay: calc((var(--t) + 200ms + var(--n, 1) * 170ms) * var(--k, 1));
}
.deck-slide[data-build="true"] .deck-table thead tr {
  animation: deck-fade .5s var(--ease) both;
  animation-delay: calc(var(--t) * var(--k, 1));
}
.deck-slide[data-build="true"] .deck-table tbody tr {
  animation: deck-rise .5s var(--ease) both;
  animation-delay: calc((var(--t) + 100ms + var(--n, 1) * 120ms) * var(--k, 1));
}
.deck-slide[data-build="true"] .deck-verdict {
  animation: deck-rise .6s var(--ease) both;
  animation-delay: calc((var(--t) + 950ms) * var(--k, 1));
}
.deck-slide[data-build="true"] .deck-bar-fill {
  transform-origin: center bottom;
  animation: deck-grow-y .8s var(--ease) both;
  animation-delay: calc((var(--t) + var(--n, 1) * 120ms) * var(--k, 1));
}
.deck-slide[data-build="true"] .deck-bar-value {
  animation: deck-fade .4s var(--ease) both;
  animation-delay: calc((var(--t) + var(--n, 1) * 120ms + 500ms) * var(--k, 1));
}
.deck-slide[data-build="true"] :is(.deck-bar-label, .deck-page, .deck-context) {
  animation: deck-fade .5s var(--ease) both;
  animation-delay: calc((var(--t) + 200ms) * var(--k, 1));
}
.deck-slide[data-build="true"] .deck-takeaway {
  animation: deck-rise .6s var(--ease) both;
  animation-delay: calc((var(--t) + 900ms) * var(--k, 1));
}
.deck-slide[data-build="true"] .deck-contact {
  animation: deck-pop .6s var(--ease) both;
  animation-delay: calc((var(--t) + 350ms) * var(--k, 1));
}

/* New layouts. */
@keyframes deck-zoom { from { transform: scale(1.14); } to { transform: scale(1); } }
@keyframes deck-slide-in { from { opacity: 0; transform: translateX(-26px); } to { opacity: 1; transform: none; } }
.deck-slide[data-build="true"] .deck-hero-photo img { animation: deck-zoom 3.2s cubic-bezier(.2, .7, .2, 1) both; }
.deck-slide[data-build="true"] .deck-hero-shade { animation: deck-fade .9s var(--ease) both; }
.deck-slide[data-build="true"] :is(.deck-feature, .deck-gallery-item) {
  animation: deck-rise .6s var(--ease) both;
  animation-delay: calc((var(--t) + var(--n, 1) * 150ms) * var(--k, 1));
}
.deck-slide[data-build="true"] .deck-process-step {
  animation: deck-slide-in .55s var(--ease) both;
  animation-delay: calc((var(--t) + var(--n, 1) * 170ms) * var(--k, 1));
}
.deck-slide[data-build="true"] .deck-feature-icon { animation: deck-pop .55s var(--ease) both; animation-delay: calc((var(--t) + var(--n, 1) * 150ms + 180ms) * var(--k, 1)); }
.deck-slide[data-build="true"] .deck-gallery-photo img { animation: deck-zoom 2.4s cubic-bezier(.2, .7, .2, 1) both; }

/* The app's own reduced-motion rule cannot reach into a shadow root. */
@media (prefers-reduced-motion: reduce) {
  .deck-slide[data-build="true"] *,
  .deck-slide[data-build="true"] *::before,
  .deck-caret { animation: none !important; }
  .deck-caret { display: none; }
}
`
