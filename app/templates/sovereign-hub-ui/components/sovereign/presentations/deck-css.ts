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
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card, .deck-step, .deck-bar, .deck-table tbody tr):nth-child(1) { --n: 1; }
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card, .deck-step, .deck-bar, .deck-table tbody tr):nth-child(2) { --n: 2; }
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card, .deck-step, .deck-bar, .deck-table tbody tr):nth-child(3) { --n: 3; }
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card, .deck-step, .deck-bar, .deck-table tbody tr):nth-child(4) { --n: 4; }
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card, .deck-step, .deck-bar, .deck-table tbody tr):nth-child(5) { --n: 5; }
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card, .deck-step, .deck-bar, .deck-table tbody tr):nth-child(6) { --n: 6; }
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card, .deck-step, .deck-bar, .deck-table tbody tr):nth-child(7) { --n: 7; }
.deck-slide[data-build="true"] :is(.deck-row, .deck-col, .deck-stat, .deck-card, .deck-step, .deck-bar, .deck-table tbody tr):nth-child(n+8) { --n: 8; }
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

/* The app's own reduced-motion rule cannot reach into a shadow root. */
@media (prefers-reduced-motion: reduce) {
  .deck-slide[data-build="true"] *,
  .deck-slide[data-build="true"] *::before,
  .deck-caret { animation: none !important; }
  .deck-caret { display: none; }
}
`
