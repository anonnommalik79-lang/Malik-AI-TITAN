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

8. **Interface skills.** `lib/sites/forge/skills.ts` lists 26 patterns from open-source GitHub design systems. They are rewritten in the forge's own code; no library or script is loaded from them. Examples:
   - Magic UI: the bento grid, the marquee and the number ticker;
   - Swiper: the snap carousel;
   - PhotoSwipe: the photo counter;
   - AOS: scroll reveal;
   - GOV.UK Frontend: the form error summary;
   - Cal.com: time slots as buttons;
   - focus-trap: focus stays inside dialogs;
   - Radix Colors and Open Props: colour and motion tokens;
   - Schema.org: opening hours and offers;
   - HTML5 Boilerplate: meta tags and the favicon.

   A skill is reported only when its markup is in the finished page. The chat lists the skills by group, with links. The copy rules of the matching registry skills go into the planner prompt.

## Other entry points

- The Sites studio (`/api/generate/website`) sends local businesses to the forge, keeping the same response shape. «Изменить» posts `previousHtml`, and a forge page is edited through its embedded plan. Other requests (SaaS, product landings) keep the older engine.
- The OS `site.generate` tool uses the forge only for local businesses. Software products and startups keep the landing engine.

## Publishing by link

Press «Опубликовать» in the chat's code bar or in the Sites studio. The site becomes available at `malikaiworld.world/site/<id>`. Publishing again after an edit updates the same link, and the author can take it down.

Only forge pages can be published. The server renders the page again from its cleaned plan; the HTML the browser sent is never stored. The page is served with a sandboxing CSP, so it cannot read the visitor's session.

Publishing needs the same private bucket as chat history (`PRIVATE_STATE_BUCKET` or `R2_BUCKET` with keys). Without the bucket, the button says that publishing is unavailable.

## Tests

- `npm run test:site-forge` (part of `test:release-core`) covers:
  - detection, merging and contacts;
  - photos and escaping;
  - quality and edits;
  - skills and structured data;
  - the studio and OS routing;
  - the real chat route with stubs.
- `npm run test:site-forge-live` uses Playwright to click through four generated sites at 1366 and 390 px and inside the chat's sandboxed frame. It also checks the new behaviour:
  - time buttons;
  - the error summary;
  - the photo counter;
  - focus traps;
  - scroll reveal and counters;
  - the carousel.

## Not done yet

- The curated photo library covers only coffee, bakery and restaurant topics. Other businesses rely on the live finder or on colour tiles. Adding `PEXELS_API_KEY` (free) improves photos for every business.
