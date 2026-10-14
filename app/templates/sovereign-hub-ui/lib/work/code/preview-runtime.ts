/**
 * The script that runs a compiled project inside the sandboxed preview frame.
 *
 * It provides CommonJS `require` over the modules the server compiled, the
 * browser stand-ins for the Next.js modules a page imports (link, image,
 * navigation, fonts, dynamic), renders the App Router layout chain around the
 * chosen page, routes internal links inside the frame, and reports every
 * failure (compile, import, render, runtime) to the parent with the file it
 * came from. «ready» is sent only after React has committed the first render.
 *
 * Kept as plain JavaScript in a string: it is inlined into the frame, never
 * bundled into Malik AI itself.
 */
export const PREVIEW_RUNTIME = String.raw`
(function () {
  var cfg = window.__MALIK_PREVIEW__;
  var token = cfg.token;
  var sent = 0;
  function post(kind, message, file) {
    if (sent > 40) return; sent++;
    try { parent.postMessage({ type: kind === "error" ? "malik-preview-error" : "malik-work-preview", kind: kind, token: token, message: String(message || "").slice(0, 600), file: file || null, route: state.route }, "*"); } catch (e) {}
  }
  var state = { route: cfg.route || "/", current: [] };
  window.addEventListener("error", function (event) {
    if (event && event.target && event.target !== window && (event.target.src || event.target.href)) { post("error", "Не загрузился ресурс: " + (event.target.src || event.target.href)); return; }
    post("error", (event.message || "Error") + (event.lineno ? " (строка " + event.lineno + ")" : ""), state.current[state.current.length - 1]);
  }, true);
  window.addEventListener("unhandledrejection", function (event) { var reason = event && event.reason; post("error", "Unhandled promise rejection: " + (reason && reason.message || reason)); });
  document.addEventListener("securitypolicyviolation", function (event) {
    if (event.violatedDirective && event.violatedDirective.indexOf("connect-src") === 0) post("error", "Сетевой запрос заблокирован в превью: " + event.blockedURI + ". API-маршруты и внешние запросы в превью не выполняются.");
  });

  var React = window.React, ReactDOM = window.ReactDOM;
  if (!React || !ReactDOM) { post("error", "Среда превью не загрузилась (React)."); return; }
  var h = React.createElement;
  function esm(value) { var out = Object.assign({}, value); out.default = value; out.__esModule = true; return out; }

  // ── Document tags rendered by a root layout ────────────────────────────
  function applyAttributes(element, props) {
    if (!props) return;
    if (props.lang) element.setAttribute("lang", props.lang);
    if (props.dir) element.setAttribute("dir", props.dir);
    if (props.className) element.className = props.className;
    if (props.style && typeof props.style === "object") Object.keys(props.style).forEach(function (key) { try { element.style[key] = props.style[key]; } catch (e) {} });
  }
  function HtmlTag(props) { React.useLayoutEffect(function () { applyAttributes(document.documentElement, props); }, []); return h(React.Fragment, null, props.children); }
  function BodyTag(props) { React.useLayoutEffect(function () { applyAttributes(document.body, props); }, []); return h(React.Fragment, null, props.children); }
  function HeadTag(props) {
    React.Children.forEach(props.children, function (child) { if (child && child.type === "title") document.title = [].concat(child.props.children).join(""); });
    return null;
  }
  function tagFor(type) { return type === "html" ? HtmlTag : type === "body" ? BodyTag : type === "head" ? HeadTag : type; }
  function jsx(type, props, key) { var p = props || {}; if (key !== undefined) { p = Object.assign({}, p, { key: key }); } return h(tagFor(type), p); }
  var jsxRuntime = { jsx: jsx, jsxs: jsx, jsxDEV: jsx, Fragment: React.Fragment };

  // ── Next.js stand-ins ──────────────────────────────────────────────────
  var listeners = [];
  function navigate(href, replace) {
    var url;
    try { url = new URL(String(href), "https://preview.local" + state.route); } catch (e) { return; }
    if (url.origin !== "https://preview.local") { post("navigate-external", url.href); return; }
    state.route = url.pathname || "/";
    state.search = url.search;
    listeners.forEach(function (listener) { listener(); });
    post("route", state.route);
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  function useRoute() {
    var pair = React.useState(0);
    React.useEffect(function () { var update = function () { pair[1](function (n) { return n + 1; }); }; listeners.push(update); return function () { listeners = listeners.filter(function (l) { return l !== update; }); }; }, []);
    return state.route;
  }
  var Link = React.forwardRef(function Link(props, ref) {
    var href = typeof props.href === "object" && props.href ? (props.href.pathname || "/") : String(props.href || "");
    var rest = Object.assign({}, props); delete rest.href; delete rest.prefetch; delete rest.replace; delete rest.scroll; delete rest.shallow; delete rest.legacyBehavior; delete rest.passHref;
    return h("a", Object.assign(rest, { ref: ref, href: href, onClick: function (event) {
      if (props.onClick) props.onClick(event);
      if (event.defaultPrevented || /^(?:[a-z]+:)?\/\//i.test(href) || /^(?:mailto|tel):/i.test(href)) return;
      if (href.charAt(0) === "#") return;
      event.preventDefault(); navigate(href, props.replace);
    } }));
  });
  function NextImage(props) {
    var src = props.src && typeof props.src === "object" ? props.src.src : props.src;
    var rest = Object.assign({}, props); ["src", "fill", "priority", "quality", "placeholder", "blurDataURL", "loader", "unoptimized", "sizes"].forEach(function (key) { delete rest[key]; });
    if (props.fill) rest.style = Object.assign({ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }, props.style || {});
    return h("img", Object.assign(rest, { src: src, loading: props.priority ? "eager" : "lazy" }));
  }
  var navigation = {
    useRouter: function () { return { push: function (href) { navigate(href); }, replace: function (href) { navigate(href, true); }, back: function () { history.back(); }, forward: function () {}, refresh: function () { navigate(state.route); }, prefetch: function () {} }; },
    usePathname: function () { return useRoute(); },
    useSearchParams: function () { useRoute(); return new URLSearchParams(state.search || ""); },
    useParams: function () { useRoute(); return state.params || {}; },
    useSelectedLayoutSegment: function () { return null; },
    redirect: function (href) { setTimeout(function () { navigate(href, true); }, 0); throw Object.assign(new Error("NEXT_REDIRECT"), { malikRedirect: true }); },
    permanentRedirect: function (href) { navigation.redirect(href); },
    notFound: function () { throw Object.assign(new Error("NEXT_NOT_FOUND"), { malikNotFound: true }); },
  };
  var font = new Proxy({}, { get: function (target, name) { if (name === "__esModule") return true; return function () { var family = String(name).replace(/_/g, " "); return { className: "", variable: "", style: { fontFamily: family + ", system-ui, sans-serif" } }; }; } });
  function dynamic(loader, options) {
    var Lazy = React.lazy(function () { return Promise.resolve(loader()).then(function (mod) { return { default: mod && mod.default || mod }; }); });
    var fallback = options && options.loading ? h(options.loading, { isLoading: true }) : null;
    return function DynamicComponent(props) { return h(React.Suspense, { fallback: fallback }, h(Lazy, props)); };
  }
  function clsx() { var out = []; for (var i = 0; i < arguments.length; i++) { var a = arguments[i]; if (!a) continue; if (typeof a === "string" || typeof a === "number") out.push(a); else if (Array.isArray(a)) { var inner = clsx.apply(null, a); if (inner) out.push(inner); } else if (typeof a === "object") Object.keys(a).forEach(function (k) { if (a[k]) out.push(k); }); } return out.join(" "); }

  var packages = {
    "react": esm(React), "react-dom": esm(ReactDOM),
    "react-dom/client": esm({ createRoot: ReactDOM.createRoot, hydrateRoot: ReactDOM.hydrateRoot }),
    "react/jsx-runtime": jsxRuntime, "react/jsx-dev-runtime": jsxRuntime,
    "next/link": esm(Link), "next/image": esm(NextImage), "next/navigation": navigation,
    "next/router": { useRouter: function () { var route = useRoute(); return { pathname: route, asPath: route, query: {}, push: function (h) { navigate(h); return Promise.resolve(true); }, replace: function (h) { navigate(h, true); return Promise.resolve(true); }, back: function () {}, prefetch: function () { return Promise.resolve(); }, events: { on: function () {}, off: function () {} } }; } },
    "next/head": esm(HeadTag), "next/font/google": font, "next/font/local": esm(function () { return { className: "", variable: "", style: {} }; }),
    "next/dynamic": esm(dynamic), "next/script": esm(function () { return null; }),
    "clsx": esm(clsx), "classnames": esm(clsx),
  };
  if (window.LucideReact) packages["lucide-react"] = window.LucideReact;

  // ── Modules ────────────────────────────────────────────────────────────
  var modules = cfg.modules, cache = {};
  function load(path) {
    if (cache[path]) return cache[path].exports;
    var def = modules[path];
    if (!def) throw new Error("Модуль не найден: " + path);
    var module = { exports: {} };
    cache[path] = module;
    state.current.push(path);
    try {
      if (def.kind === "json") module.exports = def.value;
      else if (def.kind === "css") module.exports = def.mapping ? esm(def.mapping) : {};
      else if (def.kind === "asset") module.exports = esm({ src: def.value, width: 0, height: 0 });
      else window.__MALIK_MODULES__[path].call(module.exports, module, module.exports, function (specifier) { return requireFrom(path, specifier); });
    } catch (error) {
      delete cache[path];
      if (!error.malikReported) { error.malikReported = true; post("error", (error && error.message || String(error)), path); }
      throw error;
    } finally { state.current.pop(); }
    return module.exports;
  }
  function requireFrom(from, specifier) {
    var target = (modules[from] && modules[from].deps || {})[specifier];
    if (target && target.indexOf("pkg:") === 0) {
      var name = target.slice(4);
      if (packages[name]) return packages[name];
      var error = new Error("Пакет «" + name + "» недоступен в превью. Скачайте проект и запустите его локально.");
      error.malikReported = true; post("error", error.message, from); throw error;
    }
    if (target === "missing" || !target) { var missing = new Error("Импорт «" + specifier + "» не найден (" + from + ")."); missing.malikReported = true; post("error", missing.message, from); throw missing; }
    return load(target);
  }

  // ── Rendering ──────────────────────────────────────────────────────────
  var Boundary = (function () {
    function Boundary(props) { React.Component.call(this, props); this.state = { error: null }; }
    Boundary.prototype = Object.create(React.Component.prototype);
    Boundary.getDerivedStateFromError = function (error) { return { error: error }; };
    Boundary.prototype.componentDidCatch = function (error, info) {
      if (error && (error.malikRedirect)) return;
      if (!error || !error.malikReported) post("error", (error && error.message || String(error)) + (info && info.componentStack ? " — " + info.componentStack.split("\n").filter(Boolean)[0].trim() : ""));
    };
    Boundary.prototype.render = function () {
      var error = this.state.error;
      if (!error) return this.props.children;
      if (error.malikNotFound) return h("main", { style: { padding: 32, fontFamily: "system-ui" } }, h("h1", null, "404"), h("p", null, "Страница не найдена"));
      return h("div", { role: "alert", style: { padding: 24, fontFamily: "ui-monospace, monospace", color: "#fff", background: "#000", minHeight: "100vh" } }, h("strong", null, "Ошибка в проекте"), h("pre", { style: { whiteSpace: "pre-wrap" } }, String(error && error.message || error)));
    };
    return Boundary;
  })();
  function component(mod, path) {
    var value = mod && (mod.default || (typeof mod === "function" ? mod : null));
    if (!value) throw new Error("Нет экспорта по умолчанию в " + path);
    return value;
  }
  function Async(props) {
    var pair = React.useState(null), result = pair[0];
    React.useEffect(function () { var alive = true; Promise.resolve(props.render()).then(function (node) { if (alive) pair[1]({ node: node }); }, function (error) { if (alive) pair[1]({ error: error }); }); return function () { alive = false; }; }, [props.route]);
    if (result && result.error) throw result.error;
    return result ? result.node : null;
  }
  function renderComponent(Component, props) {
    // An async Server Component is awaited once, then its result is rendered.
    if (typeof Component === "function" && Component.constructor && Component.constructor.name === "AsyncFunction") {
      return h(Async, { route: state.route, render: function () { return Component(props); } });
    }
    return h(Component, props);
  }
  function matchRoute(pathname) {
    var routes = cfg.routes || [];
    for (var i = 0; i < routes.length; i++) {
      var r = routes[i], parts = r.pattern.split("/").filter(Boolean), actual = pathname.split("/").filter(Boolean), params = {}, ok = true;
      for (var j = 0; j < parts.length; j++) {
        var part = parts[j];
        if (/^\[\.\.\..+\]$/.test(part)) { params[part.slice(4, -1)] = actual.slice(j); j = parts.length; actual = []; break; }
        if (actual[j] === undefined) { ok = false; break; }
        if (/^\[.+\]$/.test(part)) params[part.slice(1, -1)] = decodeURIComponent(actual[j]);
        else if (part !== actual[j]) { ok = false; break; }
      }
      if (ok && actual.length <= parts.length) { state.params = params; return r; }
    }
    return null;
  }
  function App() {
    var route = useRoute();
    var match = matchRoute(route);
    if (!match) return h("main", { style: { padding: 32, fontFamily: "system-ui" } }, h("h1", null, "404"), h("p", null, "Маршрут " + route + " не найден в проекте."));
    var Page = component(load(match.page), match.page);
    var node = renderComponent(Page, { params: state.params || {}, searchParams: Object.fromEntries(new URLSearchParams(state.search || "")) });
    for (var i = match.layouts.length - 1; i >= 0; i--) {
      var Layout = component(load(match.layouts[i]), match.layouts[i]);
      node = renderComponent(Layout, { children: node, params: state.params || {} });
    }
    var titleSource = load(match.page).metadata || (match.layouts[0] && load(match.layouts[0]).metadata);
    if (titleSource && titleSource.title) document.title = typeof titleSource.title === "string" ? titleSource.title : (titleSource.title.default || "");
    return node;
  }
  function Ready(props) { React.useEffect(function () { post("ready", "rendered", null); }, []); return props.children; }

  try {
    if (cfg.mode === "next-app") {
      var mount = document.getElementById("__malik_root");
      ReactDOM.createRoot(mount).render(h(Boundary, null, h(Ready, null, h(App))));
    } else {
      load(cfg.entry);
      var check = function (n) { var root = document.getElementById("root") || document.getElementById("app") || document.body; if (root && root.childElementCount) post("ready", "rendered", null); else if (n < 40) setTimeout(function () { check(n + 1); }, 50); else post("error", "Точка входа выполнилась, но ничего не отрисовала (" + cfg.entry + ")."); };
      check(0);
    }
  } catch (error) { if (!error || !error.malikReported) post("error", (error && error.message) || String(error), cfg.entry); }
})();
`
