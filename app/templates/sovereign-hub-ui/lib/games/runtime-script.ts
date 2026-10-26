/**
 * The Malik game runtime, shipped inside every generated game. Plain ES2017
 * in one string: no build step, no imports, no network. It is written once,
 * here, and tested here — a model never has to write a game loop, a menu, a
 * pause screen or touch controls again, and never runs out of room for them.
 *
 * Two halves:
 *   createCore — the game state and the API the model's code calls. It does
 *                not touch the DOM, so the same core runs in the page and in
 *                the server's isolated smoke test.
 *   boot       — the page around it: canvas scaling, keyboard, pointer, touch
 *                joystick, HUD, menu / pause / game-over screens, WebAudio
 *                sound and music, best score, error reporting.
 *
 * Kept free of backticks and template placeholders: it lives in String.raw.
 */
export const GAME_RUNTIME_VERSION = "malik-game-runtime/1"

export const GAME_RUNTIME_JS = String.raw`(function (root) {
  "use strict";
  var doc = root.document;
  var M = root.MalikGame = root.MalikGame || {};
  M.version = "malik-game-runtime/1";
  M.define = function (game) { if (game && typeof game === "object") M.definition = game; return game; };
  M.plan = (function () {
    try {
      var node = doc && doc.getElementById ? doc.getElementById("malik-game-plan") : null;
      return node ? JSON.parse(node.textContent || "{}") : (M.plan || {});
    } catch (e) { return M.plan || {}; }
  })();

  var FONT_STACKS = {
    display: "'Russo One', 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
    pixel: "'Press Start 2P', 'Courier New', ui-monospace, monospace",
    round: "'Nunito', 'Segoe UI', system-ui, sans-serif",
    tech: "'Exo 2', 'Segoe UI', system-ui, sans-serif",
    serif: "'Playfair Display', Georgia, 'Times New Roman', serif"
  };

  var TEXT = {
    ru: { play: "Играть", resume: "Продолжить", restart: "Заново", menu: "В меню", paused: "Пауза", over: "Игра окончена", won: "Победа!", score: "очки", best: "Рекорд", level: "Уровень", again: "Сыграть ещё", controls: "Управление", error: "В игре произошла ошибка", reload: "Перезапустить", newBest: "Новый рекорд!", noGame: "Код игры не загрузился.", hint: "P — пауза · M — звук", endless: "Бесконечный режим", rotate: "Поверните телефон — так экран игры больше" },
    kk: { play: "Ойнау", resume: "Жалғастыру", restart: "Қайта бастау", menu: "Мәзірге", paused: "Үзіліс", over: "Ойын аяқталды", won: "Жеңіс!", score: "ұпай", best: "Рекорд", level: "Деңгей", again: "Тағы ойнау", controls: "Басқару", error: "Ойында қате болды", reload: "Қайта іске қосу", newBest: "Жаңа рекорд!", noGame: "Ойын коды жүктелмеді.", hint: "P — үзіліс · M — дыбыс", endless: "Шексіз режим", rotate: "Телефонды бұрыңыз — ойын экраны үлкейеді" },
    en: { play: "Play", resume: "Resume", restart: "Restart", menu: "Menu", paused: "Paused", over: "Game over", won: "You win!", score: "score", best: "Best", level: "Level", again: "Play again", controls: "Controls", error: "The game hit an error", reload: "Restart", newBest: "New best!", noGame: "The game code did not load.", hint: "P — pause · M — sound", endless: "Endless mode", rotate: "Turn your phone sideways for a bigger screen" }
  };

  /* ------------------------------------------------------------ helpers */

  function hexToRgb(hex) {
    var h = String(hex || "#000000").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) { var c = hexToRgb(hex); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function mix(a, b, t) {
    var x = hexToRgb(a), y = hexToRgb(b);
    var r = Math.round(x[0] + (y[0] - x[0]) * t), g = Math.round(x[1] + (y[1] - x[1]) * t), bl = Math.round(x[2] + (y[2] - x[2]) * t);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  function makeRng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  var tools = {
    rand: function (a, b) { if (b === undefined) { b = a === undefined ? 1 : a; a = 0; } return a + Math.random() * (b - a); },
    randi: function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    pick: function (list) { return list && list.length ? list[Math.floor(Math.random() * list.length)] : undefined; },
    chance: function (p) { return Math.random() < p; },
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    approach: function (v, target, step) { return v < target ? Math.min(target, v + step) : Math.max(target, v - step); },
    dist: function (ax, ay, bx, by) { if (typeof ax === "object") return Math.hypot(ax.x - ay.x, ax.y - ay.y); return Math.hypot(bx - ax, by - ay); },
    angle: function (ax, ay, bx, by) { if (typeof ax === "object") return Math.atan2(ay.y - ax.y, ay.x - ax.x); return Math.atan2(by - ay, bx - ax); },
    wrap: function (v, a, b) { var r = b - a; return ((((v - a) % r) + r) % r) + a; },
    overlap: function (a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; },
    circle: function (a, b) { var r = (a.r || 0) + (b.r || 0), dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy < r * r; },
    inside: function (px, py, r) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; },
    rgba: rgba,
    mix: mix
  };

  /* ---------------------------------------------------------- backdrops */

  function createBackdrop(kind, colors, W, H) {
    var rng = makeRng(String(kind).length * 7919 + W * 3 + H);
    var stars = [], i, x;
    for (i = 0; i < 150; i++) stars.push({ x: rng() * W, y: rng() * H, z: 0.2 + rng() * 0.8, p: rng() * 6.283 });
    var city = []; x = -40;
    while (x < W * 2 + 80) { var bw = 34 + rng() * 70; city.push({ x: x, w: bw, h: 50 + rng() * H * 0.34, seed: Math.floor(rng() * 1000) }); x += bw + 3; }
    var trees = [[], [], []];
    for (var layer = 0; layer < 3; layer++) { x = -60; while (x < W * 2 + 120) { var tw = 40 + rng() * 60 + layer * 18; trees[layer].push({ x: x, w: tw, h: H * (0.16 + layer * 0.07) + rng() * H * 0.12 }); x += tw * (0.55 + rng() * 0.35); } }
    var clouds = []; for (i = 0; i < 6; i++) clouds.push({ x: rng() * (W + 300) - 150, y: H * (0.08 + rng() * 0.3), s: 6 + rng() * 14, r: 26 + rng() * 34 });
    var flakes = []; for (i = 0; i < 90; i++) flakes.push({ x: rng() * W, y: rng() * H, s: 18 + rng() * 40, r: 1 + rng() * 2.4, p: rng() * 6.283 });
    var blobs = []; for (i = 0; i < 9; i++) blobs.push({ x: rng() * W, r: 50 + rng() * 120, p: rng() * 6.283, s: 0.4 + rng() * 0.8 });

    function base(g, top, bottom) { var gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    function starfield(g, t, speed, scale) {
      for (var k = 0; k < stars.length; k++) {
        var s = stars[k], y = (s.y + t * speed * s.z) % H, tw = 0.45 + 0.55 * Math.abs(Math.sin(t * 1.7 + s.p));
        g.globalAlpha = tw * s.z; g.fillStyle = k % 9 === 0 ? colors.accent : colors.fg;
        var size = s.z * 1.9 * (scale || 1); g.fillRect(s.x, y, size, size);
      }
      g.globalAlpha = 1;
    }
    function glow(g, x, y, r, color, a) { var gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(color, a)); gr.addColorStop(1, rgba(color, 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    function hills(g, t, y0, amp, freq, color, shift) {
      g.fillStyle = color; g.beginPath(); g.moveTo(0, H);
      for (var px = 0; px <= W; px += 16) g.lineTo(px, y0 + Math.sin((px + shift) * freq) * amp + Math.sin((px + shift) * freq * 2.3) * amp * 0.35);
      g.lineTo(W, H); g.closePath(); g.fill();
    }
    function vignette(g, a) { var gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0," + a + ")"); g.fillStyle = gr; g.fillRect(0, 0, W, H); }

    return function paint(g, t, cam) {
      var cx = cam ? cam.x || 0 : 0;
      switch (kind) {
        case "space":
          base(g, colors.bg, colors.bg2);
          glow(g, W * 0.72, H * 0.28, Math.max(W, H) * 0.55, colors.accent2, 0.16);
          glow(g, W * 0.2, H * 0.8, Math.max(W, H) * 0.45, colors.accent, 0.1);
          starfield(g, t, 26, 1);
          break;
        case "sky":
          base(g, colors.bg, colors.bg2);
          glow(g, W * 0.82, H * 0.18, H * 0.5, colors.accent, 0.35);
          g.fillStyle = rgba(colors.accent, 0.95); g.beginPath(); g.arc(W * 0.82, H * 0.18, Math.min(W, H) * 0.06, 0, 6.283); g.fill();
          g.fillStyle = "rgba(255,255,255,0.85)";
          for (var c = 0; c < clouds.length; c++) { var cl = clouds[c], ccx = ((cl.x + t * cl.s - cx * 0.1) % (W + 300) + W + 300) % (W + 300) - 150; g.beginPath(); g.ellipse(ccx, cl.y, cl.r * 1.6, cl.r * 0.62, 0, 0, 6.283); g.ellipse(ccx + cl.r * 0.8, cl.y - cl.r * 0.3, cl.r, cl.r * 0.6, 0, 0, 6.283); g.fill(); }
          hills(g, t, H * 0.74, H * 0.05, 0.006, mix(colors.good, colors.bg2, 0.45), cx * 0.2);
          hills(g, t, H * 0.84, H * 0.04, 0.011, mix(colors.good, "#000000", 0.15), cx * 0.4);
          break;
        case "night":
          base(g, colors.bg, colors.bg2);
          starfield(g, 0, 0, 0.8);
          glow(g, W * 0.18, H * 0.2, H * 0.3, colors.fg, 0.12);
          g.fillStyle = rgba(colors.fg, 0.9); g.beginPath(); g.arc(W * 0.18, H * 0.2, Math.min(W, H) * 0.05, 0, 6.283); g.fill();
          var shade = mix(colors.bg, "#000000", 0.45);
          for (var b = 0; b < city.length; b++) {
            var bd = city[b], bx = ((bd.x - cx * 0.25) % (W * 2 + 120) + W * 2 + 120) % (W * 2 + 120) - 60;
            if (bx > W + 10 || bx + bd.w < -10) continue;
            g.fillStyle = shade; g.fillRect(bx, H - bd.h, bd.w, bd.h);
            var wr = makeRng(bd.seed + 1); g.fillStyle = rgba(colors.accent, 0.55);
            for (var wy = H - bd.h + 10; wy < H - 8; wy += 14) for (var wx = bx + 6; wx < bx + bd.w - 6; wx += 11) if (wr() > 0.62) g.fillRect(wx, wy, 5, 7);
          }
          break;
        case "forest":
          base(g, colors.bg2, colors.bg);
          glow(g, W * 0.5, H * 0.35, W * 0.6, colors.accent, 0.08);
          for (var l = 0; l < 3; l++) {
            g.fillStyle = mix(colors.bg, "#000000", 0.15 + l * 0.22);
            var list = trees[l], par = 0.15 + l * 0.25, ground = H * (0.62 + l * 0.13), span = W * 2 + 120;
            for (var tr = 0; tr < list.length; tr++) {
              var tt = list[tr], tx = ((tt.x - cx * par) % span + span) % span - 60;
              if (tx > W + 60 || tx + tt.w < -60) continue;
              g.beginPath(); g.moveTo(tx, ground); g.lineTo(tx + tt.w / 2, ground - tt.h); g.lineTo(tx + tt.w, ground); g.closePath(); g.fill();
            }
            g.fillRect(0, ground - 2, W, H - ground + 2);
          }
          break;
        case "ocean":
          base(g, colors.bg2, colors.bg);
          glow(g, W * 0.7, H * 0.3, H * 0.45, colors.accent, 0.3);
          var sea = H * 0.55; var sg = g.createLinearGradient(0, sea, 0, H); sg.addColorStop(0, mix(colors.accent2, colors.bg, 0.3)); sg.addColorStop(1, mix(colors.accent2, "#000000", 0.55)); g.fillStyle = sg; g.fillRect(0, sea, W, H - sea);
          g.strokeStyle = rgba(colors.fg, 0.25); g.lineWidth = 2;
          for (var wv = 0; wv < 7; wv++) { var wy2 = sea + 14 + wv * (H - sea) / 7; g.beginPath(); for (var wx2 = 0; wx2 <= W; wx2 += 20) g.lineTo(wx2, wy2 + Math.sin(wx2 * 0.03 + t * (1 + wv * 0.2) + wv) * 4); g.stroke(); }
          break;
        case "desert":
          base(g, colors.bg, colors.bg2);
          glow(g, W * 0.5, H * 0.42, H * 0.6, colors.accent, 0.3);
          g.fillStyle = rgba(colors.accent, 0.9); g.beginPath(); g.arc(W * 0.5, H * 0.42, Math.min(W, H) * 0.12, 0, 6.283); g.fill();
          hills(g, t, H * 0.7, H * 0.05, 0.004, mix(colors.accent2, colors.bg2, 0.3), cx * 0.2);
          hills(g, t, H * 0.82, H * 0.035, 0.008, mix(colors.accent2, "#000000", 0.2), cx * 0.45);
          break;
        case "dungeon":
          base(g, colors.bg, colors.bg2);
          g.strokeStyle = rgba(colors.fg, 0.05); g.lineWidth = 2;
          for (var ry = 0, row = 0; ry < H; ry += 36, row++) { g.beginPath(); g.moveTo(0, ry); g.lineTo(W, ry); g.stroke(); for (var rx = (row % 2) * 36 - ((cx * 0.5) % 72); rx < W; rx += 72) { g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx, ry + 36); g.stroke(); } }
          vignette(g, 0.7);
          break;
        case "neon":
          base(g, colors.bg, colors.bg2);
          var hz = H * 0.58, sunR = Math.min(W, H) * 0.2;
          var sun = g.createLinearGradient(0, hz - sunR, 0, hz); sun.addColorStop(0, colors.accent2); sun.addColorStop(1, colors.accent);
          g.fillStyle = sun; g.beginPath(); g.arc(W / 2, hz, sunR, Math.PI, 0); g.fill();
          g.fillStyle = colors.bg2; for (var sl = 0; sl < 6; sl++) g.fillRect(W / 2 - sunR, hz - sunR * 0.45 + sl * sunR * 0.09, sunR * 2, 2 + sl * 1.3);
          g.fillStyle = mix(colors.bg, "#000000", 0.35); g.fillRect(0, hz, W, H - hz);
          g.strokeStyle = rgba(colors.accent, 0.55); g.lineWidth = 1.5;
          for (var gl = 0; gl < 14; gl++) { var f = ((gl + (t * 1.2) % 1) / 14); var gy = hz + (H - hz) * f * f; g.beginPath(); g.moveTo(0, gy); g.lineTo(W, gy); g.stroke(); }
          for (var vl = -12; vl <= 12; vl++) { g.beginPath(); g.moveTo(W / 2 + vl * 14 - cx * 0.05, hz); g.lineTo(W / 2 + vl * W * 0.12 - cx * 0.4, H); g.stroke(); }
          break;
        case "grid":
          base(g, colors.bg, colors.bg2);
          g.strokeStyle = rgba(colors.fg, 0.06); g.lineWidth = 1;
          for (var gx = -((cx * 0.5) % 40); gx < W; gx += 40) { g.beginPath(); g.moveTo(gx, 0); g.lineTo(gx, H); g.stroke(); }
          for (var gy2 = 0; gy2 < H; gy2 += 40) { g.beginPath(); g.moveTo(0, gy2); g.lineTo(W, gy2); g.stroke(); }
          vignette(g, 0.45);
          break;
        case "snow":
          base(g, colors.bg, colors.bg2);
          hills(g, t, H * 0.8, H * 0.03, 0.006, mix(colors.fg, colors.bg2, 0.2), cx * 0.3);
          g.fillStyle = rgba("#ffffff", 0.85);
          for (var fl = 0; fl < flakes.length; fl++) { var fk = flakes[fl], fy = (fk.y + t * fk.s) % H, fx = (fk.x + Math.sin(t + fk.p) * 12 + W) % W; g.beginPath(); g.arc(fx, fy, fk.r, 0, 6.283); g.fill(); }
          break;
        case "lava":
          base(g, colors.bg, mix(colors.danger, "#000000", 0.55));
          for (var bl = 0; bl < blobs.length; bl++) { var bo = blobs[bl]; glow(g, bo.x, H - 20 + Math.sin(t * bo.s + bo.p) * 18, bo.r, colors.danger, 0.4); glow(g, bo.x, H, bo.r * 0.6, colors.accent, 0.35); }
          vignette(g, 0.5);
          break;
        case "candy":
          base(g, colors.bg, colors.bg2);
          for (var cb = 0; cb < blobs.length; cb++) { var cbo = blobs[cb], cy = H - ((t * 14 * cbo.s + cbo.p * 100) % (H + 200)) + 100; glow(g, cbo.x, cy, cbo.r, cb % 2 ? colors.accent : colors.accent2, 0.22); }
          break;
        default:
          base(g, colors.bg, colors.bg2);
      }
    };
  }

  /* --------------------------------------------------------------- core */

  function createCore(options) {
    options = options || {};
    var plan = options.plan || {};
    var game = options.game || {};
    var theme = plan.theme || {};
    var pal = theme.palette || {};
    var colors = {
      bg: pal.bg || "#0b1020", bg2: pal.bg2 || "#1c2550", fg: pal.fg || "#f4f6ff", muted: pal.muted || "#98a2d4",
      accent: pal.accent || "#ffd23f", accent2: pal.accent2 || "#3bceac", danger: pal.danger || "#ee4266", good: pal.good || "#3bceac"
    };
    var W = Number(game.width) || Number(plan.width) || 960;
    var H = Number(game.height) || Number(plan.height) || 540;
    var events = options.events || {};
    var fontStack = FONT_STACKS[theme.font] || FONT_STACKS.display;
    var totalLevels = Number(game.levels !== undefined ? game.levels : plan.levels) || 0;
    var startLives = Math.max(1, Number(game.lives || plan.lives) || 3);
    var keys = {}, hit = {}, raw = {}, rawHit = {};
    var joy = { x: 0, y: 0 };
    var pointer = { x: W / 2, y: H / 2, wx: W / 2, wy: H / 2, down: false, pressed: false, released: false };
    var fx = [], texts = [];
    var shake = { t: 0, power: 0 }, flash = { t: 0, max: 1, color: "#ffffff" };
    // Game feel and finish: time control, tweens, trails, light, weather and
    // post-processing. The page supplies offscreen canvases; the server's
    // smoke test has none, so the canvas-only passes simply skip there.
    var timeScale = 1, slowT = 0, freezeT = 0, punch = { t: 0, max: 1, amount: 0 };
    var tweens = [], trails = {}, lights = [], ambient = { kind: "", density: 0, parts: [] };
    var post = { bloom: 0, vignette: 0, scanlines: 0, grain: 0, darkness: 0 };
    var themeFx = theme.fx || {};
    for (var fxKey in post) if (typeof themeFx[fxKey] === "number") post[fxKey] = Math.max(0, Math.min(1, themeFx[fxKey]));
    var combo = { n: 0, t: 0, best: 0 }, boss = null;
    var makeCanvas = options.makeCanvas || null, layers = {};
    var slowFrames = 0, lastRender = 0;
    var backdropKind = theme.backdrop || "plain";
    var paintBackdrop = createBackdrop(backdropKind, colors, W, H);
    var g = null, started = false, setupDone = false, clock = 0;
    var baseTransform = options.baseTransform || function () { return [1, 0, 0, 1, 0, 0]; };

    var api = {};
    for (var name in tools) api[name] = tools[name];
    api.W = W; api.H = H; api.width = W; api.height = H;
    api.time = 0; api.frame = 0; api.dt = 0;
    api.score = 0; api.lives = startLives; api.level = 1; api.levels = totalLevels;
    api.best = Number(options.best) || 0; api.state = "menu"; api.status = "";
    api.camera = { x: 0, y: 0, zoom: 1 };
    api.colors = colors;
    api.plan = plan;
    api.data = {};
    api.pointer = pointer;

    function emit(type, value) { var fn = events[type]; if (fn) { try { fn(value, api); } catch (e) { /* the page's own handlers never stop the game */ } } }
    function fail(error, where) {
      if (api.state === "error") return;
      api.state = "error";
      core.error = { message: String((error && error.message) || error || "error").slice(0, 400), where: where, stack: String((error && error.stack) || "").slice(0, 1600) };
      emit("error", core.error);
    }
    function call(name, arg) {
      var fn = game[name];
      if (typeof fn !== "function") return undefined;
      try {
        if (name === "draw") return fn.call(game, g, api);
        if (name === "update") return fn.call(game, arg, api);
        return fn.call(game, api, arg);
      } catch (error) { fail(error, name); return undefined; }
    }

    api.font = function (size, weight) { return (weight || 700) + " " + (size || 20) + "px " + fontStack; };
    api.key = function (n) { return !!keys[n] || (n === "left" && joy.x < -0.35) || (n === "right" && joy.x > 0.35) || (n === "up" && joy.y < -0.35) || (n === "down" && joy.y > 0.35); };
    api.pressed = function (n) { return !!hit[n]; };
    api.rawKey = function (code) { return !!raw[code]; };
    api.rawPressed = function (code) { return !!rawHit[code]; };
    api.axis = function () {
      var x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + joy.x, y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0) + joy.y;
      var len = Math.hypot(x, y); if (len > 1) { x /= len; y /= len; }
      return { x: x, y: y };
    };

    api.addScore = function (n, x, y) {
      n = Number(n) || 0;
      api.score = Math.max(0, Math.round(api.score + n));
      if (x !== undefined && y !== undefined && n) api.floatText((n > 0 ? "+" : "") + n, x, y, n > 0 ? colors.accent : colors.danger);
      emit("score", api.score);
      return api.score;
    };
    api.setScore = function (n) { api.score = Math.max(0, Math.round(Number(n) || 0)); emit("score", api.score); return api.score; };
    api.setLives = function (n) { api.lives = Math.max(0, Math.floor(Number(n) || 0)); emit("lives", api.lives); return api.lives; };
    api.addLife = function () { api.lives = Math.min(9, api.lives + 1); emit("lives", api.lives); api.sfx("power"); return api.lives; };
    api.loseLife = function () {
      if (api.state !== "playing") return api.lives;
      api.lives = Math.max(0, api.lives - 1);
      emit("lives", api.lives);
      api.sfx("hurt"); api.shake(10, 0.35); api.flash(colors.danger, 0.25);
      if (api.lives <= 0) api.gameOver();
      return api.lives;
    };
    function finish(won, message) {
      var record = api.score > api.best;
      if (record) api.best = api.score;
      emit("end", { won: won, message: message ? String(message).slice(0, 160) : "", score: api.score, best: api.best, record: record });
    }
    api.gameOver = function (message) { if (api.state !== "playing") return; api.state = "over"; api.sfx("lose"); finish(false, message); };
    api.win = function (message) { if (api.state !== "playing") return; api.state = "won"; api.sfx("win"); finish(true, message); };
    api.nextLevel = function () {
      if (api.state !== "playing") return;
      if (totalLevels && api.level >= totalLevels) { api.win(); return; }
      api.level += 1;
      fx.length = 0; texts.length = 0; tweens.length = 0; trails = {}; boss = null; timeScale = 1; slowT = 0; freezeT = 0;
      emit("level", api.level);
      api.sfx("power");
      call("start", api.level);
    };
    api.setStatus = function (text) { api.status = String(text === undefined || text === null ? "" : text).slice(0, 80); emit("status", api.status); };
    api.sfx = function (n) { emit("sfx", n); };
    api.shake = function (power, time) { shake.power = Math.max(shake.power, Number(power) || 6); shake.t = Math.max(shake.t, Number(time) || 0.25); };
    api.flash = function (color, time) { flash.color = color || "#ffffff"; flash.t = flash.max = Number(time) || 0.15; };
    api.particles = function (x, y, opt) {
      opt = opt || {};
      var count = Math.min(80, Math.max(1, opt.count || 14));
      for (var k = 0; k < count; k++) {
        var a = opt.angle !== undefined ? opt.angle + (Math.random() - 0.5) * (opt.spread || 0.8) : Math.random() * 6.283;
        var sp = (opt.speed || 160) * (0.35 + Math.random() * 0.75);
        var life = (opt.life || 0.6) * (0.6 + Math.random() * 0.6);
        fx.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: life, max: life, size: (opt.size || 3) * (0.6 + Math.random() * 0.8), color: Array.isArray(opt.color) ? opt.color[k % opt.color.length] : (opt.color || colors.accent), gravity: opt.gravity || 0, drag: opt.drag === undefined ? 0.92 : opt.drag, square: !!opt.square });
      }
      if (fx.length > 700) fx.splice(0, fx.length - 700);
    };
    api.burst = api.particles;
    api.floatText = function (text, x, y, color, size) { texts.push({ text: String(text).slice(0, 24), x: x, y: y, life: 0.9, max: 0.9, color: color || colors.fg, size: size || 18 }); if (texts.length > 40) texts.shift(); };
    api.backdrop = function (kind) { backdropKind = kind; paintBackdrop = createBackdrop(kind, colors, W, H); };
    api.project = function (x, y, z, cam) {
      cam = cam || {};
      var fov = cam.fov || 320, dz = z - (cam.z || 0);
      if (dz <= 1) return null;
      var s = fov / dz;
      return { x: W / 2 + (x - (cam.x || 0)) * s, y: (cam.horizon !== undefined ? cam.horizon : H / 2) + (y - (cam.y || 0)) * s, scale: s };
    };
    api.screen = function (fn) { if (!g) return; g.save(); var m = baseTransform(); g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); try { fn(g); } finally { g.restore(); } };

    /* ------------------------------------------------- feel and finish */

    var EASE = {
      linear: function (t) { return t; },
      inQuad: function (t) { return t * t; },
      outQuad: function (t) { return t * (2 - t); },
      inOutQuad: function (t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
      outCubic: function (t) { var u = t - 1; return u * u * u + 1; },
      outBack: function (t) { var c = 1.70158, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; },
      outElastic: function (t) { return t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * 2.0944) + 1; },
      outBounce: function (t) {
        if (t < 1 / 2.75) return 7.5625 * t * t;
        if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
        if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
        t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375;
      }
    };
    function unit(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
    api.ease = EASE;
    api.fx = post;
    api.hitstop = function (seconds) { freezeT = Math.max(freezeT, Math.min(0.25, Number(seconds) || 0.06)); };
    api.slowmo = function (factor, seconds) { timeScale = Math.max(0.05, Math.min(1, Number(factor) || 0.4)); slowT = Math.max(slowT, Math.min(3, Number(seconds) || 0.6)); };
    api.punch = function (amount, seconds) { punch.amount = Math.max(-0.3, Math.min(0.3, Number(amount) || 0.06)); punch.t = punch.max = Number(seconds) || 0.18; };
    api.tween = function (target, props, duration, opt) {
      if (!target || !props) return;
      opt = opt || {};
      if (tweens.length > 200) tweens.shift();
      tweens.push({ target: target, to: props, from: null, t: 0, d: Math.max(0.01, Number(duration) || 0.3), delay: Number(opt.delay) || 0, ease: EASE[opt.ease] || (typeof opt.ease === "function" ? opt.ease : EASE.outCubic), done: opt.onDone || null });
    };
    api.trail = function (key, x, y, opt) {
      opt = opt || {};
      var tr = trails[key] || (trails[key] = { pts: [], color: colors.accent, width: 6, life: 0.35 });
      if (opt.color) tr.color = opt.color;
      if (opt.width) tr.width = opt.width;
      if (opt.life) tr.life = opt.life;
      tr.pts.push({ x: x, y: y, age: 0 });
      if (tr.pts.length > 48) tr.pts.shift();
    };
    api.light = function (x, y, radius, color, intensity) { if (lights.length < 64) lights.push({ x: x, y: y, r: Number(radius) || 120, color: color || null, i: intensity === undefined ? 1 : unit(intensity) }); };
    api.ambient = function (kind, density) { ambient.kind = String(kind || ""); ambient.density = density === undefined ? 1 : Math.max(0, Math.min(2, Number(density) || 0)); ambient.parts = []; };
    api.boss = function (name, fraction) { boss = name === null || name === false ? null : { name: String(name || "").slice(0, 40), hp: unit(fraction) }; };
    api.combo = function (add) {
      combo.n += add === undefined ? 1 : Number(add) || 0;
      combo.t = 2.6;
      if (combo.n > combo.best) combo.best = combo.n;
      return 1 + Math.floor(combo.n / 5);
    };
    api.comboReset = function () { combo.n = 0; combo.t = 0; };
    api.anim = function (frames, fps, offset) { if (!frames || !frames.length) return undefined; return frames[Math.floor((api.time + (Number(offset) || 0)) * (Number(fps) || 8)) % frames.length]; };
    api.follow = function (target, opt) {
      if (!target) return;
      opt = opt || {};
      var cam = api.camera, k = opt.lerp === undefined ? 0.12 : unit(opt.lerp), f = 1 - Math.pow(1 - k, (api.dt || 1 / 60) * 60);
      var tx = target.x - W / 2 + (opt.offsetX || 0) + (opt.lead ? (target.vx || 0) * opt.lead : 0);
      var ty = target.y - H / 2 + (opt.offsetY || 0) + (opt.lead ? (target.vy || 0) * opt.lead : 0);
      cam.x = (cam.x || 0) + (tx - (cam.x || 0)) * f;
      cam.y = (cam.y || 0) + (ty - (cam.y || 0)) * f;
      var b = opt.bounds;
      if (b) { cam.x = Math.max(b.x, Math.min(b.x + b.w - W, cam.x)); cam.y = Math.max(b.y, Math.min(b.y + b.h - H, cam.y)); }
    };

    function stepTweens(dt) {
      for (var k = tweens.length - 1; k >= 0; k--) {
        var tw = tweens[k];
        if (tw.delay > 0) { tw.delay -= dt; continue; }
        if (!tw.from) { tw.from = {}; for (var p in tw.to) tw.from[p] = Number(tw.target[p]) || 0; }
        tw.t += dt;
        var e = tw.ease(Math.min(1, tw.t / tw.d));
        for (var q in tw.to) tw.target[q] = tw.from[q] + (Number(tw.to[q]) - tw.from[q]) * e;
        if (tw.t >= tw.d) { tweens.splice(k, 1); if (tw.done) { try { tw.done(); } catch (err) { fail(err, "tween"); } } }
      }
    }
    function stepTrails(dt) {
      for (var key in trails) {
        var tr = trails[key];
        for (var k = tr.pts.length - 1; k >= 0; k--) { tr.pts[k].age += dt; if (tr.pts[k].age > tr.life) tr.pts.splice(k, 1); }
        if (!tr.pts.length) delete trails[key];
      }
    }
    function drawTrails() {
      for (var key in trails) {
        var tr = trails[key], pts = tr.pts;
        g.lineCap = "round";
        for (var k = 1; k < pts.length; k++) {
          var fade = 1 - pts[k].age / tr.life;
          g.globalAlpha = Math.max(0, fade) * 0.85;
          g.strokeStyle = tr.color;
          g.lineWidth = Math.max(0.5, tr.width * fade);
          g.beginPath(); g.moveTo(pts[k - 1].x, pts[k - 1].y); g.lineTo(pts[k].x, pts[k].y); g.stroke();
        }
      }
      g.globalAlpha = 1;
    }
    var AMBIENT = { snow: 90, rain: 150, embers: 60, dust: 45, stars: 80, bubbles: 40, leaves: 30 };
    function spawnAmbient(top) {
      var kind = ambient.kind;
      var p = { x: Math.random() * W, y: top ? -10 : Math.random() * H, s: Math.random(), a: Math.random() * 6.283 };
      if (kind === "embers" || kind === "bubbles") p.y = top ? H + 10 : p.y;
      return p;
    }
    function stepAmbient(dt) {
      var want = Math.round((AMBIENT[ambient.kind] || 0) * ambient.density);
      var parts = ambient.parts;
      while (parts.length < want) parts.push(spawnAmbient(parts.length > want / 2));
      if (parts.length > want) parts.length = want;
      for (var k = 0; k < parts.length; k++) {
        var p = parts[k], kind = ambient.kind;
        p.a += dt * (0.6 + p.s);
        if (kind === "snow") { p.y += (25 + 45 * p.s) * dt; p.x += Math.sin(p.a) * 18 * dt; }
        else if (kind === "rain") { p.y += (520 + 300 * p.s) * dt; p.x -= 90 * dt; }
        else if (kind === "embers") { p.y -= (30 + 60 * p.s) * dt; p.x += Math.sin(p.a * 1.7) * 20 * dt; }
        else if (kind === "bubbles") { p.y -= (20 + 40 * p.s) * dt; p.x += Math.sin(p.a) * 12 * dt; }
        else if (kind === "leaves") { p.y += (30 + 40 * p.s) * dt; p.x += Math.sin(p.a) * 40 * dt; }
        else if (kind === "dust") { p.y += Math.sin(p.a) * 6 * dt; p.x += (6 + 10 * p.s) * dt; }
        if (p.y > H + 20 || p.y < -20 || p.x < -20 || p.x > W + 20) parts[k] = spawnAmbient(true);
      }
    }
    function drawAmbient() {
      var parts = ambient.parts, kind = ambient.kind;
      if (!parts.length) return;
      for (var k = 0; k < parts.length; k++) {
        var p = parts[k];
        if (kind === "rain") { g.globalAlpha = 0.35; g.strokeStyle = colors.muted; g.lineWidth = 1; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - 4, p.y + 14); g.stroke(); continue; }
        if (kind === "stars") { g.globalAlpha = 0.25 + 0.6 * Math.abs(Math.sin(p.a * 2)); g.fillStyle = colors.fg; g.fillRect(p.x, p.y, 1.5 + p.s, 1.5 + p.s); continue; }
        g.globalAlpha = kind === "embers" ? 0.5 + 0.5 * Math.abs(Math.sin(p.a * 3)) : kind === "dust" ? 0.25 : 0.7;
        g.fillStyle = kind === "embers" ? (p.s > 0.5 ? colors.accent : colors.danger) : kind === "leaves" ? colors.accent2 : colors.fg;
        g.beginPath();
        if (kind === "bubbles") { g.strokeStyle = colors.fg; g.lineWidth = 1; g.arc(p.x, p.y, 2 + 4 * p.s, 0, 6.283); g.stroke(); }
        else if (kind === "leaves") { g.ellipse(p.x, p.y, 4 + 3 * p.s, 2, p.a, 0, 6.283); g.fill(); }
        else { g.arc(p.x, p.y, kind === "dust" ? 1 + p.s : 1.2 + 1.8 * p.s, 0, 6.283); g.fill(); }
      }
      g.globalAlpha = 1;
    }
    function layer(name, w, h, build) {
      if (!makeCanvas) return null;
      var c = layers[name];
      if (!c || c.width !== w || c.height !== h) {
        try { c = layers[name] = makeCanvas(w, h); if (build) build(c); } catch (e) { makeCanvas = null; return null; }
      }
      return c;
    }
    function toScreen(x, y) {
      var cam = api.camera, z = (cam.zoom || 1);
      return { x: (x - (cam.x || 0) - W / 2) * z + W / 2, y: (y - (cam.y || 0) - H / 2) * z + H / 2, z: z };
    }
    // Post-processing, in screen space after the world: light, bloom, vignette, scanlines, grain.
    function drawPost(ctx) {
      // Darkness only falls where the game lights something: a game that
      // never calls api.light() is never left black.
      if (post.darkness > 0 && lights.length) {
        var dark = layer("light", W, H);
        if (dark) {
          var d = dark.getContext("2d");
          d.globalCompositeOperation = "source-over";
          d.clearRect(0, 0, W, H);
          d.fillStyle = "rgba(0,0,0," + post.darkness + ")";
          d.fillRect(0, 0, W, H);
          d.globalCompositeOperation = "destination-out";
          for (var k = 0; k < lights.length; k++) {
            var l = lights[k], s = toScreen(l.x, l.y), r = l.r * s.z;
            var cut = d.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
            cut.addColorStop(0, "rgba(0,0,0," + l.i + ")");
            cut.addColorStop(1, "rgba(0,0,0,0)");
            d.fillStyle = cut;
            d.fillRect(s.x - r, s.y - r, r * 2, r * 2);
          }
          ctx.drawImage(dark, 0, 0, W, H);
        }
      }
      if (lights.length) {
        ctx.globalCompositeOperation = "lighter";
        for (var j = 0; j < lights.length; j++) {
          var lt = lights[j];
          if (!lt.color) continue;
          var p = toScreen(lt.x, lt.y), rr = lt.r * p.z * 0.8;
          var glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
          glow.addColorStop(0, rgba(lt.color, 0.22 * lt.i));
          glow.addColorStop(1, rgba(lt.color, 0));
          ctx.fillStyle = glow;
          ctx.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
        }
        ctx.globalCompositeOperation = "source-over";
      }
      if (post.bloom > 0 && ctx.canvas && "filter" in ctx) {
        var sw = Math.max(1, Math.round(W / 4)), sh = Math.max(1, Math.round(H / 4));
        var small = layer("bloom", sw, sh);
        if (small) {
          var b = small.getContext("2d");
          b.clearRect(0, 0, sw, sh);
          b.filter = "blur(3px) brightness(1.15)";
          b.drawImage(ctx.canvas, 0, 0, sw, sh);
          b.filter = "none";
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = post.bloom * 0.45;
          ctx.drawImage(small, 0, 0, W, H);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
        }
      }
      if (post.vignette > 0) {
        var v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        v.addColorStop(0, "rgba(0,0,0,0)");
        v.addColorStop(1, "rgba(0,0,0," + (post.vignette * 0.7) + ")");
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, W, H);
      }
      if (post.scanlines > 0) {
        var scan = layer("scan", 2, 3, function (c) { var x = c.getContext("2d"); x.fillStyle = "rgba(0,0,0,1)"; x.fillRect(0, 2, 2, 1); });
        if (scan) { ctx.globalAlpha = post.scanlines * 0.35; ctx.fillStyle = ctx.createPattern(scan, "repeat"); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
      }
      if (post.grain > 0) {
        var noise = layer("grain", 128, 128, function (c) {
          var x = c.getContext("2d"), img = x.createImageData(128, 128);
          for (var n = 0; n < img.data.length; n += 4) { var v2 = Math.random() * 255; img.data[n] = img.data[n + 1] = img.data[n + 2] = v2; img.data[n + 3] = 255; }
          x.putImageData(img, 0, 0);
        });
        if (noise) {
          ctx.save();
          ctx.globalAlpha = post.grain * 0.12;
          ctx.globalCompositeOperation = "overlay";
          ctx.translate(-Math.random() * 128, -Math.random() * 128);
          ctx.fillStyle = ctx.createPattern(noise, "repeat");
          ctx.fillRect(0, 0, W + 128, H + 128);
          ctx.restore();
        }
      }
    }
    // Boss health and the combo meter sit on the screen above the post-processing.
    function drawOverlay(ctx) {
      if (boss) {
        var bw = Math.min(W * 0.56, 560), bx = (W - bw) / 2, by = 54;
        api.draw.text(boss.name, W / 2, by - 8, { size: 15, color: colors.fg, align: "center", baseline: "bottom", weight: 700, stroke: "rgba(0,0,0,0.6)" });
        ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(bx - 2, by - 2, bw + 4, 14);
        ctx.fillStyle = colors.danger; ctx.fillRect(bx, by, bw * boss.hp, 10);
        ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(bx, by, bw * boss.hp, 3);
      }
      if (combo.n >= 2 && combo.t > 0) {
        var label = (plan.locale === "en" ? "COMBO" : "КОМБО") + " ×" + (1 + Math.floor(combo.n / 5)), cy = boss ? 92 : 64;
        var pop = 1 + Math.max(0, combo.t - 2.4) * 1.5;
        api.draw.text(label, W - 24, cy, { size: Math.round(20 * pop), color: colors.accent, align: "right", weight: 800, stroke: "rgba(0,0,0,0.6)" });
        api.draw.text(String(combo.n), W - 24, cy + 22, { size: 13, color: colors.fg, align: "right", weight: 700, stroke: "rgba(0,0,0,0.6)" });
        ctx.fillStyle = colors.accent; ctx.fillRect(W - 24 - 90 * (combo.t / 2.6), cy + 30, 90 * (combo.t / 2.6), 3);
      }
    }

    api.draw = {
      rect: function (x, y, w, h, color) { g.fillStyle = color || colors.fg; g.fillRect(x, y, w, h); },
      roundRect: function (x, y, w, h, r, color, stroke, width) {
        r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
        g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
        if (color) { g.fillStyle = color; g.fill(); }
        if (stroke) { g.strokeStyle = stroke; g.lineWidth = width || 2; g.stroke(); }
      },
      circle: function (x, y, r, color) { g.beginPath(); g.arc(x, y, Math.max(0, r), 0, 6.283); g.fillStyle = color || colors.fg; g.fill(); },
      ring: function (x, y, r, color, width) { g.beginPath(); g.arc(x, y, Math.max(0, r), 0, 6.283); g.strokeStyle = color || colors.fg; g.lineWidth = width || 2; g.stroke(); },
      line: function (x1, y1, x2, y2, color, width) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokeStyle = color || colors.fg; g.lineWidth = width || 2; g.stroke(); },
      poly: function (points, color, stroke, width) {
        if (!points || points.length < 2) return;
        g.beginPath();
        if (typeof points[0] === "number") { g.moveTo(points[0], points[1]); for (var p = 2; p + 1 < points.length; p += 2) g.lineTo(points[p], points[p + 1]); }
        else { g.moveTo(points[0].x, points[0].y); for (var q = 1; q < points.length; q++) g.lineTo(points[q].x, points[q].y); }
        g.closePath();
        if (color) { g.fillStyle = color; g.fill(); }
        if (stroke) { g.strokeStyle = stroke; g.lineWidth = width || 2; g.stroke(); }
      },
      text: function (str, x, y, opt) {
        opt = opt || {};
        g.font = api.font(opt.size || 20, opt.weight || 700);
        g.textAlign = opt.align || "left"; g.textBaseline = opt.baseline || "alphabetic";
        if (opt.shadow) { g.shadowColor = opt.shadow; g.shadowBlur = opt.blur || 12; }
        if (opt.stroke) { g.strokeStyle = opt.stroke; g.lineWidth = opt.strokeWidth || 4; g.strokeText(String(str), x, y); }
        g.fillStyle = opt.color || colors.fg; g.fillText(String(str), x, y);
        if (opt.shadow) g.shadowBlur = 0;
      },
      glow: function (color, blur) { g.shadowColor = color || colors.accent; g.shadowBlur = blur === undefined ? 16 : blur; },
      noGlow: function () { g.shadowBlur = 0; },
      gradient: function (x, y, w, h, c1, c2, horizontal) { var gr = horizontal ? g.createLinearGradient(x, y, x + w, y) : g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(x, y, w, h); },
      radial: function (x, y, r, inner, outer) { var gr = g.createRadialGradient(x, y, 0, x, y, Math.max(1, r)); gr.addColorStop(0, inner); gr.addColorStop(1, outer || "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); },
      pixels: function (rows, map, x, y, scale, flip) {
        scale = scale || 3;
        for (var r = 0; r < rows.length; r++) {
          var row = rows[r];
          for (var c = 0; c < row.length; c++) {
            var color = map[row[c]];
            if (!color) continue;
            g.fillStyle = color;
            g.fillRect(x + (flip ? row.length - 1 - c : c) * scale, y + r * scale, scale, scale);
          }
        }
      },
      star: function (x, y, outer, inner, points, color) {
        points = points || 5; g.beginPath();
        for (var s = 0; s < points * 2; s++) { var rad = s % 2 ? inner : outer, a = -Math.PI / 2 + s * Math.PI / points; g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
        g.closePath(); g.fillStyle = color || colors.accent; g.fill();
      },
      bar: function (x, y, w, h, value, color, back) {
        value = Math.max(0, Math.min(1, Number(value) || 0));
        g.fillStyle = back || "rgba(0,0,0,0.45)"; g.fillRect(x, y, w, h);
        g.fillStyle = color || colors.good; g.fillRect(x, y, w * value, h);
      }
    };

    function updateEffects(dt) {
      for (var k = fx.length - 1; k >= 0; k--) {
        var p = fx[k];
        p.life -= dt;
        if (p.life <= 0) { fx.splice(k, 1); continue; }
        p.vx *= Math.pow(p.drag, dt * 60); p.vy = p.vy * Math.pow(p.drag, dt * 60) + p.gravity * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      for (var j = texts.length - 1; j >= 0; j--) { texts[j].life -= dt; texts[j].y -= 40 * dt; if (texts[j].life <= 0) texts.splice(j, 1); }
      if (shake.t > 0) { shake.t -= dt; if (shake.t <= 0) shake.power = 0; }
      if (flash.t > 0) flash.t -= dt;
    }
    function drawEffects() {
      for (var k = 0; k < fx.length; k++) {
        var p = fx[k];
        g.globalAlpha = Math.max(0, p.life / p.max);
        g.fillStyle = p.color;
        if (p.square) g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        else { g.beginPath(); g.arc(p.x, p.y, p.size, 0, 6.283); g.fill(); }
      }
      g.globalAlpha = 1;
      for (var j = 0; j < texts.length; j++) {
        var t = texts[j];
        g.globalAlpha = Math.max(0, t.life / t.max);
        api.draw.text(t.text, t.x, t.y, { size: t.size, color: t.color, align: "center", stroke: "rgba(0,0,0,0.55)", strokeWidth: 3 });
      }
      g.globalAlpha = 1;
    }

    var core = {
      api: api, W: W, H: H, colors: colors, error: null,
      input: {
        key: function (n, down) { if (down && !keys[n]) hit[n] = true; keys[n] = !!down; },
        raw: function (code, down) { if (down && !raw[code]) rawHit[code] = true; raw[code] = !!down; },
        pointer: function (x, y, down) {
          pointer.x = x; pointer.y = y;
          if (down === true && !pointer.down) pointer.pressed = true;
          if (down === false && pointer.down) pointer.released = true;
          if (down === true || down === false) pointer.down = down;
        },
        joystick: function (x, y) { joy.x = x; joy.y = y; },
        clear: function () { keys = {}; raw = {}; joy.x = 0; joy.y = 0; pointer.down = false; }
      },
      setup: function () { if (setupDone) return; setupDone = true; call("setup"); },
      play: function () {
        core.setup();
        api.score = 0; api.lives = startLives; api.level = 1; api.time = 0; api.frame = 0; api.status = "";
        api.camera.x = 0; api.camera.y = 0; api.camera.zoom = 1; api.data = {};
        fx.length = 0; texts.length = 0; hit = {}; rawHit = {}; core.error = null;
        tweens.length = 0; trails = {}; boss = null; combo.n = 0; combo.t = 0; timeScale = 1; slowT = 0; freezeT = 0; punch.t = 0;
        api.state = "playing"; started = true;
        emit("score", 0); emit("lives", api.lives); emit("level", 1); emit("status", ""); emit("state", "playing");
        call("start", 1);
      },
      pause: function () { if (api.state === "playing") { api.state = "paused"; emit("state", "paused"); } },
      resume: function () { if (api.state === "paused") { api.state = "playing"; emit("state", "playing"); } },
      menu: function () { api.state = "menu"; started = false; emit("state", "menu"); },
      step: function (dt) {
        dt = Math.min(Math.max(Number(dt) || 0, 0), 0.05);
        api.dt = dt; clock += dt;
        var cam = api.camera, zoom = cam.zoom || 1;
        pointer.wx = (pointer.x - W / 2) / zoom + W / 2 + (cam.x || 0);
        pointer.wy = (pointer.y - H / 2) / zoom + H / 2 + (cam.y || 0);
        if (api.state === "playing") {
          if (slowT > 0) { slowT -= dt; if (slowT <= 0) timeScale = 1; }
          if (combo.t > 0) { combo.t -= dt; if (combo.t <= 0) combo.n = 0; }
          // A hit-stop freezes the world for a few frames; effects keep moving.
          if (freezeT > 0) freezeT -= dt;
          else {
            var gameDt = dt * timeScale;
            api.dt = gameDt;
            api.time += gameDt; api.frame += 1;
            call("update", gameDt);
            stepTweens(gameDt);
          }
        }
        if (punch.t > 0) punch.t -= dt;
        stepAmbient(dt);
        stepTrails(dt);
        if (api.state === "playing" || api.state === "over" || api.state === "won") updateEffects(dt);
        hit = {}; rawHit = {}; pointer.pressed = false; pointer.released = false;
      },
      render: function (ctx) {
        g = ctx; api.ctx = ctx;
        ctx.save();
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        try { paintBackdrop(ctx, clock, api.camera); } catch (e) { ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, W, H); }
        if (started && api.state !== "menu") {
          ctx.save();
          if (shake.t > 0) ctx.translate((Math.random() * 2 - 1) * shake.power, (Math.random() * 2 - 1) * shake.power);
          var cam = api.camera;
          var zoom = (cam.zoom || 1) * (punch.t > 0 ? 1 + punch.amount * (punch.t / punch.max) : 1);
          if (zoom !== 1) { ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2); }
          ctx.translate(-(cam.x || 0), -(cam.y || 0));
          if (api.state !== "error") call("draw");
          drawTrails();
          drawEffects();
          ctx.restore();
          drawAmbient();
          // Heavy passes step back on a device that cannot keep up.
          var now = typeof performance !== "undefined" && performance.now ? performance.now() : 0;
          if (now && lastRender) slowFrames = now - lastRender > 26 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
          lastRender = now;
          if (slowFrames > 90) { post.bloom = 0; post.grain = 0; slowFrames = 0; }
          drawPost(ctx);
          drawOverlay(ctx);
        }
        lights.length = 0;
        if (flash.t > 0) { ctx.globalAlpha = Math.max(0, flash.t / flash.max) * 0.45; ctx.fillStyle = flash.color; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
        ctx.restore();
      }
    };
    return core;
  }
  M.createCore = createCore;
  M.tools = tools;

  /* -------------------------------------------------------------- audio */

  function createAudio(mood) {
    var AC = root.AudioContext || root.webkitAudioContext;
    var ac = null, out = null, muted = false, timer = null, step = 0, nextAt = 0;
    var SCALES = { upbeat: [0, 4, 7, 12, 7, 4, 9, 7], tense: [0, 3, 7, 6, 0, 3, 10, 7], calm: [0, 7, 12, 4, 9, 7, 5, 4], epic: [0, 7, 10, 12, 3, 7, 5, 2] };
    var ROOT = { upbeat: 220, tense: 196, calm: 262, epic: 147 };
    function unlock() {
      if (!AC) return null;
      if (!ac) { try { ac = new AC(); out = ac.createGain(); out.gain.value = muted ? 0 : 0.6; out.connect(ac.destination); } catch (e) { ac = null; return null; } }
      if (ac.state === "suspended" && ac.resume) ac.resume();
      return ac;
    }
    function tone(f1, f2, dur, type, vol, delay) {
      var c = unlock(); if (!c || muted) return;
      var t = c.currentTime + (delay || 0), o = c.createOscillator(), gain = c.createGain();
      o.type = type || "square"; o.frequency.setValueAtTime(f1, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
      gain.gain.setValueAtTime(vol || 0.15, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gain); gain.connect(out); o.start(t); o.stop(t + dur + 0.03);
    }
    function noise(dur, vol, cutoff, delay) {
      var c = unlock(); if (!c || muted) return;
      var len = Math.max(1, Math.floor(c.sampleRate * dur)), buf = c.createBuffer(1, len, c.sampleRate), data = buf.getChannelData(0);
      for (var k = 0; k < len; k++) data[k] = (Math.random() * 2 - 1) * (1 - k / len);
      var src = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain(), t = c.currentTime + (delay || 0);
      src.buffer = buf; filter.type = "lowpass"; filter.frequency.value = cutoff || 1800; gain.gain.value = vol || 0.2;
      src.connect(filter); filter.connect(gain); gain.connect(out); src.start(t);
    }
    var SFX = {
      shoot: function () { tone(920, 240, 0.11, "square", 0.08); },
      laser: function () { tone(1400, 300, 0.16, "sawtooth", 0.06); },
      hit: function () { noise(0.08, 0.22, 2600); tone(300, 120, 0.08, "square", 0.06); },
      explode: function () { noise(0.5, 0.35, 900); tone(140, 40, 0.4, "sawtooth", 0.08); },
      coin: function () { tone(988, 0, 0.07, "square", 0.08); tone(1319, 0, 0.14, "square", 0.08, 0.07); },
      pickup: function () { tone(660, 1320, 0.12, "triangle", 0.12); },
      jump: function () { tone(330, 700, 0.16, "sine", 0.14); },
      power: function () { tone(523, 0, 0.08, "square", 0.08); tone(659, 0, 0.08, "square", 0.08, 0.08); tone(784, 0, 0.14, "square", 0.08, 0.16); },
      hurt: function () { tone(260, 70, 0.28, "sawtooth", 0.12); noise(0.12, 0.12, 1200); },
      win: function () { tone(523, 0, 0.12, "triangle", 0.12); tone(659, 0, 0.12, "triangle", 0.12, 0.12); tone(784, 0, 0.12, "triangle", 0.12, 0.24); tone(1047, 0, 0.35, "triangle", 0.12, 0.36); },
      lose: function () { tone(392, 0, 0.18, "triangle", 0.12); tone(330, 0, 0.18, "triangle", 0.12, 0.18); tone(262, 0, 0.4, "triangle", 0.12, 0.36); },
      click: function () { tone(700, 0, 0.04, "triangle", 0.08); },
      select: function () { tone(520, 780, 0.07, "triangle", 0.09); },
      bounce: function () { tone(420, 560, 0.06, "triangle", 0.1); },
      step: function () { noise(0.03, 0.06, 1400); },
      engine: function () { tone(90, 110, 0.12, "sawtooth", 0.03); }
    };
    function music(on) {
      if (timer) { clearInterval(timer); timer = null; }
      if (!on || !mood || mood === "none" || !unlock()) return;
      var notes = SCALES[mood] || SCALES.upbeat, base = ROOT[mood] || 220, beat = mood === "calm" ? 0.34 : mood === "epic" ? 0.27 : 0.2;
      // A four-chord progression under the melody, a bass line and a light kit.
      var PROGRESSIONS = { upbeat: [0, 9, 5, 7], tense: [0, 8, 5, 7], calm: [0, 5, 9, 7], epic: [0, 8, 3, 10] };
      var chords = PROGRESSIONS[mood] || PROGRESSIONS.upbeat;
      nextAt = ac.currentTime + 0.06;
      timer = setInterval(function () {
        if (muted || !ac) return;
        while (nextAt < ac.currentTime + 0.3) {
          var shift = chords[Math.floor(step / 8) % chords.length], delay = Math.max(0, nextAt - ac.currentTime);
          var n = notes[step % notes.length] + shift;
          tone(base * Math.pow(2, n / 12), 0, beat * 0.9, "triangle", 0.028, delay);
          if (step % 2 === 0) tone(base / 2 * Math.pow(2, shift / 12), 0, beat * 1.6, "sine", 0.05, delay);
          if (mood !== "calm") {
            if (step % 4 === 0) tone(120, 45, 0.16, "sine", 0.12, delay);
            if (step % 4 === 2) noise(0.09, 0.07, 3200, delay);
            if (step % 2 === 1) noise(0.03, 0.03, 9000, delay);
          }
          step++; nextAt += beat;
        }
      }, 100);
    }
    return {
      unlock: unlock,
      play: function (name) { if (muted) return; if (!unlock()) return; try { (SFX[name] || SFX.click)(); } catch (e) { /* sound is optional */ } },
      music: music,
      setMuted: function (value) { muted = !!value; if (out) out.gain.value = muted ? 0 : 0.6; },
      isMuted: function () { return muted; }
    };
  }

  /* --------------------------------------------------------------- page */

  function esc(value) { return String(value === undefined || value === null ? "" : value).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }

  function storage(title) {
    var memory = {}, prefix = "malik-game:" + String(title || "game").slice(0, 40) + ":";
    return {
      get: function (key) { try { var v = root.localStorage.getItem(prefix + key); if (v !== null) return v; } catch (e) { /* sandboxed preview */ } return memory[key]; },
      set: function (key, value) { memory[key] = String(value); try { root.localStorage.setItem(prefix + key, String(value)); } catch (e) { /* sandboxed preview */ } }
    };
  }

  var KEYMAP = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", Space: "action", KeyJ: "action", KeyZ: "action", Enter: "action", ShiftLeft: "action2", ShiftRight: "action2", KeyK: "action2", KeyX: "action2" };

  M.boot = function () {
    if (!doc) return;
    var plan = M.plan || {};
    var L = TEXT[plan.locale] || TEXT.en;
    var stage = doc.getElementById("stage"), canvas = doc.getElementById("game");
    var ui = doc.getElementById("ui"), hud = doc.getElementById("hud"), touch = doc.getElementById("touch");
    var ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    var store = storage(plan.title);
    var audio = createAudio(plan.theme && plan.theme.mood);
    if (store.get("muted") === "1") audio.setMuted(true);
    var game = M.definition;
    var ratio = 1, frames = 0, readySent = false, bootSent = false;

    function post(message) { try { if (root.parent && root.parent !== root) root.parent.postMessage(message, "*"); } catch (e) { /* no parent */ } }
    function showError(error) {
      ui.innerHTML = '<section class="panel" role="alertdialog"><p class="eyebrow">' + esc(plan.title) + '</p><h2>' + esc(L.error) + '</h2><p class="error">' + esc(error && error.message) + '</p><button class="primary" data-act="reload">' + esc(L.reload) + '</button></section>';
      ui.hidden = false;
      post({ type: "malik-game-error", message: String(error && error.message || ""), where: error && error.where });
    }
    root.addEventListener("error", function (event) { if (!M.definition) showError({ message: String(event.message || L.noGame), where: "load" }); });
    if (!game || !ctx) { showError({ message: L.noGame, where: "load" }); return; }

    // Pixel-art games keep hard pixel edges when the canvas is scaled.
    if (plan.theme && plan.theme.style === "pixel") { canvas.style.imageRendering = "pixelated"; ctx.imageSmoothingEnabled = false; }
    var core = createCore({
      plan: plan, game: game, best: Number(store.get("best") || 0) || 0,
      baseTransform: function () { return [ratio, 0, 0, ratio, 0, 0]; },
      makeCanvas: function (w, h) { var c = doc.createElement("canvas"); c.width = w; c.height = h; return c; },
      events: {
        score: function (v) { setText("hud-score", v); },
        lives: function (v) { setText("hud-lives", v > 9 ? "❤ × " + v : new Array(v + 1).join("❤")); },
        level: function (v) { setText("hud-level", core.api.levels ? L.level + " " + v + "/" + core.api.levels : L.level + " " + v); if (v > 1) banner(L.level + " " + v); },
        status: function (v) { var el = doc.getElementById("hud-status"); if (el) { el.textContent = v; el.hidden = !v; } },
        sfx: function (n) { audio.play(n); },
        end: function (r) {
          if (r.record) store.set("best", r.best);
          setText("hud-best", r.best);
          audio.music(false);
          endScreen(r);
        },
        error: function (e) { audio.music(false); showError(e); }
      }
    });
    var api = core.api, W = core.W, H = core.H;
    root.__malikGame = { core: core, frames: function () { return frames; } };

    function setText(id, value) { var el = doc.getElementById(id); if (el) el.textContent = String(value); }
    function banner(text) { var el = doc.createElement("div"); el.className = "banner"; el.textContent = text; stage.appendChild(el); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1600); }

    var controls = (plan.controls || []).map(function (c) { return '<li><kbd>' + esc(c.keys) + '</kbd><span>' + esc(c.action) + '</span></li>'; }).join("");
    function menuScreen() {
      ui.innerHTML = '<section class="panel menu" role="dialog" aria-label="' + esc(plan.title) + '">' +
        (plan.genre ? '<p class="eyebrow">' + esc(plan.genre) + '</p>' : '') +
        '<h1>' + esc(plan.title || "Game") + '</h1>' +
        (plan.tagline ? '<p class="tagline">' + esc(plan.tagline) + '</p>' : '') +
        '<button class="primary" data-act="play" autofocus>▶ ' + esc(L.play) + '</button>' +
        (controls ? '<div class="controls"><p>' + esc(L.controls) + '</p><ul>' + controls + '</ul></div>' : '') +
        (plan.goal && plan.goal !== plan.tagline ? '<p class="goal">' + esc(plan.goal) + '</p>' : '') +
        (touchDevice && W > H && (root.innerHeight || 0) > (root.innerWidth || 0) ? '<p class="rotate">⟳ ' + esc(L.rotate) + '</p>' : '') +
        '<p class="best">' + esc(L.best) + ': <b>' + esc(api.best) + '</b>' + (api.levels ? '' : ' · ' + esc(L.endless)) + '</p>' +
        '</section>';
      ui.hidden = false; hud.hidden = true; touch.hidden = true;
      var btn = ui.querySelector("[data-act=play]"); if (btn && btn.focus) btn.focus();
    }
    function pauseScreen() {
      ui.innerHTML = '<section class="panel" role="dialog"><h2>' + esc(L.paused) + '</h2><button class="primary" data-act="resume">▶ ' + esc(L.resume) + '</button><div class="row"><button data-act="restart">↺ ' + esc(L.restart) + '</button><button data-act="menu">' + esc(L.menu) + '</button></div><p class="hint">' + esc(L.hint) + '</p></section>';
      ui.hidden = false;
    }
    function endScreen(r) {
      ui.innerHTML = '<section class="panel ' + (r.won ? 'won' : 'over') + '" role="dialog"><p class="eyebrow">' + esc(plan.title) + '</p><h2>' + esc(r.won ? L.won : L.over) + '</h2>' +
        (r.message ? '<p class="tagline">' + esc(r.message) + '</p>' : '') +
        '<p class="final"><b>' + esc(r.score) + '</b> ' + esc(L.score) + '</p>' +
        '<p class="best">' + (r.record && r.score > 0 ? '★ ' + esc(L.newBest) : esc(L.best) + ': <b>' + esc(r.best) + '</b>') + '</p>' +
        '<button class="primary" data-act="restart">↺ ' + esc(L.again) + '</button><div class="row"><button data-act="menu">' + esc(L.menu) + '</button></div></section>';
      ui.hidden = false; touch.hidden = true;
    }

    function start() {
      audio.unlock(); audio.play("select");
      ui.hidden = true; ui.innerHTML = ""; hud.hidden = false;
      touch.hidden = !touchDevice;
      setText("hud-best", api.best);
      core.play();
      audio.music(true);
      if (canvas.focus) canvas.focus();
    }
    function togglePause() {
      if (api.state === "playing") { core.pause(); audio.music(false); pauseScreen(); }
      else if (api.state === "paused") { ui.hidden = true; core.resume(); audio.music(true); }
    }
    function toggleMute() {
      audio.setMuted(!audio.isMuted()); store.set("muted", audio.isMuted() ? "1" : "0");
      var m = doc.getElementById("hud-mute"); if (m) m.textContent = audio.isMuted() ? "🔇" : "🔊";
      if (!audio.isMuted() && api.state === "playing") audio.music(true);
    }
    function act(name) {
      if (name === "play" || name === "restart") start();
      else if (name === "resume") togglePause();
      else if (name === "pause") togglePause();
      else if (name === "menu") { core.menu(); audio.music(false); menuScreen(); }
      else if (name === "mute") toggleMute();
      else if (name === "reload") { try { root.location.reload(); } catch (e) { start(); } }
    }
    doc.addEventListener("click", function (e) { var t = e.target && e.target.closest ? e.target.closest("[data-act]") : null; if (t) { e.preventDefault(); act(t.getAttribute("data-act")); } });

    root.addEventListener("keydown", function (e) {
      var code = e.code || e.key;
      if (code === "KeyP" || code === "Escape") { if (api.state === "playing" || api.state === "paused") { togglePause(); e.preventDefault(); } return; }
      if (code === "KeyM") { toggleMute(); return; }
      if ((code === "Enter" || code === "Space") && (api.state === "menu" || api.state === "over" || api.state === "won") && !e.repeat) { start(); e.preventDefault(); return; }
      if (code === "KeyR" && (api.state === "over" || api.state === "won")) { start(); return; }
      var mapped = KEYMAP[code];
      if (mapped) { core.input.key(mapped, true); e.preventDefault(); }
      core.input.raw(code, true);
    });
    root.addEventListener("keyup", function (e) { var code = e.code || e.key, mapped = KEYMAP[code]; if (mapped) core.input.key(mapped, false); core.input.raw(code, false); });
    root.addEventListener("blur", function () { core.input.clear(); if (api.state === "playing") togglePause(); });
    doc.addEventListener("visibilitychange", function () { if (doc.hidden && api.state === "playing") togglePause(); });

    function logical(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / Math.max(1, r.width) * W, y: (e.clientY - r.top) / Math.max(1, r.height) * H }; }
    canvas.addEventListener("pointerdown", function (e) { var p = logical(e); try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* older browsers */ } audio.unlock(); core.input.pointer(p.x, p.y, true); e.preventDefault(); });
    canvas.addEventListener("pointermove", function (e) { var p = logical(e); core.input.pointer(p.x, p.y); });
    canvas.addEventListener("pointerup", function (e) { var p = logical(e); core.input.pointer(p.x, p.y, false); });
    canvas.addEventListener("pointercancel", function (e) { var p = logical(e); core.input.pointer(p.x, p.y, false); });
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    var touchDevice = ("ontouchstart" in root) || (root.navigator && root.navigator.maxTouchPoints > 0);
    var touchPlan = plan.touch || { joystick: plan.input !== "pointer", buttons: [] };
    (function buildTouch() {
      var html = "";
      if (touchPlan.joystick) html += '<div class="stick" aria-hidden="true"><div class="knob"></div></div>';
      html += '<div class="buttons">' + (touchPlan.buttons || []).map(function (b) { return '<button class="tbtn" data-key="' + esc(b.id === "action2" ? "action2" : "action") + '">' + esc(b.label) + '</button>'; }).join("") + '</div>';
      touch.innerHTML = html;
      var stick = touch.querySelector(".stick"), knob = touch.querySelector(".knob");
      if (stick) {
        var active = null;
        var move = function (e) {
          var r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width / 2;
          var dx = e.clientX - cx, dy = e.clientY - cy, len = Math.hypot(dx, dy);
          if (len > max) { dx = dx / len * max; dy = dy / len * max; }
          knob.style.transform = "translate(" + dx + "px," + dy + "px)";
          core.input.joystick(dx / max, dy / max);
        };
        stick.addEventListener("pointerdown", function (e) { active = e.pointerId; try { stick.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } move(e); e.preventDefault(); });
        stick.addEventListener("pointermove", function (e) { if (e.pointerId === active) move(e); });
        var end = function () { active = null; knob.style.transform = ""; core.input.joystick(0, 0); };
        stick.addEventListener("pointerup", end); stick.addEventListener("pointercancel", end);
      }
      Array.prototype.forEach.call(touch.querySelectorAll(".tbtn"), function (b) {
        var key = b.getAttribute("data-key");
        b.addEventListener("pointerdown", function (e) { core.input.key(key, true); b.classList.add("on"); e.preventDefault(); });
        var up = function () { core.input.key(key, false); b.classList.remove("on"); };
        b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("pointerleave", up);
      });
    })();

    function resize() {
      var vw = stage.clientWidth || root.innerWidth || W, vh = stage.clientHeight || root.innerHeight || H;
      var scale = Math.min(vw / W, vh / H);
      var cssW = Math.max(1, Math.floor(W * scale)), cssH = Math.max(1, Math.floor(H * scale));
      canvas.style.width = cssW + "px"; canvas.style.height = cssH + "px";
      var dpr = Math.min(root.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      ratio = canvas.width / W;
    }
    root.addEventListener("resize", resize);
    resize();

    hud.innerHTML = '<div class="hud-left"><span class="pill score"><b id="hud-score">0</b><small>' + esc(L.score) + '</small></span><span class="pill soft">' + esc(L.best) + ' <b id="hud-best">' + esc(api.best) + '</b></span></div>' +
      '<div class="hud-center"><span class="pill" id="hud-level"></span><span class="pill soft" id="hud-status" hidden></span></div>' +
      '<div class="hud-right"><span class="pill lives" id="hud-lives"></span><button class="icon" id="hud-mute" data-act="mute" aria-label="sound">' + (audio.isMuted() ? "🔇" : "🔊") + '</button><button class="icon" data-act="pause" aria-label="' + esc(L.paused) + '">❚❚</button></div>';

    var STEP = 1 / 60, acc = 0, last = 0;
    function frame(now) {
      var dt = last ? (now - last) / 1000 : 0; last = now;
      if (dt > 0.25) dt = 0.25;
      acc += dt;
      var steps = 0;
      while (acc >= STEP && steps < 5) { core.step(STEP); acc -= STEP; steps++; }
      if (steps >= 5) acc = 0;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, W, H);
      core.render(ctx);
      frames++;
      if (!bootSent && frames > 10 && !core.error) { bootSent = true; post({ type: "malik-game-booted", frames: frames }); }
      if (!readySent && frames > 30 && api.state === "playing" && !core.error) { readySent = true; post({ type: "malik-game-ready", frames: frames, playFrames: api.frame }); }
      root.requestAnimationFrame(frame);
    }
    core.setup();
    menuScreen();
    root.requestAnimationFrame(frame);
  };
})(typeof window !== "undefined" ? window : this);
`
