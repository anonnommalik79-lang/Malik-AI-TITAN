/**
 * MALIK Cinema: the motion layer every chat-built website gets.
 *
 * A model writing a whole site in one answer cannot also hand-write reliable
 * scroll choreography: it costs thousands of tokens and breaks on phones.
 * The model marks elements up instead (data-reveal, data-scene, data-scrub-*)
 * and the server appends this runtime to the finished index.html. Every site
 * gets Apple-style scroll storytelling, and stays a plain, fully readable page
 * without JavaScript, with reduced motion and in print.
 */

const MARKER = "malik-cinema"

const CSS = [
  ":root{--mc-ease:cubic-bezier(.16,1,.3,1)}",
  "@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}",
  "[id]{scroll-margin-top:var(--mc-anchor-offset,72px)}",
  "[data-reveal]{transition:opacity .9s var(--mc-ease),transform .9s var(--mc-ease),filter .9s var(--mc-ease);transition-delay:var(--mc-delay,0ms)}",
  "html.mc-js [data-reveal]:not(.mc-in){opacity:0}",
  "html.mc-js [data-reveal=\"\"]:not(.mc-in),html.mc-js [data-reveal=up]:not(.mc-in){transform:translate3d(0,48px,0)}",
  "html.mc-js [data-reveal=down]:not(.mc-in){transform:translate3d(0,-48px,0)}",
  "html.mc-js [data-reveal=left]:not(.mc-in){transform:translate3d(-64px,0,0)}",
  "html.mc-js [data-reveal=right]:not(.mc-in){transform:translate3d(64px,0,0)}",
  "html.mc-js [data-reveal=scale]:not(.mc-in){transform:scale(.92)}",
  "html.mc-js [data-reveal=zoom]:not(.mc-in){transform:scale(1.08)}",
  "html.mc-js [data-reveal=blur]:not(.mc-in){filter:blur(16px);transform:translate3d(0,24px,0)}",
  "[data-split] .mc-w{display:inline-block;transition:opacity .8s var(--mc-ease),transform .8s var(--mc-ease);transition-delay:calc(var(--mc-delay,0ms) + var(--mc-i,0) * 45ms)}",
  "html.mc-js [data-split]:not([data-split=scrub]):not(.mc-in) .mc-w{opacity:0;transform:translate3d(0,.5em,0)}",
  "[data-split=scrub] .mc-w{transition:opacity .2s linear}",
  "[data-scene]{position:relative}",
  "[data-scene]>[data-stage]{position:sticky;top:0;height:100vh;height:100svh;overflow:hidden}",
  "[data-nav]{transition:background-color .4s,box-shadow .4s,-webkit-backdrop-filter .4s,backdrop-filter .4s}",
  "[data-nav].mc-scrolled{-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px)}",
  "[data-progress]{position:fixed;top:0;left:0;width:100%;height:3px;transform-origin:0 50%;transform:scaleX(var(--mc-page,0));background:var(--mc-accent,currentColor);z-index:2147483000;pointer-events:none}",
  "[data-gallery]{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}",
  "[data-gallery]::-webkit-scrollbar{display:none}",
  "[data-gallery]>*{flex:0 0 auto;scroll-snap-align:start}",
  "[data-tilt]{transform:perspective(1000px) rotateX(var(--mc-rx,0deg)) rotateY(var(--mc-ry,0deg));transition:transform .5s var(--mc-ease),opacity .9s var(--mc-ease)}",
  "[data-magnetic]{transition:transform .4s var(--mc-ease)}",
  "@media (prefers-reduced-motion:reduce){html.mc-js [data-reveal],html.mc-js [data-split] .mc-w{opacity:1!important;transform:none!important;filter:none!important;transition:none!important}[data-scene]{height:auto!important}[data-scene]>[data-stage]{position:relative;height:auto;min-height:100vh}[data-tilt],[data-magnetic]{transform:none!important}}",
  "@media print{[data-reveal],[data-split] .mc-w{opacity:1!important;transform:none!important;filter:none!important}}",
].join("\n")

// Hides reveal targets before first paint; a runtime that never starts (an
// error, a blocked script) must not leave the page blank.
const BOOT = "document.documentElement.classList.add(\"mc-js\");setTimeout(function(){if(!window.__malikCinema)document.documentElement.classList.remove(\"mc-js\")},2500)"

// Plain ES2017 without template literals, `$` or a closing script tag, so it
// survives string replacement and inline embedding unchanged.
const RUNTIME = String.raw`(function () {
  "use strict";
  if (window.__malikCinema) return;
  window.__malikCinema = 1;
  var d = document, root = d.documentElement;
  try {
    var media = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
    var reduce = media("(prefers-reduced-motion: reduce)");
    var saveData = !!(navigator.connection && navigator.connection.saveData);
    var finePointer = media("(hover: hover) and (pointer: fine)");
    var all = function (sel, ctx) { return Array.prototype.slice.call((ctx || d).querySelectorAll(sel)); };
    var num = function (v, f) { var n = parseFloat(v); return isFinite(n) ? n : f; };
    var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
    root.classList.add("mc-js");

    // Each word becomes its own span so it can rise in or light up.
    all("[data-split]").forEach(function (el) {
      var i = 0;
      (function walk(node) {
        Array.prototype.slice.call(node.childNodes).forEach(function (child) {
          if (child.nodeType === 3) {
            if (!child.nodeValue.trim()) return;
            var frag = d.createDocumentFragment();
            child.nodeValue.split(/(\s+)/).forEach(function (part) {
              if (!part) return;
              if (/^\s+$/.test(part)) { frag.appendChild(d.createTextNode(part)); return; }
              var w = d.createElement("span");
              w.className = "mc-w";
              w.textContent = part;
              w.style.setProperty("--mc-i", String(i++));
              frag.appendChild(w);
            });
            node.replaceChild(frag, child);
          } else if (child.nodeType === 1 && !/^(script|style|svg)$/i.test(child.tagName)) walk(child);
        });
      })(el);
      el.__mcWords = all(".mc-w", el);
    });

    all("[data-stagger]").forEach(function (parent) {
      var step = num(parent.getAttribute("data-stagger"), 90);
      all("[data-reveal]", parent).forEach(function (child, i) {
        if (!child.hasAttribute("data-delay")) child.style.setProperty("--mc-delay", i * step + "ms");
      });
    });
    all("[data-delay]").forEach(function (el) { el.style.setProperty("--mc-delay", num(el.getAttribute("data-delay"), 0) + "ms"); });

    var observe = function (els, onEnter, onLeave, options) {
      if (!("IntersectionObserver" in window)) { els.forEach(onEnter); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { onEnter(e.target); if (!onLeave) io.unobserve(e.target); }
          else if (onLeave) onLeave(e.target);
        });
      }, options);
      els.forEach(function (el) { io.observe(el); });
    };

    var reveals = all("[data-reveal],[data-split]:not([data-split=scrub])");
    var show = function (el) { el.classList.add("mc-in"); };
    if (reduce) reveals.forEach(show);
    else {
      observe(reveals.filter(function (el) { return !el.hasAttribute("data-repeat"); }), show, null, { rootMargin: "0px 0px -8% 0px", threshold: 0 });
      observe(reveals.filter(function (el) { return el.hasAttribute("data-repeat"); }), show, function (el) { el.classList.remove("mc-in"); }, { rootMargin: "0px 0px -8% 0px", threshold: 0 });
    }

    // Counters: the element's own text is the no-JavaScript value.
    observe(all("[data-count]"), function (el) {
      var raw = String(el.getAttribute("data-count") || "0"), target = num(raw, 0);
      var decimals = (raw.split(".")[1] || "").length;
      var prefix = el.getAttribute("data-prefix") || "", suffix = el.getAttribute("data-suffix") || "";
      var format = function (v) { return prefix + v.toLocaleString(root.lang || undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix; };
      if (reduce) { el.textContent = format(target); return; }
      var start = 0, duration = num(el.getAttribute("data-duration"), 1600);
      var step = function (t) {
        if (!start) start = t;
        var k = clamp((t - start) / duration);
        el.textContent = format(target * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, null, { threshold: 0.4 });

    // Background video plays only while it is on screen.
    var videos = all("video[data-autoplay]");
    videos.forEach(function (v) {
      v.muted = true;
      v.setAttribute("muted", "");
      v.setAttribute("playsinline", "");
      if (reduce || saveData) { v.removeAttribute("autoplay"); v.pause(); }
    });
    if (!reduce && !saveData) observe(videos, function (v) {
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    }, function (v) { v.pause(); }, { threshold: 0.35 });

    var vh = window.innerHeight;
    var scenes = all("[data-scene]");
    scenes.forEach(function (el) {
      var length = num(el.getAttribute("data-scene"), 300);
      if (length > 100 && length < 2000) el.style.height = length + "vh";
    });
    var PROPS = ["scale", "opacity", "x", "y", "rotate", "blur", "inset", "radius"];
    var scrubs = all(PROPS.map(function (p) { return "[data-scrub-" + p + "]"; }).join(",")).map(function (el) {
      var range = String(el.getAttribute("data-scrub-range") || "0 1").trim().split(/\s+/);
      var spec = { el: el, scene: el.closest("[data-scene]"), from: num(range[0], 0), to: num(range[1], 1) };
      PROPS.forEach(function (p) {
        var raw = el.getAttribute("data-scrub-" + p);
        if (raw == null) return;
        // Two or more stops: "0 1" fades in, "0 1 1 0" fades in, holds and fades out.
        var parts = raw.trim().split(/\s+/);
        spec[p] = { v: parts.map(function (part) { return num(part, 0); }), u: (String(parts[0]).match(/[a-z%]+$/i) || [""])[0] };
      });
      el.style.willChange = "transform, opacity";
      return spec;
    });
    var scrubVideos = all("video[data-scrub-video]");
    scrubVideos.forEach(function (v) { v.pause(); v.removeAttribute("autoplay"); v.muted = true; v.setAttribute("playsinline", ""); });
    var parallax = all("[data-parallax]").map(function (el) { return { el: el, k: num(el.getAttribute("data-parallax"), 0.15) }; });
    var scrubWords = all("[data-split=scrub]");
    var navs = all("[data-nav]");

    // 0 when the scene starts to pin, 1 when it releases; an element outside a
    // scene runs from entering the bottom of the screen to leaving the top.
    var progress = function (el, scene) {
      var r = (scene || el).getBoundingClientRect();
      if (scene) {
        var travel = r.height - vh;
        if (travel > 0) return clamp(-r.top / travel);
      }
      return clamp((vh - r.top) / (vh + r.height));
    };
    var lerp = function (spec, p) {
      var v = spec.v, last = v.length - 1;
      if (last < 1) return v[0];
      if (p >= 1) return v[last];
      var at = p * last, i = Math.floor(at);
      return v[i] + (v[i + 1] - v[i]) * (at - i);
    };
    var ease = function (p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; };

    var ticking = false;
    var update = function () {
      ticking = false;
      vh = window.innerHeight;
      var max = root.scrollHeight - vh;
      root.style.setProperty("--mc-page", max > 0 ? (window.scrollY / max).toFixed(4) : "0");
      navs.forEach(function (n) { n.classList.toggle("mc-scrolled", window.scrollY > 8); });
      if (reduce) return;
      scenes.forEach(function (s) { s.style.setProperty("--p", progress(s, s).toFixed(4)); });
      scrubs.forEach(function (s) {
        // Outside a scene the parent is measured: the element moves with its own effect.
        var raw = progress(s.scene ? s.el : s.el.parentElement || s.el, s.scene);
        var p = ease(s.to > s.from ? clamp((raw - s.from) / (s.to - s.from)) : raw);
        var t = "";
        if (s.x || s.y) t += "translate3d(" + (s.x ? lerp(s.x, p) + (s.x.u || "px") : "0") + "," + (s.y ? lerp(s.y, p) + (s.y.u || "px") : "0") + ",0)";
        if (s.scale) t += " scale(" + lerp(s.scale, p).toFixed(4) + ")";
        if (s.rotate) t += " rotate(" + lerp(s.rotate, p).toFixed(2) + "deg)";
        if (t) s.el.style.transform = t;
        if (s.opacity) s.el.style.opacity = lerp(s.opacity, p).toFixed(3);
        if (s.blur) s.el.style.filter = "blur(" + lerp(s.blur, p).toFixed(1) + "px)";
        if (s.inset) {
          var inset = lerp(s.inset, p).toFixed(2);
          s.el.style.clipPath = "inset(" + inset + "% " + inset + "% round " + (s.radius ? lerp(s.radius, p).toFixed(1) : 0) + "px)";
        } else if (s.radius) s.el.style.borderRadius = lerp(s.radius, p).toFixed(1) + "px";
        s.el.style.setProperty("--p", p.toFixed(4));
      });
      scrubVideos.forEach(function (v) {
        if (!v.duration || v.readyState < 1) return;
        var target = progress(v, v.closest("[data-scene]")) * v.duration;
        if (Math.abs(v.currentTime - target) > 0.04) { try { v.currentTime = target; } catch (e) {} }
      });
      parallax.forEach(function (o) {
        // The parent is measured: the element's own box moves with the effect.
        var r = (o.el.parentElement || o.el).getBoundingClientRect();
        if (r.bottom < -vh || r.top > 2 * vh) return;
        o.el.style.transform = "translate3d(0," + ((r.top + r.height / 2 - vh / 2) * -o.k).toFixed(1) + "px,0)";
      });
      scrubWords.forEach(function (el) {
        var words = el.__mcWords || [];
        if (!words.length) return;
        var scene = el.closest("[data-scene]"), p;
        if (scene) p = progress(el, scene);
        else { var r = el.getBoundingClientRect(); p = clamp((vh * 0.85 - r.top) / (r.height + vh * 0.45)); }
        var n = words.length;
        words.forEach(function (w, i) { w.style.opacity = (0.16 + 0.84 * clamp(p * n - i)).toFixed(3); });
      });
    };
    var request = function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    scrubVideos.forEach(function (v) { v.addEventListener("loadedmetadata", request); });
    update();

    if (!reduce && finePointer) {
      all("[data-tilt]").forEach(function (el) {
        var max = num(el.getAttribute("data-tilt"), 8) || 8;
        el.addEventListener("pointermove", function (e) {
          var r = el.getBoundingClientRect();
          el.style.setProperty("--mc-ry", (((e.clientX - r.left) / r.width - 0.5) * max).toFixed(2) + "deg");
          el.style.setProperty("--mc-rx", ((0.5 - (e.clientY - r.top) / r.height) * max).toFixed(2) + "deg");
        });
        el.addEventListener("pointerleave", function () { el.style.setProperty("--mc-rx", "0deg"); el.style.setProperty("--mc-ry", "0deg"); });
      });
      all("[data-magnetic]").forEach(function (el) {
        el.addEventListener("pointermove", function (e) {
          var r = el.getBoundingClientRect();
          el.style.transform = "translate(" + ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + "px," + ((e.clientY - r.top - r.height / 2) * 0.28).toFixed(1) + "px)";
        });
        el.addEventListener("pointerleave", function () { el.style.transform = ""; });
      });
    }

    var railFor = function (id) {
      if (!id) return null;
      return d.getElementById(id) || all("[data-gallery]").filter(function (el) { return el.getAttribute("data-gallery") === id; })[0] || null;
    };
    var slide = function (rail, dir) { rail.scrollBy({ left: dir * rail.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" }); };
    all("[data-gallery-prev],[data-gallery-next]").forEach(function (btn) {
      var next = btn.hasAttribute("data-gallery-next");
      var rail = railFor(btn.getAttribute(next ? "data-gallery-next" : "data-gallery-prev"));
      if (!rail) return;
      btn.addEventListener("click", function () { slide(rail, next ? 1 : -1); });
      var sync = function () {
        btn.disabled = next ? rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4 : rail.scrollLeft < 4;
      };
      rail.addEventListener("scroll", sync, { passive: true });
      window.addEventListener("resize", sync);
      sync();
    });
    all("[data-gallery]").forEach(function (rail) {
      if (!rail.hasAttribute("tabindex")) rail.tabIndex = 0;
      rail.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        slide(rail, e.key === "ArrowRight" ? 1 : -1);
      });
    });
  } catch (error) {
    root.classList.remove("mc-js");
    if (window.console) console.warn("MALIK Cinema stopped", error);
  }
})();`

const ATTRIBUTES = /\sdata-(?:reveal|split|scene|scrub-[a-z]+|parallax|count|nav|progress|gallery(?:-prev|-next)?|tilt|magnetic|autoplay)\b/i

/** A complete HTML document with the runtime added once, or the input unchanged. */
export function withSiteCinema(html: string): string {
  if (!/<\/body\s*>/i.test(html) || html.includes(`id="${MARKER}"`) || !ATTRIBUTES.test(html)) return html
  const head = `<style id="${MARKER}-css">\n${CSS}\n</style>\n<script id="${MARKER}-boot">${BOOT}</script>\n`
  const withHead = /<\/head\s*>/i.test(html)
    ? html.replace(/<\/head\s*>/i, (tag) => head + tag)
    : html.replace(/<body\b/i, (tag) => head + tag)
  const lastBody = withHead.search(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i)
  return `${withHead.slice(0, lastBody)}<script id="${MARKER}">\n${RUNTIME}\n</script>\n${withHead.slice(lastBody)}`
}

/** Every complete HTML document in a chat answer's fenced code blocks gets the runtime. */
export function withSiteCinemaInAnswer(markdown: string): string {
  return String(markdown || "").replace(
    /(^|\n)(`{3,}|~{3,})[ \t]*(html?)\b([^\n]*)\n([\s\S]*?)\n\2[ \t]*(?=\n|$)/gi,
    (_match, lead: string, fence: string, lang: string, info: string, body: string) => `${lead}${fence}${lang}${info}\n${withSiteCinema(body)}\n${fence}`,
  )
}

/** What the model may use. The runtime is appended by the server, never written by the model. */
export const SITE_CINEMA_CONTRACT = [
  "MALIK CINEMA RUNTIME — after you finish, the server appends a tested motion runtime to index.html. Do NOT write IntersectionObserver, scroll listeners or requestAnimationFrame code for these effects; mark elements up and spend your tokens on content, layout and visuals:",
  "- data-reveal=\"up|fade|scale|left|right|blur|zoom\": entrance when scrolled into view. data-delay=\"120\" (ms) on one element, or data-stagger=\"90\" on a parent to cascade its revealing children. Hero elements use it too: they animate in on load.",
  "- data-split on a heading: its words rise in one by one. data-split=\"scrub\" on a large statement paragraph: words light up as the reader scrolls through it (the Apple manifesto effect). Never on gradient-clipped text.",
  "- data-scene=\"260\" on a <section> (its scroll length in vh) whose single direct child has data-stage: the stage pins full-screen while the scene scrolls, a cinematic chapter. Inside a scene any element can take data-scrub-scale=\"0.82 1\", data-scrub-opacity=\"0 1\", data-scrub-y=\"80px 0px\", data-scrub-x, data-scrub-rotate=\"-6 0\", data-scrub-blur=\"12 0\", data-scrub-inset=\"14 0\" (clip from a framed card to full-bleed), data-scrub-radius=\"32 0\", plus data-scrub-range=\"0 0.4\" to play during part of the scene — values may have more than two stops, so data-scrub-opacity=\"0 1 1 0\" fades a caption in, holds it and fades it out: give each caption its own range (0.1–0.4, 0.4–0.7, 0.7–1) so only one is on screen at a time. The scene element exposes --p (0…1) for your own calc(). Do not combine data-reveal and data-scrub-* on one element.",
  "- <video data-autoplay muted loop playsinline poster=…> plays only while visible (one per page). <video data-scrub-video> inside a scene scrubs with scroll; only for short clips.",
  "- data-parallax=\"0.12\" for depth on images; data-count=\"1200\" (data-prefix/data-suffix) only for real or clearly labelled figures, with the final value also written as the element's text; data-tilt on cards; data-magnetic on the primary CTA; data-nav on the sticky header (it gets class mc-scrolled after scrolling — style that state as a translucent bar, e.g. background:rgba(0,0,0,.72) or rgba(255,255,255,.72)); an empty <div data-progress> for a reading bar (colour via --mc-accent); data-gallery on a horizontal snap rail with an id, and buttons data-gallery-prev=\"that-id\" / data-gallery-next=\"that-id\".",
  "Without JavaScript, with reduced motion, and in print, all content is visible and readable — the runtime guarantees it, so write the final (visible) state of every element in normal HTML/CSS.",
].join("\n")

// A site is never a template: each brief draws its own direction, hero,
// signature scenes and chapter order. Same brief, same recipe.
const DIRECTIONS = {
  obsidian: "Obsidian — true-black chapters, the subject lit like a studio shot, white display type, one warm metallic accent; the light comes from the imagery.",
  gallery: "Gallery white — ivory and white chapters, near-black type, large photography in generous margins, hairline rules, an editorial serif or a precise grotesk.",
  colour: "Colour field — every chapter owns one saturated brand colour as a full-bleed block, huge confident type, framed or cut-out photography; joyful, not childish unless the brief is for children.",
  nocturne: "Nocturne — deep ink and navy with luminous gradients and soft glows behind subjects, glass panels, fine light-grey type; technology and night energy.",
  earth: "Earth — sand, stone, terracotta and olive, natural-light photography, a warm serif display, tactile CSS-gradient textures; hospitality, wellness and craft.",
  swiss: "Swiss precision — a strict visible grid, oversized numerals, monospaced labels, black and white with one signal colour, crisp image crops.",
} as const
type Direction = keyof typeof DIRECTIONS

const CUES: Array<[RegExp, Direction[]]> = [
  [/люкс|преми|авто|машин|car|watch|час[ыо]|ювелир|jewel|luxury|яхт|недвиж|villa|вилл/iu, ["obsidian", "gallery", "swiss"]],
  [/\bai\b|ии\b|нейро|tech|техн|app|приложен|крипт|crypto|игр|game|клуб|club|кибер|cyber|saas|стартап|startup/iu, ["nocturne", "obsidian", "swiss"]],
  [/кофе|coffee|ресторан|restaurant|кафе|cafe|отел|hotel|спа|spa|wellness|йог|yoga|ферм|farm|пекар|bakery|вин|wine|чай|tea/iu, ["earth", "gallery", "obsidian"]],
  [/дет|kids|школ|school|спорт|sport|фитнес|fitness|gym|зал|танц|dance|фестив|festival|музык|music/iu, ["colour", "swiss", "nocturne"]],
  [/архитект|architect|студи|studio|агентств|agency|портфолио|portfolio|мод[аы]|fashion|дизайн|design|фото|photo/iu, ["gallery", "swiss", "obsidian"]],
]

const HEROES = [
  "Footage hero — full-screen verified video (data-autoplay) or photograph, the name huge at the bottom-left, the promise and pill CTAs beside it.",
  "Product stage hero — the subject isolated and centred on a seamless background (a photograph framed with object-fit, or a crafted CSS/SVG/Canvas render), the giant name above it; it scales up slightly as the page starts to scroll (data-scrub-scale on an element outside a scene).",
  "Split hero — oversized words on one half (data-split), a tall framed image with data-parallax on the other, CTAs under the words.",
  "Typographic hero — a two- or three-line statement that fills the viewport width (data-split), with a thin strip of 3–4 images under it.",
  "Framed hero — the first screen is itself a data-scene: a rounded framed image with the title over it, growing to full-bleed as scrolling begins (data-scrub-inset + data-scrub-radius).",
]

const SCENES = [
  "Grow — a framed card grows to full-bleed (data-scrub-inset + data-scrub-radius + data-scrub-scale) while 2–3 captions take turns (opacity stops 0 1 1 0, consecutive ranges).",
  "Split pin — one half pins a chapter title and three short points that take turns; the other half holds three stacked images that cross-fade in step (data-scrub-opacity stops with consecutive data-scrub-range).",
  "Horizontal travel — the stage holds a wide track of 3–4 full-screen panels that slides sideways as the page scrolls (data-scrub-x=\"0% -75%\" on the track; scene length about 100vh per panel).",
  "Zoom-through — one giant word or number scales from 1 to 12 and fades (data-scrub-scale=\"1 12\", data-scrub-opacity=\"1 1 0\"), revealing the image behind it.",
  "Card deck — 3–4 full-screen cards pile up, each sliding up over the previous one (data-scrub-y=\"100vh 0vh\" with consecutive ranges) while the covered card dims (data-scrub-opacity).",
  "Window reveal — an image opens from a small centred window to the full frame (data-scrub-inset=\"46 0\" + data-scrub-radius) beneath one headline that rises in.",
]

const CHAPTERS = [
  "manifesto — one large statement with data-split=\"scrub\"",
  "feature chapters — large visuals alternating with short, confident headlines, revealed with data-stagger",
  "gallery rail — tall rounded tiles in a data-gallery with prev/next buttons",
  "bento grid — tiles in different sizes, radius 28px, subtle data-tilt",
  "specifics — specs, comparison, menu, schedule or plans as a real table or cards (real or clearly labelled sample data)",
  "process — numbered steps or a timeline told in large numerals",
  "questions — an accordion of real questions built with details/summary",
  "place — address, hours, map-like CSS illustration or contact (labelled when sample)",
]

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** This brief's own cinematic recipe: a direction, a hero, two signature scenes and a chapter order. */
export function cinemaRecipe(prompt: string) {
  const text = String(prompt || "")
  let seed = hash(text.trim().toLowerCase())
  const next = (n: number) => { seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0; return seed % n }
  const cued = CUES.find(([pattern]) => pattern.test(text))?.[1] || (Object.keys(DIRECTIONS) as Direction[])
  const direction = cued[next(cued.length)]
  const hero = HEROES[next(HEROES.length)]
  const first = next(SCENES.length)
  const second = (first + 1 + next(SCENES.length - 1)) % SCENES.length
  const pool = [...CHAPTERS]
  const chapters: string[] = []
  const count = 4 + next(3)
  while (chapters.length < count && pool.length) chapters.push(pool.splice(next(pool.length), 1)[0])
  const at = 1 + next(Math.max(1, chapters.length - 1))
  const order = [...chapters.slice(0, at), "SIGNATURE SCENE 1", ...chapters.slice(at), "SIGNATURE SCENE 2"]
  return {
    direction,
    text: [
      "THIS SITE'S CINEMATIC RECIPE — unique to this brief, not a template. Follow it for brand, product, venue, service and portfolio sites; dashboards, tools, apps and any layout the user specified keep their own structure.",
      `Visual direction: ${DIRECTIONS[direction]}`,
      `Hero: ${hero}`,
      `Signature scene 1: ${SCENES[first]}`,
      `Signature scene 2: ${SCENES[second]}`,
      `Chapter order: sticky data-nav → hero → ${order.join(" → ")} → closing full-bleed call to action → compact footer. Never repeat a chapter type; every chapter carries subject-specific content.`,
      "Ambition: a flagship launch page by a top studio — scale contrast between giant and small type, real photography in layers, depth, choreographed motion. A single generic pass never reaches it; spend the tokens on content and craft, not boilerplate.",
      "Craft: one font pairing that fits the direction (system UI stack -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif, or Google fonts); display weights 600–800 with letter-spacing -0.02em…-0.04em; body 17–19px at line-height 1.5; gradient text on at most two key words; section padding 120–180px desktop, 72–96px mobile; images object-fit:cover; every chapter readable on a 375px phone.",
      "Completeness: one <!doctype html> document with <meta name=\"viewport\">, all CSS in one <style>, any custom JavaScript in one <script> before </body>, every #anchor pointing at a real id, closing </html>.",
    ].join("\n"),
  }
}
