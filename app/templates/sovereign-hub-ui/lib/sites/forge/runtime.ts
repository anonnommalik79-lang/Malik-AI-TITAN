/**
 * Malik Site Forge — the code that makes every generated site work.
 *
 * Plain JavaScript, no libraries, no network: pages switch without reloads
 * (and keep back/forward and deep links), the phone menu opens and closes,
 * the basket keeps its contents between visits, an order or a booking is
 * validated and sent as a ready message to WhatsApp, Telegram or e-mail,
 * a booking can be added to the calendar, the gallery opens full screen,
 * opening hours say whether the place is open right now, and a photograph
 * that fails to load becomes a quiet tile instead of a broken image.
 * Storage falls back to memory where the browser forbids it (sandboxed
 * previews), so nothing throws.
 */
/** Runs in <head>, before any image loads, so a failing photograph never shows a broken icon. */
export function imageGuardScript(artSvg: string) {
  return String.raw`window.__malikImgFail=function(i){var a=(i.getAttribute("data-alt")||"").split("|").filter(Boolean);if(a.length){i.setAttribute("data-alt",a.slice(1).join("|"));i.src=a[0];return}var d=document.createElement("div");d.className="art";d.setAttribute("role","img");d.setAttribute("aria-label",i.alt||"");d.innerHTML=` + JSON.stringify(artSvg) + String.raw`;i.replaceWith(d)};document.addEventListener("error",function(e){var i=e.target;if(i&&i.tagName==="IMG")window.__malikImgFail(i)},true);`
}

export const SITE_RUNTIME = String.raw`(function () {
  "use strict";
  var DATA = JSON.parse(document.getElementById("malik-data").textContent);
  var CFG = window.SITE_CONFIG || {};
  var T = DATA.ui;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function digits(s) { return String(s || "").replace(/\D/g, ""); }
  var store = (function () {
    try { var k = "__malik"; window.localStorage.setItem(k, "1"); window.localStorage.removeItem(k); return window.localStorage; }
    catch (e) { var m = {}; return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } }; }
  })();
  function money(v) {
    var n = Number(v) || 0;
    var text;
    try { text = new Intl.NumberFormat(DATA.numberLocale, { maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); } catch (e) { text = String(n); }
    return DATA.currencyBefore ? DATA.currency + text : text + " " + DATA.currency;
  }

  /* toasts */
  var toasts = $(".toasts");
  function toast(message) {
    if (!toasts) return;
    var node = document.createElement("div");
    node.className = "toast"; node.setAttribute("role", "status"); node.textContent = message;
    toasts.appendChild(node);
    setTimeout(function () { node.remove(); }, 3200);
  }
  window.alert = function (message) { toast(String(message)); };

  /* contacts live in SITE_CONFIG: one place to edit */
  function waLink(text) { var n = digits(CFG.whatsapp || CFG.phone); return n ? "https://wa.me/" + n + (text ? "?text=" + encodeURIComponent(text) : "") : ""; }
  function applyConfig() {
    $$("[data-bind]").forEach(function (el) { var v = CFG[el.getAttribute("data-bind")]; if (v) el.textContent = v; });
    $$("[data-href]").forEach(function (el) {
      var kind = el.getAttribute("data-href"), href = "";
      if (kind === "tel" && CFG.phone) href = "tel:+" + digits(CFG.phone);
      if (kind === "mail" && CFG.email) href = "mailto:" + CFG.email;
      if (kind === "wa") href = waLink("");
      if (kind === "tg" && CFG.telegram) href = "https://t.me/" + CFG.telegram;
      if (kind === "ig" && CFG.instagram) href = "https://instagram.com/" + CFG.instagram;
      if (href) el.setAttribute("href", href); else if (kind === "tg" || kind === "ig") el.hidden = true;
    });
  }
  applyConfig();

  /* pages */
  var pages = $$("[data-page]");
  var names = pages.map(function (p) { return p.getAttribute("data-page"); });
  var body = document.body;
  function pageFromHash() {
    var h = String(location.hash || "");
    if (h.indexOf("#/") !== 0) return names[0];
    var name = h.slice(2).split("?")[0] || names[0];
    return names.indexOf(name) >= 0 ? name : "404";
  }
  function show(name, focus) {
    var found = false;
    pages.forEach(function (p) {
      var on = p.getAttribute("data-page") === name;
      p.classList.toggle("is-active", on);
      p.hidden = !on;
      if (on) found = true;
    });
    if (!found) return show("404", focus);
    $$("[data-nav]").forEach(function (a) { if (a.getAttribute("data-nav") === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    var page = $('[data-page="' + name + '"]');
    document.title = (page && page.getAttribute("data-title")) || DATA.title;
    body.setAttribute("data-current", name);
    closeMenu();
    try { window.scrollTo({ top: 0, behavior: "auto" }); } catch (e) { window.scrollTo(0, 0); }
    if (focus && page) { var h = page.querySelector("h1, h2"); if (h) { h.setAttribute("tabindex", "-1"); try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } } }
  }
  function go(name) {
    show(name, true);
    var target = "#/" + (name === names[0] ? "" : name);
    try { history.pushState({ page: name }, "", target); } catch (e) { try { location.hash = target; } catch (e2) { /* preview */ } }
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#/"]');
    if (!a) return;
    e.preventDefault();
    var name = a.getAttribute("href").slice(2).split("?")[0] || names[0];
    var service = a.getAttribute("data-service");
    go(names.indexOf(name) >= 0 ? name : "404");
    if (service) { var s = $("[data-booking] [name=service]"); if (s) { s.value = service; s.dispatchEvent(new Event("change")); } }
  });
  window.addEventListener("popstate", function () { show(pageFromHash(), false); });
  window.addEventListener("hashchange", function () { var h = String(location.hash || ""); if (!h || h.indexOf("#/") === 0) show(pageFromHash(), false); });
  show(pageFromHash(), false);

  /* header and phone menu */
  var header = $(".hdr"), menu = $("#mnav"), burger = $("[data-menu-toggle]");
  function onScroll() { if (header) header.classList.toggle("is-scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  function closeMenu() { body.classList.remove("menu-open"); if (menu) menu.hidden = true; if (burger) { burger.setAttribute("aria-expanded", "false"); burger.setAttribute("aria-label", T.openMenu); } }
  function openMenu() { body.classList.add("menu-open"); if (menu) menu.hidden = false; if (burger) { burger.setAttribute("aria-expanded", "true"); burger.setAttribute("aria-label", T.closeMenu); } }
  if (burger) burger.addEventListener("click", function () { if (body.classList.contains("menu-open")) closeMenu(); else openMenu(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeMenu(); closeDrawer(); closeLightbox(); } });

  /* catalogue: filter, search, sort */
  var catalog = $("[data-catalog-page]");
  if (catalog) {
    var state = { cat: "all", q: "", sort: "default" };
    var list = $("[data-items]", catalog);
    var items = $$("[data-item]", list);
    var titles = $$(".cat-title", list);
    var empty = $("[data-empty]", catalog);
    function apply() {
      var q = state.q.trim().toLowerCase(), visible = 0;
      items.forEach(function (it) {
        var ok = (state.cat === "all" || it.getAttribute("data-cat") === state.cat) && (!q || (it.getAttribute("data-search") || "").indexOf(q) >= 0);
        it.hidden = !ok; if (ok) visible++;
      });
      var sorted = items.slice();
      if (state.sort === "asc") sorted.sort(function (a, b) { return a.getAttribute("data-price") - b.getAttribute("data-price"); });
      if (state.sort === "desc") sorted.sort(function (a, b) { return b.getAttribute("data-price") - a.getAttribute("data-price"); });
      if (state.sort === "default") { sorted = []; $$("[data-item], .cat-title", list).sort(function (a, b) { return a.getAttribute("data-order") - b.getAttribute("data-order"); }).forEach(function (n) { list.appendChild(n); }); }
      else sorted.forEach(function (n) { list.appendChild(n); });
      titles.forEach(function (t) {
        var cat = t.getAttribute("data-cat");
        t.hidden = state.sort !== "default" || !items.some(function (it) { return !it.hidden && it.getAttribute("data-cat") === cat; });
      });
      if (empty) empty.hidden = visible > 0;
    }
    $$("[data-filter]", catalog).forEach(function (chip) {
      chip.addEventListener("click", function () {
        state.cat = chip.getAttribute("data-filter");
        $$("[data-filter]", catalog).forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
        apply();
      });
    });
    var search = $("[data-search-input]", catalog);
    if (search) search.addEventListener("input", function () { state.q = search.value; apply(); });
    var sort = $("[data-sort]", catalog);
    if (sort) sort.addEventListener("change", function () { state.sort = sort.value; apply(); });
    var reset = $("[data-reset]", catalog);
    if (reset) reset.addEventListener("click", function () { state = { cat: "all", q: "", sort: "default" }; if (search) search.value = ""; if (sort) sort.value = "default"; $$("[data-filter]", catalog).forEach(function (c) { c.setAttribute("aria-pressed", String(c.getAttribute("data-filter") === "all")); }); apply(); });
  }

  /* basket */
  var byId = {};
  (DATA.items || []).forEach(function (it) { byId[it.id] = it; });
  var cartKey = "malik-cart:" + DATA.slug;
  var cart = {};
  try { cart = JSON.parse(store.getItem(cartKey) || "{}") || {}; } catch (e) { cart = {}; }
  Object.keys(cart).forEach(function (id) { if (!byId[id] || !(cart[id] > 0)) delete cart[id]; });
  var mode = DATA.delivery ? "delivery" : "pickup";
  function save() { try { store.setItem(cartKey, JSON.stringify(cart)); } catch (e) { /* memory only */ } }
  function count() { return Object.keys(cart).reduce(function (s, id) { return s + cart[id]; }, 0); }
  function total() { return Object.keys(cart).reduce(function (s, id) { return s + cart[id] * byId[id].price; }, 0); }
  var drawer = $("[data-cart]");
  function renderCount() {
    var n = count();
    $$("[data-cart-count]").forEach(function (el) { el.textContent = String(n); if (n) el.removeAttribute("data-zero"); else el.setAttribute("data-zero", ""); });
  }
  function renderCart() {
    renderCount();
    if (!drawer) return;
    var lines = $("[data-lines]", drawer), foot = $("[data-cart-foot]", drawer), emptyBox = $("[data-cart-empty]", drawer);
    var ids = Object.keys(cart);
    emptyBox.hidden = ids.length > 0; foot.hidden = ids.length === 0;
    lines.innerHTML = ids.map(function (id) {
      var it = byId[id];
      var ph = it.photo ? '<img src="' + esc(it.photo) + '" alt="" loading="lazy">' : '<div class="art"></div>';
      return '<div class="line">' + ph + '<div><div class="line__name">' + esc(it.name) + '</div><div class="line__price">' + money(it.price) + ' · ' + money(it.price * cart[id]) + '</div><button type="button" class="line__remove" data-remove="' + esc(id) + '">' + esc(T.remove) + '</button></div>' +
        '<div class="qty" role="group" aria-label="' + esc(T.quantity) + '"><button type="button" data-dec="' + esc(id) + '" aria-label="' + esc(T.less) + '">−</button><output>' + cart[id] + '</output><button type="button" data-inc="' + esc(id) + '" aria-label="' + esc(T.more) + '">+</button></div></div>';
    }).join("");
    $$("[data-total]", drawer).forEach(function (el) { el.textContent = money(total()); });
  }
  function add(id, n) {
    if (!byId[id]) return;
    cart[id] = (cart[id] || 0) + n;
    if (cart[id] <= 0) delete cart[id];
    save(); renderCart();
  }
  function openDrawer() { if (!drawer) return; renderCart(); stage("cart"); drawer.hidden = false; requestAnimationFrame(function () { drawer.classList.add("is-open"); }); var x = $("[data-cart-close]", drawer); if (x) x.focus(); }
  function closeDrawer() { if (!drawer || drawer.hidden) return; drawer.classList.remove("is-open"); setTimeout(function () { drawer.hidden = true; }, 200); }
  function stage(name) { if (!drawer) return; $$("[data-stage]", drawer).forEach(function (s) { s.hidden = s.getAttribute("data-stage") !== name; }); }
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-add],[data-inc],[data-dec],[data-remove],[data-cart-open],[data-cart-close],[data-checkout],[data-back-cart],[data-new-order],[data-mode]") : null;
    if (!t) { if (drawer && e.target === drawer) closeDrawer(); return; }
    if (t.hasAttribute("data-add")) { var id = t.getAttribute("data-add"); add(id, 1); toast(byId[id].name + " — " + T.added); }
    else if (t.hasAttribute("data-inc")) add(t.getAttribute("data-inc"), 1);
    else if (t.hasAttribute("data-dec")) add(t.getAttribute("data-dec"), -1);
    else if (t.hasAttribute("data-remove")) { delete cart[t.getAttribute("data-remove")]; save(); renderCart(); }
    else if (t.hasAttribute("data-cart-open")) openDrawer();
    else if (t.hasAttribute("data-cart-close")) closeDrawer();
    else if (t.hasAttribute("data-checkout")) { if (count()) stage("checkout"); }
    else if (t.hasAttribute("data-back-cart")) stage("cart");
    else if (t.hasAttribute("data-new-order")) { cart = {}; save(); renderCart(); stage("cart"); closeDrawer(); }
    else if (t.hasAttribute("data-mode")) {
      mode = t.getAttribute("data-mode");
      $$("[data-mode]", drawer).forEach(function (b) { b.setAttribute("aria-pressed", String(b === t)); });
      var addr = $("[data-address-field]", drawer); if (addr) addr.hidden = mode !== "delivery";
    }
  });
  renderCart();

  /* forms: validation shared by checkout and booking */
  function field(form, name) { return form.querySelector('[name="' + name + '"]'); }
  function mark(input, message) {
    var wrap = input.closest(".field"); if (!wrap) return;
    var err = wrap.querySelector(".field__error");
    if (message) { wrap.setAttribute("data-invalid", ""); if (err) err.textContent = message; input.setAttribute("aria-invalid", "true"); }
    else { wrap.removeAttribute("data-invalid"); if (err) err.textContent = ""; input.removeAttribute("aria-invalid"); }
  }
  function check(form, rules) {
    var first = null;
    rules.forEach(function (r) {
      var input = field(form, r[0]); if (!input || input.closest("[hidden]")) return;
      var bad = r[1](String(input.value || "").trim());
      mark(input, bad ? r[2] : "");
      if (bad && !first) first = input;
    });
    if (first) first.focus();
    return !first;
  }
  var notName = function (v) { return v.length < 2; };
  var notPhone = function (v) { return digits(v).length < 10; };
  function stamp() { var d = new Date(); function p(n) { return (n < 10 ? "0" : "") + n; } return p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()); }
  function sendButtons(box, text, subject) {
    var wa = $("[data-send=wa]", box), tg = $("[data-send=tg]", box), mail = $("[data-send=mail]", box), copy = $("[data-send=copy]", box);
    if (wa) { var link = waLink(text); if (link) wa.href = link; else wa.hidden = true; }
    if (tg) { if (CFG.telegram) { tg.href = "https://t.me/" + CFG.telegram; tg.onclick = function () { copyText(text, T.copiedForTelegram); }; } else tg.hidden = true; }
    if (mail) { if (CFG.email) mail.href = "mailto:" + CFG.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(text); else mail.hidden = true; }
    if (copy) copy.onclick = function () { copyText(text, T.copied); };
  }
  function copyText(text, message) {
    function fallback() { var a = document.createElement("textarea"); a.value = text; a.style.position = "fixed"; a.style.opacity = "0"; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); toast(message); } catch (e) { toast(T.copyFailed); } a.remove(); }
    try { navigator.clipboard.writeText(text).then(function () { toast(message); }, fallback); } catch (e) { fallback(); }
  }

  /* checkout */
  var checkout = $("[data-checkout-form]");
  if (checkout) checkout.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!count()) { stage("cart"); return; }
    var ok = check(checkout, [["name", notName, T.errName], ["phone", notPhone, T.errPhone], ["address", function (v) { return mode === "delivery" && v.length < 5; }, T.errAddress]]);
    if (!ok) return;
    var number = stamp();
    var lines = Object.keys(cart).map(function (id) { return "• " + byId[id].name + " × " + cart[id] + " = " + money(byId[id].price * cart[id]); });
    var text = [T.orderTitle + " №" + number + " — " + DATA.brand, ""].concat(lines).concat(["", T.total + ": " + money(total()),
      T.howGet + ": " + (mode === "delivery" ? T.delivery + ", " + field(checkout, "address").value.trim() : T.pickup),
      field(checkout, "when").value ? T.when + ": " + field(checkout, "when").value : "",
      T.name + ": " + field(checkout, "name").value.trim(), T.phone + ": " + field(checkout, "phone").value.trim(),
      field(checkout, "comment").value.trim() ? T.comment + ": " + field(checkout, "comment").value.trim() : ""]).filter(function (l, i) { return l !== "" || i === 1; }).join("\n");
    var done = $("[data-stage=done]", drawer);
    $("[data-order-number]", done).textContent = "№" + number;
    $("[data-order-text]", done).textContent = text;
    sendButtons(done, text, T.orderTitle + " №" + number);
    stage("done");
  });

  /* booking */
  var booking = $("[data-booking]");
  function hoursFor(date) {
    var dow = date.getDay();
    for (var i = 0; i < DATA.hours.length; i++) if (DATA.hours[i].days.indexOf(dow) >= 0) return DATA.hours[i];
    return null;
  }
  function minutes(hhmm) { var p = String(hhmm).split(":"); return Number(p[0]) * 60 + Number(p[1]); }
  function hhmm(m) { var h = Math.floor(m / 60), mm = m % 60; return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm; }
  function iso(d) { return d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" + (d.getDate() < 10 ? "0" : "") + d.getDate(); }
  function parseDate(v) { var p = String(v).split("-"); return p.length === 3 ? new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])) : null; }
  if (booking) {
    var today = new Date(), dateInput = field(booking, "date"), timeSelect = field(booking, "time");
    var outInput = field(booking, "checkout");
    if (dateInput) { dateInput.min = iso(today); if (!dateInput.value) dateInput.value = iso(today); }
    if (outInput) { var tomorrow = new Date(today.getTime() + 864e5); outInput.min = iso(tomorrow); if (!outInput.value) outInput.value = iso(tomorrow); }
    function fillSlots() {
      if (!timeSelect || !dateInput) return;
      var d = parseDate(dateInput.value), h = d && hoursFor(d);
      var options = [];
      if (h) {
        var start = minutes(h.open), end = minutes(h.close === "00:00" ? "24:00" : h.close), step = DATA.slotStep, length = DATA.slotLength;
        var now = new Date(), isToday = d && iso(d) === iso(now), soonest = now.getHours() * 60 + now.getMinutes() + 30;
        for (var m = start; m + length <= end; m += step) if (!isToday || m >= soonest) options.push(hhmm(m));
      }
      timeSelect.innerHTML = options.length ? options.map(function (o) { return '<option value="' + o + '">' + o + "</option>"; }).join("") : '<option value="">' + esc(h ? T.noSlotsToday : T.closedThatDay) + "</option>";
      timeSelect.disabled = !options.length;
    }
    if (dateInput) dateInput.addEventListener("change", fillSlots);
    fillSlots();
    $$("[data-step]", booking).forEach(function (b) {
      b.addEventListener("click", function () {
        var out = $("output", b.parentNode), input = field(booking, "guests"), v = Math.max(1, Math.min(DATA.maxGuests, Number(input.value || 1) + Number(b.getAttribute("data-step"))));
        input.value = String(v); out.textContent = String(v);
      });
    });
    booking.addEventListener("submit", function (e) {
      e.preventDefault();
      var ok = check(booking, [["name", notName, T.errName], ["phone", notPhone, T.errPhone], ["date", function (v) { var d = parseDate(v); return !d || iso(d) < iso(new Date()); }, T.errDate],
        ["time", function (v) { return Boolean(timeSelect) && !v; }, T.errTime], ["checkout", function (v) { return Boolean(outInput) && (!v || v <= dateInput.value); }, T.errCheckout]]);
      if (!ok) return;
      var service = field(booking, "service"), guests = field(booking, "guests"), comment = field(booking, "comment");
      var lines = [T.bookingTitle + " — " + DATA.brand, ""];
      if (service && service.value) lines.push(T.service + ": " + service.value);
      lines.push((outInput ? T.checkin : T.date) + ": " + dateInput.value + (timeSelect ? " " + timeSelect.value : ""));
      if (outInput) lines.push(T.checkoutLabel + ": " + outInput.value);
      if (guests) lines.push(T.guests + ": " + guests.value);
      lines.push(T.name + ": " + field(booking, "name").value.trim(), T.phone + ": " + field(booking, "phone").value.trim());
      if (comment && comment.value.trim()) lines.push(T.comment + ": " + comment.value.trim());
      var text = lines.join("\n");
      var done = $("[data-booking-done]");
      $("[data-booking-text]", done).textContent = text;
      sendButtons(done, text, T.bookingTitle + " — " + DATA.brand);
      var ics = $("[data-ics]", done);
      if (ics) ics.onclick = function () {
        var start = dateInput.value.replace(/-/g, "") + "T" + (timeSelect ? timeSelect.value.replace(":", "") + "00" : "140000");
        var end = outInput ? outInput.value.replace(/-/g, "") + "T120000" : null;
        var cal = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Malik AI//Site//EN", "BEGIN:VEVENT", "UID:" + Date.now() + "@" + DATA.slug, "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
          "DTSTART:" + start, end ? "DTEND:" + end : "DURATION:PT1H", "SUMMARY:" + (DATA.brand + " — " + (service && service.value ? service.value : T.bookingTitle)).replace(/[,;]/g, " "),
          "LOCATION:" + String(CFG.address || "").replace(/[,;]/g, " "), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
        try {
          var url = URL.createObjectURL(new Blob([cal], { type: "text/calendar" }));
          var a = document.createElement("a"); a.href = url; a.download = DATA.slug + ".ics"; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        } catch (err) { toast(T.downloadBlocked); }
      };
      booking.hidden = true; done.hidden = false;
      var h = $("h2, h3", done); if (h) { h.setAttribute("tabindex", "-1"); h.focus(); }
    });
    var again = $("[data-booking-again]");
    if (again) again.addEventListener("click", function () { booking.reset(); fillSlots(); booking.hidden = false; $("[data-booking-done]").hidden = true; var g = $("[data-guests-out]"); if (g) g.textContent = field(booking, "guests") ? field(booking, "guests").value : ""; });
  }
  var quick = $("[data-quickbook]");
  if (quick && booking) quick.addEventListener("submit", function (e) {
    e.preventDefault();
    ["date", "checkout", "guests"].forEach(function (n) { var from = field(quick, n), to = field(booking, n); if (from && to) to.value = from.value; });
    var g = $("[data-guests-out]"); if (g && field(booking, "guests")) g.textContent = field(booking, "guests").value;
    if (field(booking, "date")) field(booking, "date").dispatchEvent(new Event("change"));
    go("booking");
  });

  /* opening hours */
  function openState() {
    var now = new Date(), h = hoursFor(now), m = now.getHours() * 60 + now.getMinutes();
    if (h) { var close = minutes(h.close === "00:00" ? "24:00" : h.close); if (m >= minutes(h.open) && m < close) return { open: true, text: close >= 1440 ? T.openAllDay : T.openUntil + " " + h.close }; }
    for (var i = 0; i < 8; i++) {
      var d = new Date(now.getTime() + i * 864e5), hh = hoursFor(d);
      if (hh && (i > 0 || m < minutes(hh.open))) return { open: false, text: T.closedNow + " · " + T.opensAt + " " + (i === 0 ? "" : i === 1 ? T.tomorrow + " " : DATA.dayNames[d.getDay()] + " ") + hh.open };
    }
    return { open: false, text: T.closedNow };
  }
  var st = openState();
  $$("[data-open-status]").forEach(function (el) { el.textContent = st.text; el.setAttribute("data-open", String(st.open)); });
  $$("[data-day-row]").forEach(function (row) { if (row.getAttribute("data-day-row").split(",").indexOf(String(new Date().getDay())) >= 0) row.classList.add("is-today"); });

  /* copy buttons */
  $$("[data-copy]").forEach(function (b) { b.addEventListener("click", function () { copyText(CFG[b.getAttribute("data-copy")] || b.getAttribute("data-copy-text") || "", T.copied); }); });

  /* gallery lightbox */
  var lb = $("[data-lightbox-root]"), shots = $$("[data-lb]"), at = 0;
  function showShot(i) {
    if (!shots.length) return;
    at = (i + shots.length) % shots.length;
    var img = $("img", shots[at]);
    var big = $("img", lb), cap = $("figcaption", lb);
    if (img) { big.src = img.currentSrc || img.src; big.alt = img.alt; big.hidden = false; } else big.hidden = true;
    cap.textContent = shots[at].getAttribute("data-caption") || (img ? img.alt : "");
  }
  function closeLightbox() { if (lb && !lb.hidden) { lb.hidden = true; if (shots[at]) shots[at].focus(); } }
  shots.forEach(function (s, i) {
    s.setAttribute("tabindex", "0"); s.setAttribute("role", "button");
    s.addEventListener("click", function () { lb.hidden = false; showShot(i); $(".x", lb).focus(); });
    s.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); s.click(); } });
  });
  if (lb) {
    $(".x", lb).addEventListener("click", closeLightbox);
    $(".lb-prev", lb).addEventListener("click", function () { showShot(at - 1); });
    $(".lb-next", lb).addEventListener("click", function () { showShot(at + 1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) closeLightbox(); });
    document.addEventListener("keydown", function (e) { if (lb.hidden) return; if (e.key === "ArrowRight") showShot(at + 1); if (e.key === "ArrowLeft") showShot(at - 1); });
    var x0 = null;
    lb.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) showShot(at + (dx < 0 ? 1 : -1)); x0 = null; });
  }

  /* photographs that failed before this script ran (the head script handles later ones) */
  $$("img").forEach(function (img) { if (img.complete && img.naturalWidth === 0 && img.getAttribute("src") && window.__malikImgFail) window.__malikImgFail(img); });

  $$("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
  document.documentElement.setAttribute("data-ready", "true");
})();`
