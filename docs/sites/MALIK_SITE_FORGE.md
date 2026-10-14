# Malik Site Forge

A website request in the chat («создай сайт на кофейню», «make a website for my dental clinic») now produces a finished multi-page site instead of a single page written freehand by the model.

## How it works

1. **Blueprint.** The business type is read from the request. There are 9 blueprints: coffee/bakery, restaurant, beauty/flowers, barber, fitness, clinic, hotel, shop, studio/services, plus a generic one. Each blueprint fixes:
   - the pages;
   - what the catalogue is called;
   - whether visitors order or book;
   - photo searches;
   - one of 7 art directions.
2. **Plan.** The selected model writes a strict JSON plan: copy, catalogue with prices, FAQ, hours. It never writes HTML.
   - A reviewer rejects weak plans (too few items, «Добро пожаловать», placeholders, wrong language) and sends them back once with the reasons.
   - Missing or invalid fields come from the blueprint, so the plan is always complete. If no model answers, the whole site is built from the blueprint, and the chat says so.
3. **Honest contacts.** A phone, address or e-mail the user did not give is replaced by a marked example, and the chat lists them. All contacts live in one `window.SITE_CONFIG` block. Example e-mails use example.com.
4. **Photos.** Photos are chosen in this order:
   1. the curated free Unsplash library, matched by each photo's real description;
   2. the licence-checked finder used by presentations (Pexels/Unsplash with keys, else Openverse/Wikimedia), with credits in the footer, within a time budget;
   3. calm colour tiles.

   Broken images become tiles before they can show a broken icon.
5. **Render.** One self-contained `index.html` contains six pages (home, catalogue, about, gallery, booking, contacts) and a not-found page. Its runtime is plain JavaScript and handles:
   - hash routing with back/forward;
   - the phone menu;
   - catalogue search, filters and sorting;
   - a basket that persists where storage exists and falls back to memory in sandboxes;
   - checkout that sends the order to WhatsApp, Telegram or e-mail, or copies it;
   - booking with time slots built from the opening hours, an «.ics» download and a WhatsApp message;
   - a lightbox;
   - an «open now» status;
   - a map embed with links to 2GIS, Yandex and Google.
6. **Quality review.** `reviewSiteHtml` checks the finished page before it is shown:
   - pages and in-site links;
   - `alert()` calls;
   - placeholders;
   - alt text;
   - form labels;
   - the phone menu;
   - basket and booking wiring.
7. **Edits.** The plan is embedded in the page (`script#malik-site`). A follow-up («сделай темнее», «добавь матча латте за 1900») edits the plan and the site is rendered again. In later model calls the 100 KB page is replaced by a one-line summary.

## Tests

- `npm run test:site-forge` runs detection, merging, contacts, photos, escaping, quality, edits, and the real chat route with stubs. It is part of `test:release-core`.
- `npm run test:site-forge-live` uses Playwright. It clicks through four generated sites at 1366 and 390 px and inside the chat's sandboxed frame.

## Not done yet

- The Sites studio (`/api/generate/website`) and the OS `site.generate` tool still use the older single-page engine.
- The curated photo library covers coffee, bakery and restaurant topics only. Other businesses rely on the live finder or tiles. Adding `PEXELS_API_KEY` (free) improves photos for every business.
- Publishing a site to its own link is not built yet.
