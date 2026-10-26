/**
 * MALIK Cinema: the motion layer every chat-built website gets.
 *
 * A model writing a whole site in one answer cannot also hand-write reliable
 * scroll choreography, preloaders, shaders and cursors: it costs thousands of
 * tokens and breaks on phones. The model marks elements up instead
 * (data-reveal, data-scene, data-shader, data-loader...) and the server
 * appends this runtime to the finished index.html. Every site gets the
 * techniques of award-winning studio sites, and stays a plain, fully readable
 * page without JavaScript, with reduced motion and in print.
 */

const MARKER = "malik-cinema"

const GRAIN = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"

const CSS = [
  ":root{--mc-ease:cubic-bezier(.16,1,.3,1)}",
  "@media (prefers-reduced-motion:no-preference){html:not([data-smooth]){scroll-behavior:smooth}}",
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
  "[data-reveal=mask]{transition:clip-path 1.4s var(--mc-ease),transform 1.6s var(--mc-ease);transition-delay:var(--mc-delay,0ms)}",
  "html.mc-js [data-reveal=mask]:not(.mc-in){opacity:1;clip-path:inset(100% 0 0 0);transform:scale(1.08)}",
  "[data-split] .mc-w{display:inline-block;transition:opacity .8s var(--mc-ease),transform .8s var(--mc-ease);transition-delay:calc(var(--mc-delay,0ms) + var(--mc-i,0) * 45ms)}",
  "html.mc-js [data-split=\"\"]:not(.mc-in) .mc-w,html.mc-js [data-split=words]:not(.mc-in) .mc-w{opacity:0;transform:translate3d(0,.5em,0)}",
  "[data-split=scrub] .mc-w{transition:opacity .2s linear}",
  "[data-split=chars] .mc-w{white-space:nowrap}",
  "[data-split=chars] .mc-c{display:inline-block;transition:opacity .6s var(--mc-ease),transform .9s var(--mc-ease);transition-delay:calc(var(--mc-delay,0ms) + var(--mc-i,0) * 22ms)}",
  "html.mc-js [data-split=chars]:not(.mc-in) .mc-c{opacity:0;transform:translate3d(0,.45em,0) rotate(8deg)}",
  "[data-split=lines] .mc-line{display:block;overflow:hidden;padding-bottom:.12em;margin-bottom:-.12em}",
  "[data-split=lines] .mc-line>span{display:inline-block;transition:transform 1.1s var(--mc-ease);transition-delay:calc(var(--mc-delay,0ms) + var(--mc-l,0) * 90ms)}",
  "html.mc-js [data-split=lines]:not(.mc-in) .mc-line>span{transform:translate3d(0,110%,0)}",
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
  "[data-marquee]{overflow:hidden;white-space:nowrap}",
  "[data-marquee]>.mc-track{display:inline-flex;align-items:center;will-change:transform}",
  "html:not(.mc-js) [data-loader]{display:none!important}",
  "[data-loader]{position:fixed;inset:0;z-index:2147483003;transition:transform 1.1s var(--mc-ease),visibility 0s 1.1s}",
  "html.mc-loaded [data-loader]{transform:translate3d(0,-100%,0);visibility:hidden;pointer-events:none}",
  ".mc-cursor{position:fixed;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#fff;mix-blend-mode:difference;pointer-events:none;z-index:2147483002;display:grid;place-items:center;transition:width .35s var(--mc-ease),height .35s var(--mc-ease),margin .35s var(--mc-ease),opacity .3s;font:600 12px/1.1 system-ui,sans-serif;color:#000;text-align:center}",
  ".mc-cursor.mc-big{width:72px;height:72px;margin:-36px 0 0 -36px}",
  ".mc-cursor.mc-label{width:96px;height:96px;margin:-48px 0 0 -48px;mix-blend-mode:normal;background:var(--mc-accent,#fff)}",
  ".mc-cursor span{opacity:0;padding:0 8px;transition:opacity .2s}.mc-cursor.mc-label span{opacity:1}",
  "html.mc-js body{transition:background-color .9s var(--mc-ease),color .9s var(--mc-ease)}",
  `[data-grain]::after{content:"";position:fixed;left:-50%;top:-50%;width:200%;height:200%;background-image:url("${GRAIN}");opacity:var(--mc-grain,.07);pointer-events:none;z-index:2147483001;animation:mc-grain 1.2s steps(6) infinite}`,
  "@keyframes mc-grain{0%,100%{transform:translate(0,0)}20%{transform:translate(-6%,4%)}40%{transform:translate(5%,-3%)}60%{transform:translate(-3%,-6%)}80%{transform:translate(6%,3%)}}",
  "@media (prefers-reduced-motion:no-preference){[data-kenburns]{animation:mc-kb 24s ease-in-out infinite alternate}}",
  "@keyframes mc-kb{from{transform:scale(1) translate3d(0,0,0)}to{transform:scale(1.1) translate3d(-1.5%,-1%,0)}}",
  "canvas[data-shader]{display:block;width:100%;height:100%}",
  "@media (prefers-reduced-motion:reduce){html.mc-js [data-reveal],html.mc-js [data-split] .mc-w,html.mc-js [data-split] .mc-c,html.mc-js [data-split] .mc-line>span{opacity:1!important;transform:none!important;filter:none!important;clip-path:none!important;transition:none!important}[data-scene]{height:auto!important}[data-scene]>[data-stage]{position:relative;height:auto;min-height:100vh}[data-tilt],[data-magnetic],[data-skew]{transform:none!important}[data-grain]::after{animation:none}}",
  "@media print{[data-reveal],[data-split] .mc-w,[data-split] .mc-c,[data-split] .mc-line>span{opacity:1!important;transform:none!important;filter:none!important;clip-path:none!important}[data-loader],.mc-cursor,[data-grain]::after{display:none!important}}",
].join("\n")

// Hides reveal targets before first paint; a runtime that never starts (an
// error, a blocked script) must not leave the page blank or behind a loader.
const BOOT = "document.documentElement.classList.add(\"mc-js\");setTimeout(function(){if(!window.__malikCinema)document.documentElement.classList.remove(\"mc-js\")},2500)"

// Plain ES2017 without template literals or a closing script tag, so it
// survives inline embedding unchanged.
const RUNTIME_SOURCE = String.raw`(function () {
  "use strict";
  if (window.__malikCinema) return;
  window.__malikCinema = 2;
  var d = document, root = d.documentElement;
  try {
    var media = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
    var reduce = media("(prefers-reduced-motion: reduce)");
    var saveData = !!(navigator.connection && navigator.connection.saveData);
    var finePointer = media("(hover: hover) and (pointer: fine)");
    var coarse = media("(pointer: coarse)");
    var all = function (sel, ctx) { return Array.prototype.slice.call((ctx || d).querySelectorAll(sel)); };
    var num = function (v, f) { var n = parseFloat(v); return isFinite(n) ? n : f; };
    var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
    root.classList.add("mc-js");

    // Work that waits for the preloader to leave, so the hero animates in view.
    var loaded = false, afterLoad = [];
    var whenLoaded = function (fn) { if (loaded) fn(); else afterLoad.push(fn); };
    var finishLoad = function () {
      if (loaded) return;
      loaded = true;
      root.classList.add("mc-loaded");
      afterLoad.splice(0).forEach(function (fn) { fn(); });
    };

    // Words, characters and lines become their own spans.
    var splitWords = function (el, chars) {
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
              if (chars) {
                Array.prototype.forEach.call(part, function (ch) {
                  var c = d.createElement("span");
                  c.className = "mc-c";
                  c.textContent = ch;
                  c.style.setProperty("--mc-i", String(i++));
                  w.appendChild(c);
                });
              } else {
                w.textContent = part;
                w.style.setProperty("--mc-i", String(i++));
              }
              frag.appendChild(w);
            });
            node.replaceChild(frag, child);
          } else if (child.nodeType === 1 && !/^(script|style|svg)$/i.test(child.tagName)) walk(child);
        });
      })(el);
      el.__mcWords = all(".mc-w", el);
    };
    var splitLines = function (el) {
      if (el.__mcText == null) el.__mcText = el.textContent;
      var words = el.__mcText.trim().split(/\s+/);
      el.textContent = "";
      var spans = words.map(function (word, i) {
        var s = d.createElement("span");
        s.style.display = "inline-block";
        s.textContent = word;
        el.appendChild(s);
        if (i < words.length - 1) el.appendChild(d.createTextNode(" "));
        return s;
      });
      var lines = [], top = null;
      spans.forEach(function (s) {
        if (top === null || Math.abs(s.offsetTop - top) > 2) { lines.push([]); top = s.offsetTop; }
        lines[lines.length - 1].push(s.textContent);
      });
      el.textContent = "";
      lines.forEach(function (line, i) {
        var outer = d.createElement("span"), inner = d.createElement("span");
        outer.className = "mc-line";
        inner.textContent = line.join(" ");
        inner.style.setProperty("--mc-l", String(i));
        outer.appendChild(inner);
        el.appendChild(outer);
      });
    };
    var lineEls = [];
    all("[data-split]").forEach(function (el) {
      var mode = el.getAttribute("data-split") || "";
      if (mode === "lines" && !el.children.length) { splitLines(el); lineEls.push(el); return; }
      splitWords(el, mode === "chars");
    });
    if (lineEls.length) {
      var lineWidth = window.innerWidth;
      var resplit = function () { lineEls.forEach(splitLines); };
      if (d.fonts && d.fonts.ready) d.fonts.ready.then(resplit);
      window.addEventListener("resize", function () {
        if (Math.abs(window.innerWidth - lineWidth) < 40) return;
        lineWidth = window.innerWidth;
        resplit();
      });
    }

    all("[data-stagger]").forEach(function (parent) {
      var step = num(parent.getAttribute("data-stagger"), 90);
      all("[data-reveal]", parent).forEach(function (child, i) {
        if (!child.hasAttribute("data-delay")) child.style.setProperty("--mc-delay", i * step + "ms");
      });
    });
    all("[data-delay]").forEach(function (el) { el.style.setProperty("--mc-delay", num(el.getAttribute("data-delay"), 0) + "ms"); });

    var observe = function (els, onEnter, onLeave, options) {
      if (!els.length) return;
      if (!("IntersectionObserver" in window)) { els.forEach(onEnter); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { onEnter(e.target); if (!onLeave) io.unobserve(e.target); }
          else if (onLeave) onLeave(e.target);
        });
      }, options);
      els.forEach(function (el) { io.observe(el); });
    };

    var GLYPHS = "!<>-_/[]{}=+*^?#ABCDEFGHXYZ0123456789";
    var scramble = function (el) {
      if (reduce || el.__mcScrambled || el.children.length) return;
      el.__mcScrambled = 1;
      var final = el.textContent, start = 0, duration = num(el.getAttribute("data-scramble"), 900) || 900;
      var step = function (t) {
        if (!start) start = t;
        var k = clamp((t - start) / duration), out = "";
        for (var i = 0; i < final.length; i++) {
          var ch = final.charAt(i);
          out += ch === " " || i / final.length < k ? ch : GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
        }
        el.textContent = k < 1 ? out : final;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    var reveals = all("[data-reveal],[data-split]:not([data-split=scrub])");
    var show = function (el) { el.classList.add("mc-in"); if (el.hasAttribute("data-scramble")) scramble(el); };
    whenLoaded(function () {
      if (reduce) { reveals.forEach(show); return; }
      var margin = { rootMargin: "0px 0px -8% 0px", threshold: 0 };
      observe(reveals.filter(function (el) { return !el.hasAttribute("data-repeat"); }), show, null, margin);
      observe(reveals.filter(function (el) { return el.hasAttribute("data-repeat"); }), show, function (el) { el.classList.remove("mc-in"); }, margin);
      observe(all("[data-scramble]").filter(function (el) { return !el.hasAttribute("data-reveal"); }), scramble, null, margin);
    });

    // Counters: the element's own text is the no-JavaScript value.
    whenLoaded(function () {
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
    });

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

    // Preloader: counts 0-100 while the first images arrive, then lifts away.
    var loader = d.querySelector("[data-loader]");
    if (loader && !reduce) {
      var counter = loader.querySelector("[data-loader-count]");
      var images = all("img").filter(function (img) { return img.getAttribute("loading") !== "lazy"; }).slice(0, 12);
      var began = Date.now(), shown = 0;
      var tick = function () {
        var elapsed = Date.now() - began;
        var ready = images.length ? images.filter(function (img) { return img.complete; }).length / images.length : 1;
        var target = elapsed > 3500 ? 1 : Math.min(ready, elapsed / 1100);
        shown += (target * 100 - shown) * 0.16;
        if (target >= 1 && shown > 99.4) shown = 100;
        if (counter) counter.textContent = String(Math.round(shown));
        loader.style.setProperty("--mc-load", (shown / 100).toFixed(3));
        if (shown >= 100) { setTimeout(finishLoad, 220); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      setTimeout(finishLoad, 5000);
    } else {
      if (loader) { var count = loader.querySelector("[data-loader-count]"); if (count) count.textContent = "100"; }
      finishLoad();
    }

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

    // Rows lean into fast scrolling and settle when it stops.
    var skews = all("[data-skew]");
    if (skews.length && !reduce) {
      var lastY = window.scrollY, skewTarget = 0, skewNow = 0, skewing = false;
      var settle = function () {
        skewNow += (skewTarget - skewNow) * 0.15;
        skewTarget *= 0.85;
        skews.forEach(function (el) { el.style.transform = "skewY(" + skewNow.toFixed(3) + "deg)"; });
        if (Math.abs(skewNow) > 0.01 || Math.abs(skewTarget) > 0.01) requestAnimationFrame(settle);
        else { skewing = false; skews.forEach(function (el) { el.style.transform = ""; }); }
      };
      window.addEventListener("scroll", function () {
        var y = window.scrollY, limit = num(skews[0].getAttribute("data-skew"), 6) || 6;
        skewTarget = Math.max(-limit, Math.min(limit, (y - lastY) * 0.22));
        lastY = y;
        if (!skewing) { skewing = true; requestAnimationFrame(settle); }
      }, { passive: true });
    }

    // Chapters tint the whole page as they reach the middle of the screen; a
    // chapter without data-fg keeps the site's own text colour, and the page
    // returns to its own colours when no tinted chapter is in the middle.
    var tinted = all("[data-bg]"), tint = null;
    var paint = function (el) {
      tint = el;
      d.body.style.backgroundColor = el ? el.getAttribute("data-bg") : "";
      d.body.style.color = el ? el.getAttribute("data-fg") || "" : "";
      if (el) root.style.setProperty("--mc-bg", el.getAttribute("data-bg"));
      else root.style.removeProperty("--mc-bg");
    };
    if (tinted.length) observe(tinted, paint, function (el) { if (tint === el) paint(null); }, { rootMargin: "-50% 0px -50% 0px", threshold: 0 });

    // Endless tickers; "scroll" follows the reader's scroll direction and speed.
    var marquees = [];
    all("[data-marquee]").forEach(function (box) {
      var track = d.createElement("div");
      track.className = "mc-track";
      while (box.firstChild) track.appendChild(box.firstChild);
      box.appendChild(track);
      var unit = track.scrollWidth || 1, originals = Array.prototype.slice.call(track.childNodes);
      var copies = Math.max(2, Math.ceil((box.clientWidth * 2) / unit) + 1);
      for (var i = 1; i < copies; i++) originals.forEach(function (node) {
        var copy = node.cloneNode(true);
        if (copy.nodeType === 1) copy.setAttribute("aria-hidden", "true");
        track.appendChild(copy);
      });
      if (reduce) return;
      var mode = box.getAttribute("data-marquee");
      var item = { box: box, track: track, unit: unit, speed: num(box.getAttribute("data-marquee-speed"), 60), dir: mode === "right" ? 1 : -1, follow: mode === "scroll", x: mode === "right" ? -unit : 0, hover: false, visible: true };
      box.addEventListener("pointerenter", function () { item.hover = true; });
      box.addEventListener("pointerleave", function () { item.hover = false; });
      marquees.push(item);
    });
    if (marquees.length) {
      observe(marquees.map(function (m) { return m.box; }), function (el) { marquees.forEach(function (m) { if (m.box === el) m.visible = true; }); }, function (el) { marquees.forEach(function (m) { if (m.box === el) m.visible = false; }); }, { threshold: 0 });
      var lastScroll = window.scrollY, boost = 0, scrollDir = -1, then = 0;
      window.addEventListener("scroll", function () {
        var y = window.scrollY;
        if (y !== lastScroll) scrollDir = y > lastScroll ? -1 : 1;
        boost = Math.min(8, boost + Math.abs(y - lastScroll) * 0.02);
        lastScroll = y;
      }, { passive: true });
      var roll = function (now) {
        var dt = then ? Math.min(0.05, (now - then) / 1000) : 0;
        then = now;
        boost *= 0.92;
        marquees.forEach(function (m) {
          if (!m.visible) return;
          var dir = m.follow ? scrollDir : m.dir;
          m.x += dir * m.speed * (m.hover ? 0.25 : 1) * (1 + boost) * dt;
          if (m.x <= -m.unit) m.x += m.unit;
          if (m.x > 0) m.x -= m.unit;
          m.track.style.transform = "translate3d(" + m.x.toFixed(2) + "px,0,0)";
        });
        requestAnimationFrame(roll);
      };
      requestAnimationFrame(roll);
    }

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

      // A follower cursor that grows over links and shows labels over media.
      if (d.querySelector("[data-cursor]")) {
        var cursor = d.createElement("div"), label = d.createElement("span");
        cursor.className = "mc-cursor";
        cursor.setAttribute("aria-hidden", "true");
        cursor.appendChild(label);
        d.body.appendChild(cursor);
        var cx = -100, cy = -100, tx = -100, ty = -100;
        window.addEventListener("pointermove", function (e) { tx = e.clientX; ty = e.clientY; cursor.style.opacity = "1"; }, { passive: true });
        d.addEventListener("pointerleave", function () { cursor.style.opacity = "0"; });
        d.addEventListener("pointerover", function (e) {
          var hit = e.target && e.target.closest ? e.target.closest("[data-cursor-text],a,button,summary,input,select,textarea,[role=button]") : null;
          var text = hit && hit.getAttribute("data-cursor-text");
          cursor.classList.toggle("mc-big", !!hit && !text);
          cursor.classList.toggle("mc-label", !!text);
          label.textContent = text || "";
        });
        var follow = function () {
          cx += (tx - cx) * 0.2;
          cy += (ty - cy) * 0.2;
          cursor.style.transform = "translate3d(" + cx.toFixed(1) + "px," + cy.toFixed(1) + "px,0)";
          requestAnimationFrame(follow);
        };
        requestAnimationFrame(follow);
      }
    }

    // Inertia scrolling for the wheel. Touch, keyboard and scrollbars stay native.
    if (!reduce && !coarse && (root.hasAttribute("data-smooth") || (d.body && d.body.hasAttribute("data-smooth")))) {
      root.setAttribute("data-smooth", "");
      root.style.scrollBehavior = "auto";
      var aim = window.scrollY, here = aim, gliding = false;
      var limit = function () { return root.scrollHeight - window.innerHeight; };
      var scrollsItself = function (el, dy) {
        for (; el && el !== d.body && el !== root; el = el.parentElement) {
          var style = window.getComputedStyle(el);
          if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) {
            if ((dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) || (dy < 0 && el.scrollTop > 0)) return true;
          }
        }
        return false;
      };
      var glide = function () {
        here += (aim - here) * 0.1;
        if (Math.abs(aim - here) < 0.5) here = aim;
        window.scrollTo(0, here);
        if (here !== aim) requestAnimationFrame(glide);
        else gliding = false;
      };
      var go = function (y) {
        aim = Math.max(0, Math.min(limit(), y));
        if (!gliding) { here = window.scrollY; gliding = true; requestAnimationFrame(glide); }
      };
      window.addEventListener("wheel", function (e) {
        if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY) || scrollsItself(e.target, e.deltaY)) return;
        e.preventDefault();
        go((gliding ? aim : window.scrollY) + e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1));
      }, { passive: false });
      window.addEventListener("scroll", function () { if (!gliding) aim = here = window.scrollY; }, { passive: true });
      d.addEventListener("click", function (e) {
        var link = e.target && e.target.closest ? e.target.closest("a[href^='#']") : null;
        var id = link && link.getAttribute("href").slice(1);
        var target = id && d.getElementById(decodeURIComponent(id));
        if (!target) return;
        e.preventDefault();
        go(target.getBoundingClientRect().top + window.scrollY - num(window.getComputedStyle(root).getPropertyValue("--mc-anchor-offset"), 72));
        if (history.pushState) history.pushState(null, "", "#" + id);
      });
    }

    // WebGL backdrops: aurora, mesh and liquid, coloured from data-colors.
    var VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
    var HEAD = "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n" +
      "uniform float t;uniform vec2 r;uniform vec2 m;uniform vec3 a;uniform vec3 b;uniform vec3 c;" +
      "float h(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}" +
      "float n(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}" +
      "float fbm(vec2 q){float v=0.,s=.5;for(int i=0;i<5;i++){v+=s*n(q);q*=2.03;s*=.5;}return v;}" +
      "vec3 dither(vec3 col,vec2 uv){return col+(h(uv*r+t)-.5)/128.;}";
    var SHADERS = {
      aurora: "void main(){vec2 uv=gl_FragCoord.xy/r;vec2 q=uv*vec2(r.x/r.y,1.);float f=fbm(q*vec2(1.2,2.4)+vec2(t*.04,-t*.06));float band=smoothstep(.15,.85,uv.y+.35*(f-.5)+.08*sin(q.x*2.+t*.3));vec3 col=mix(a,b,band);col=mix(col,c,smoothstep(.55,1.,f+.25*(1.-uv.y))*.75);col+=.18*c*exp(-6.*length(uv-m));gl_FragColor=vec4(dither(col,uv),1.);}",
      mesh: "void main(){vec2 uv=gl_FragCoord.xy/r;float k=r.x/r.y;vec2 q=vec2(uv.x*k,uv.y);vec2 p1=vec2(k*(.3+.2*sin(t*.21)),.3+.2*cos(t*.17));vec2 p2=vec2(k*(.7+.2*cos(t*.13)),.7+.2*sin(t*.19));vec2 p3=vec2(k*m.x,m.y);float w1=1./(.02+pow(length(q-p1),2.));float w2=1./(.02+pow(length(q-p2),2.));float w3=.6/(.05+pow(length(q-p3),2.));vec3 col=(a*w1+b*w2+c*w3)/(w1+w2+w3);col*=.9+.1*fbm(q*3.+t*.05);gl_FragColor=vec4(dither(col,uv),1.);}",
      liquid: "void main(){vec2 uv=gl_FragCoord.xy/r;vec2 q=uv*vec2(r.x/r.y,1.)*2.2;vec2 o=vec2(fbm(q+t*.05),fbm(q+vec2(5.2,1.3)-t*.04));vec2 s=vec2(fbm(q+3.*o+vec2(1.7,9.2)+t*.06),fbm(q+3.*o+vec2(8.3,2.8)));float f=fbm(q+3.*s+(m-.5));vec3 col=mix(a,b,clamp(f*f*2.2,0.,1.));col=mix(col,c,clamp(length(s)*.9-.25,0.,1.));gl_FragColor=vec4(dither(col,uv),1.);}"
    };
    var rgb = function (hex) {
      var x = String(hex || "").replace("#", "");
      if (x.length === 3) x = x.charAt(0) + x.charAt(0) + x.charAt(1) + x.charAt(1) + x.charAt(2) + x.charAt(2);
      var v = parseInt(x.slice(0, 6), 16) || 0;
      return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
    };
    all("canvas[data-shader]").forEach(function (canvas) {
      var colors = String(canvas.getAttribute("data-colors") || "#0b1020 #4f46e5 #ec4899").trim().split(/\s+/);
      var fallback = function () { canvas.style.background = "linear-gradient(135deg," + colors.join(",") + ")"; };
      var gl = null;
      try { gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: "low-power" }); } catch (e) {}
      if (!gl) { fallback(); return; }
      var program;
      try {
        var compile = function (type, src) {
          var s = gl.createShader(type);
          gl.shaderSource(s, src);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
          return s;
        };
        program = gl.createProgram();
        gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, HEAD + (SHADERS[canvas.getAttribute("data-shader")] || SHADERS.mesh)));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("link");
      } catch (e) { fallback(); return; }
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var at = gl.getAttribLocation(program, "p");
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
      var u = function (name) { return gl.getUniformLocation(program, name); };
      ["a", "b", "c"].forEach(function (name, i) { gl.uniform3fv(u(name), rgb(colors[Math.min(i, colors.length - 1)])); });
      var mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5, began = performance.now(), visible = true;
      var draw = function (now) {
        var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        var w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
        mx += (tmx - mx) * 0.05;
        my += (tmy - my) * 0.05;
        gl.uniform2f(u("r"), w, h);
        gl.uniform2f(u("m"), mx, my);
        gl.uniform1f(u("t"), reduce ? 0 : (now - began) / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      if (reduce) { draw(began); return; }
      window.addEventListener("pointermove", function (e) {
        var rect = canvas.getBoundingClientRect();
        tmx = clamp((e.clientX - rect.left) / Math.max(1, rect.width));
        tmy = clamp(1 - (e.clientY - rect.top) / Math.max(1, rect.height));
      }, { passive: true });
      observe([canvas], function () { visible = true; }, function () { visible = false; }, { threshold: 0 });
      var frame = function (now) { if (visible && !d.hidden) draw(now); requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    });

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
    root.classList.add("mc-loaded");
    if (window.console) console.warn("MALIK Cinema stopped", error);
  }
})();`

// Shipped without indentation and comment lines: a third smaller, same code.
const RUNTIME = RUNTIME_SOURCE.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("//")).join("\n")

const ATTRIBUTES = /\sdata-(?:reveal|split|scene|scrub-[a-z]+|parallax|count|nav|progress|gallery(?:-prev|-next)?|tilt|magnetic|autoplay|marquee|cursor|loader|bg|skew|grain|shader|smooth|scramble|kenburns)\b/i

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
  "MALIK CINEMA RUNTIME — after you finish, the server appends a tested motion runtime to index.html. Do NOT write IntersectionObserver, scroll, wheel, cursor, preloader or WebGL code for these effects; mark elements up and spend your tokens on content, layout and visuals:",
  "- data-reveal=\"up|fade|scale|left|right|blur|zoom|mask\": entrance when scrolled into view (mask = the element is uncovered from the bottom — use it on photographs). data-delay=\"120\" (ms) on one element, or data-stagger=\"90\" on a parent to cascade its revealing children.",
  "- data-split on a heading: its words rise in one by one; data-split=\"lines\" (plain-text headings only): each line slides up out of a mask — the signature studio headline; data-split=\"chars\": letters cascade in; data-split=\"scrub\" on a large statement: words light up as the reader scrolls through it. Never on gradient-clipped text. data-scramble on a short label or number: it decodes from random glyphs when it appears.",
  "- data-scene=\"260\" on a <section> (its scroll length in vh) whose single direct child has data-stage: the stage pins full-screen while the scene scrolls. Inside a scene any element can take data-scrub-scale=\"0.82 1\", data-scrub-opacity=\"0 1\", data-scrub-y=\"80px 0px\", data-scrub-x=\"0% -75%\", data-scrub-rotate=\"-6 0\", data-scrub-blur=\"12 0\", data-scrub-inset=\"14 0\" (clip from a framed card to full-bleed), data-scrub-radius=\"32 0\", plus data-scrub-range=\"0 0.4\" to play during part of the scene; values may have more than two stops, so data-scrub-opacity=\"0 1 1 0\" fades a caption in, holds it and fades it out: give each caption its own range (0.1–0.4, 0.4–0.7, 0.7–1) so only one is on screen at a time. The scene element exposes --p (0…1) for your own calc(). Do not combine data-reveal and data-scrub-* on one element.",
  "- <video data-autoplay muted loop playsinline poster=…> plays only while visible (one per page). <video data-scrub-video> inside a scene scrubs with scroll; only for short clips.",
  "- <canvas data-shader=\"aurora|mesh|liquid\" data-colors=\"#bg #accent #third\"> fills its box with a live WebGL gradient that follows the pointer (static with reduced motion, CSS gradient without WebGL) — a premium hero or chapter backdrop when no photograph fits; put it absolutely behind content.",
  "- A preloader: <div data-loader> styled as you like (full-screen, brand colour) containing <span data-loader-count>0</span>; it counts to 100 while the first images arrive, then lifts away and only then do the hero animations play. Without JavaScript it never shows.",
  "- data-marquee on a row of words or logos: an endless ticker (data-marquee=\"right\" reverses, data-marquee=\"scroll\" follows the reader's scroll; data-marquee-speed=\"60\" px/s). data-skew on a wrapper of image rows: it leans into fast scrolling. data-bg=\"#hex\" (and data-fg) on transparent chapters: the whole page re-tints as each chapter reaches mid-screen. data-kenburns on an inner <img>: a slow filmic drift. data-grain on <body>: animated film grain (--mc-grain: .05–.09).",
  "- data-cursor on <body>: a follower cursor that grows over links; data-cursor-text=\"Смотреть\" on a card or image shows a label in it. data-smooth on <html>: inertia wheel scrolling (touch and keyboard stay native).",
  "- data-parallax=\"0.12\" for depth on images; data-count=\"1200\" (data-prefix/data-suffix) only for real or clearly labelled figures, with the final value also written as the element's text; data-tilt on cards; data-magnetic on the primary CTA; data-nav on the sticky header (it gets class mc-scrolled after scrolling — style that state as a translucent bar); an empty <div data-progress> for a reading bar (colour via --mc-accent); data-gallery on a horizontal snap rail with an id, and buttons data-gallery-prev=\"that-id\" / data-gallery-next=\"that-id\".",
  "Without JavaScript, with reduced motion, and in print, all content is visible and readable — the runtime guarantees it, so write the final (visible) state of every element in normal HTML/CSS.",
].join("\n")

// A site is never a template: each brief draws its own direction, hero,
// signature scenes, chapter order, type and palette. Same brief, same recipe.
const DIRECTIONS = {
  obsidian: "Obsidian — true-black chapters, the subject lit like a studio shot, white display type, one warm metallic accent; the light comes from the imagery.",
  gallery: "Gallery white — ivory and white chapters, near-black type, large photography in generous margins, hairline rules, an editorial serif or a precise grotesk.",
  colour: "Colour field — every chapter owns one saturated brand colour as a full-bleed block, huge confident type, framed or cut-out photography; joyful, not childish unless the brief is for children.",
  nocturne: "Nocturne — deep ink and navy with luminous gradients and soft glows behind subjects, glass panels, fine light-grey type; technology and night energy.",
  earth: "Earth — sand, stone, terracotta and olive, natural-light photography, a warm serif display, tactile CSS-gradient textures; hospitality, wellness and craft.",
  swiss: "Swiss precision — a strict visible grid, oversized numerals, monospaced labels, black and white with one signal colour, crisp image crops.",
} as const
type Direction = keyof typeof DIRECTIONS

// bg, surface, text, muted, accent — each checked for readable text contrast.
const PALETTES: Record<Direction, string[][]> = {
  obsidian: [["#000000", "#0f0f12", "#f5f5f7", "#86868b", "#d4a373"], ["#050505", "#141414", "#fafafa", "#8a8a8a", "#c9a227"], ["#08090c", "#16181d", "#eef1f6", "#7d8592", "#9ad1ff"]],
  gallery: [["#faf9f6", "#ffffff", "#111111", "#6b6b6b", "#b4532a"], ["#f4f1ea", "#ffffff", "#1a1a1a", "#6f6b63", "#2f5d50"], ["#ffffff", "#f3f3f3", "#0a0a0a", "#6a6a6a", "#1f3fff"]],
  colour: [["#ff4f1f", "#ffd23f", "#111111", "#3b3b3b", "#2449ff"], ["#1fd1a5", "#ffe14d", "#0b0b0b", "#2d2d2d", "#ff3d7f"], ["#7c3aed", "#fde047", "#0a0a0a", "#2b2b2b", "#22d3ee"]],
  nocturne: [["#05060f", "#0e1124", "#e8ecff", "#8b93b8", "#7c5cff"], ["#030712", "#0b1530", "#e6f0ff", "#7f8db3", "#22d3ee"], ["#0a0414", "#1a0f2e", "#f3e8ff", "#a08cc4", "#f472b6"]],
  earth: [["#f3ede4", "#e7dccb", "#2a2118", "#6e5f4f", "#b5653a"], ["#efeae0", "#dcd3c2", "#23251f", "#62625a", "#6b7b3a"], ["#f6f0e8", "#eadbc8", "#30241b", "#77685a", "#9c4a2f"]],
  swiss: [["#ffffff", "#f2f2f2", "#000000", "#666666", "#ff3b00"], ["#f5f5f0", "#e9e9e2", "#111111", "#5f5f5f", "#0047ff"], ["#0b0b0b", "#1a1a1a", "#f5f5f5", "#8c8c8c", "#e5ff00"]],
}

// Display and body faces. Russian and Kazakh sites only get faces with Cyrillic.
const CYRILLIC_FONTS: Record<Direction, string[][]> = {
  obsidian: [["Manrope", "Manrope"], ["Unbounded", "Inter"], ["Montserrat", "Inter"]],
  gallery: [["Cormorant Garamond", "Manrope"], ["Playfair Display", "Inter"], ["Prata", "Golos Text"]],
  colour: [["Unbounded", "Onest"], ["Russo One", "Manrope"], ["Rubik", "Rubik"]],
  nocturne: [["Unbounded", "IBM Plex Sans"], ["Exo 2", "Inter"], ["Manrope", "JetBrains Mono"]],
  earth: [["Prata", "Manrope"], ["Cormorant Garamond", "Lora"], ["Forum", "Jost"]],
  swiss: [["Inter", "JetBrains Mono"], ["Golos Text", "IBM Plex Mono"], ["Onest", "IBM Plex Mono"]],
}
const LATIN_FONTS: Record<Direction, string[][]> = {
  obsidian: [["Inter Tight", "Inter"], ["Syne", "Inter"], ["Space Grotesk", "Inter"]],
  gallery: [["Instrument Serif", "Inter"], ["Fraunces", "Manrope"], ["Playfair Display", "Inter"]],
  colour: [["Bricolage Grotesque", "Inter"], ["Syne", "Manrope"], ["Unbounded", "Inter"]],
  nocturne: [["Space Grotesk", "Inter"], ["Sora", "Inter"], ["Unbounded", "JetBrains Mono"]],
  earth: [["Fraunces", "Inter"], ["DM Serif Display", "Manrope"], ["Cormorant Garamond", "Lora"]],
  swiss: [["Inter Tight", "JetBrains Mono"], ["Space Grotesk", "Space Mono"], ["Archivo", "IBM Plex Mono"]],
}
// Weights each family really has: Google Fonts rejects a request for one it lacks.
const WEIGHTS: Record<string, string> = {
  Manrope: "300;400;600;800", Unbounded: "400;600;800", Inter: "300;400;600;800", Montserrat: "300;400;600;800",
  "Cormorant Garamond": "300;500;700", "Playfair Display": "400;600;800", "Golos Text": "400;600;800", Onest: "300;400;600;800",
  Rubik: "300;400;600;800", "IBM Plex Sans": "300;400;600", "Exo 2": "300;400;600;800", "JetBrains Mono": "400;600", Lora: "400;600",
  Jost: "300;400;600", "IBM Plex Mono": "400;600", "Inter Tight": "400;600;800", Syne: "400;600;800", "Space Grotesk": "300;400;600",
  Fraunces: "300;400;600;800", "Bricolage Grotesque": "400;600;800", Sora: "300;400;600;800", "Space Mono": "400;700", Archivo: "400;600;800",
}

const TECHNIQUES: Record<Direction, string[]> = {
  obsidian: ["a preloader counting 0–100 (data-loader)", "a follower cursor with labels on media (data-cursor, data-cursor-text)", "film grain (data-grain)", "line-mask headlines (data-split=\"lines\")", "mask reveals on every photograph (data-reveal=\"mask\")"],
  gallery: ["inertia wheel scrolling (data-smooth on <html>)", "line-mask headlines (data-split=\"lines\")", "mask reveals on photographs", "chapters re-tinting the page as they pass (data-bg)", "a slow marquee of the brand's words"],
  colour: ["chapters re-tinting the page (data-bg + data-fg)", "a fast marquee band following the scroll (data-marquee=\"scroll\")", "velocity skew on image rows (data-skew)", "character-cascade headlines (data-split=\"chars\")", "magnetic CTAs (data-magnetic)"],
  nocturne: ["a WebGL shader backdrop behind the hero (canvas data-shader=\"aurora\" or \"liquid\" in the palette's colours)", "scrambling labels and numbers (data-scramble)", "a follower cursor with labels", "film grain", "glass panels over the shader (backdrop-filter)"],
  earth: ["a slow filmic drift on photographs (data-kenburns)", "line-mask headlines", "mask reveals on photographs", "inertia wheel scrolling", "film grain at low strength"],
  swiss: ["character-cascade numerals (data-split=\"chars\")", "scrambling monospaced labels", "a marquee ticker", "counters for real figures (data-count)", "a follower cursor with labels"],
}

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
  "Split hero — oversized words on one half (data-split=\"lines\"), a tall framed image with data-parallax on the other, CTAs under the words.",
  "Typographic hero — a two- or three-line statement that fills the viewport width (data-split=\"lines\"), with a thin strip of 3–4 images under it.",
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
  "story — the brand's origin and values in long-form editorial copy beside a tall photograph",
  "marquee band — an endless ticker of the brand's key words between chapters (data-marquee)",
  "materials or details — close-up photographs with captions on craft, ingredients, technology or quality",
  "people or community — who it is for, in situations, without invented names, quotes or reviews",
]

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function fontLink(display: string, body: string) {
  const family = (name: string) => `family=${name.replace(/ /g, "+")}${WEIGHTS[name] ? `:wght@${WEIGHTS[name]}` : ""}`
  const families = display === body ? [display] : [display, body]
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?${families.map(family).join("&")}&display=swap" rel="stylesheet">`
}

/** This brief's own cinematic recipe: direction, tokens, hero, two signature scenes, techniques and chapter order. */
export function cinemaRecipe(prompt: string, options: { offline?: boolean } = {}) {
  const text = String(prompt || "")
  let seed = hash(text.trim().toLowerCase())
  const next = (n: number) => { seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0; return seed % n }
  const cued = CUES.find(([pattern]) => pattern.test(text))?.[1] || (Object.keys(DIRECTIONS) as Direction[])
  const direction = cued[next(cued.length)]
  const palette = PALETTES[direction][next(3)]
  const faces = (/[а-яёәіңғүұқөһ]/iu.test(text) ? CYRILLIC_FONTS : LATIN_FONTS)[direction][next(3)]
  const hero = HEROES[next(HEROES.length)]
  const first = next(SCENES.length)
  const second = (first + 1 + next(SCENES.length - 1)) % SCENES.length
  const pool = [...CHAPTERS]
  const chapters: string[] = []
  const count = 8 + next(3)
  while (chapters.length < count && pool.length) chapters.push(pool.splice(next(pool.length), 1)[0])
  const at = 2 + next(Math.max(1, chapters.length - 3))
  const order = [...chapters.slice(0, at), "SIGNATURE SCENE 1", ...chapters.slice(at), "SIGNATURE SCENE 2"]
  const [bg, surface, ink, muted, accent] = palette
  const stack = (name: string) => `'${name}', ${/Mono/.test(name) ? "ui-monospace, monospace" : /Garamond|Playfair|Prata|Forum|Lora|Fraunces|Serif/.test(name) ? "Georgia, serif" : "system-ui, sans-serif"}`
  const tokens = `:root{--bg:${bg};--surface:${surface};--text:${ink};--muted:${muted};--accent:${accent};--mc-accent:${accent};--display:${options.offline ? "system-ui, sans-serif" : stack(faces[0])};--body:${options.offline ? "system-ui, sans-serif" : stack(faces[1])}}`
  return {
    direction,
    text: [
      "THIS SITE'S CINEMATIC RECIPE — unique to this brief, not a template. Follow it for brand, product, venue, service and portfolio sites; dashboards, tools, apps and any layout the user specified keep their own structure.",
      `Visual direction: ${DIRECTIONS[direction]}`,
      `Design tokens — use them (adjust a value only to keep text contrast at 4.5:1): ${options.offline ? "" : `${fontLink(faces[0], faces[1])} in <head>, then `}${tokens}. Display headings use var(--display), body copy var(--body).`,
      `Hero: ${hero}`,
      `Signature scene 1: ${SCENES[first]}`,
      `Signature scene 2: ${SCENES[second]}`,
      `Studio techniques for this site (use every one): ${TECHNIQUES[direction].join("; ")}.`,
      `Chapter order: sticky data-nav → hero → ${order.join(" → ")} → closing full-bleed call to action → footer with real navigation. Never repeat a chapter type; every chapter carries subject-specific content.`,
      "DEPTH — this is a complete flagship site, never a short landing stub: 10–14 chapters between the hero and the footer, at least 1,200 words of specific, finished copy in the user's language (no filler, no lorem), every chapter with at least three meaningful elements (heading, copy, visual, data, control). Long pages are expected; keep the CSS compact and let the runtime carry the motion so the content fits.",
      "IMAGES AND FOOTAGE — use every verified photo and video supplied, large: full-bleed or big framed crops, never thumbnails or stretched. The hero visual is eager with fetchpriority=\"high\" and decoding=\"async\"; the rest loading=\"lazy\". Wrap images in aspect-ratio boxes with object-fit:cover and a deliberate object-position; grade them consistently (e.g. filter:contrast(1.05) saturate(1.06)); put gradient scrims under any text on a photo; make stills feel filmed with data-reveal=\"mask\", data-parallax or data-kenburns. Video: data-autoplay muted loop playsinline with its poster, full-bleed in the hero or a scene. With no verified media, craft visuals with CSS/SVG or a data-shader canvas instead of empty boxes.",
      "Craft: display weights 600–800 with letter-spacing -0.02em…-0.04em and clamp() sizes up to 9–12vw for hero words, with a phone minimum small enough that the longest word fits a 375px screen (34–40px for long Russian words) plus hyphens:auto and overflow-wrap:break-word on headings; body 17–19px at line-height 1.5–1.65 with 60–72ch measure; gradient text on at most two key words; section padding 120–180px desktop, 72–96px mobile; hairline borders in muted at 20% alpha; hover and focus states on every control; every chapter readable on a 375px phone.",
      "Completeness: one <!doctype html> document with <meta name=\"viewport\">, all CSS in one <style>, any custom JavaScript in one <script> before </body>, every #anchor pointing at a real id, closing </html>.",
    ].join("\n"),
  }
}
