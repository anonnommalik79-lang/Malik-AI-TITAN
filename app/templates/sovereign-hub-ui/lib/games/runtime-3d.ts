/**
 * The Malik 3D game runtime, shipped inside every 3D game the studio makes.
 * Plain ES2017 in one string over three.js (global THREE): no build step, no
 * imports. Like the 2D runtime, it carries everything a model tends to get
 * wrong or run out of room for, so the model writes only the game:
 *
 *   createCore3D — the world, physics, character controller, weapons, bots,
 *                  zone, animation and effects. It never touches the DOM, so
 *                  the very same core runs in the page and in the server's
 *                  isolated test run (three.js scene graph and raycasting work
 *                  without a GPU there).
 *   boot3d       — the page around it: WebGL renderer with quality levels,
 *                  keyboard, mouse look (pointer lock or drag), touch stick and
 *                  look area, HUD with health, ammo, minimap and kill feed,
 *                  menus, WebAudio sound and music, best score, errors.
 *
 * Kept free of backticks and template placeholders: it lives in String.raw.
 */
export const GAME_RUNTIME_3D_VERSION = "malik-game-runtime-3d/1"

/** The three.js build every 3D game page loads; the server's test run uses the same version from node_modules. */
export const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"

export const GAME_RUNTIME_3D_JS = String.raw`(function (root) {
  "use strict";
  var doc = root.document;
  var M = root.MalikGame = root.MalikGame || {};
  M.version = "malik-game-runtime-3d/1";
  M.engine = "3d";
  M.define = function (game) { if (game && typeof game === "object") M.definition = game; return game; };
  M.plan = (function () {
    try {
      var node = doc && doc.getElementById ? doc.getElementById("malik-game-plan") : null;
      return node ? JSON.parse(node.textContent || "{}") : (M.plan || {});
    } catch (e) { return M.plan || {}; }
  })();

  var TEXT = {
    ru: { play: "Играть", resume: "Продолжить", restart: "Заново", menu: "В меню", paused: "Пауза", over: "Игра окончена", won: "Победа!", score: "очки", best: "Рекорд", level: "Уровень", health: "Здоровье", ammo: "Патроны", reloading: "Перезарядка", controls: "Управление", error: "В игре произошла ошибка", reload: "Перезапустить", newBest: "Новый рекорд!", noGame: "Код игры не загрузился.", noThree: "3D-движок не загрузился: нужен интернет для three.js.", noGl: "Браузер не дал WebGL — 3D-игра не может запуститься.", alive: "Живых", zone: "Зона", quality: "Графика", clickToLook: "Кликните по игре, чтобы управлять мышью", low: "Низкая", medium: "Средняя", high: "Высокая" },
    kk: { play: "Ойнау", resume: "Жалғастыру", restart: "Қайта бастау", menu: "Мәзірге", paused: "Үзіліс", over: "Ойын аяқталды", won: "Жеңіс!", score: "ұпай", best: "Рекорд", level: "Деңгей", health: "Денсаулық", ammo: "Оқ", reloading: "Қайта оқтау", controls: "Басқару", error: "Ойында қате болды", reload: "Қайта іске қосу", newBest: "Жаңа рекорд!", noGame: "Ойын коды жүктелмеді.", noThree: "3D қозғалтқышы жүктелмеді: интернет керек.", noGl: "Браузер WebGL бермеді.", alive: "Тірі", zone: "Аймақ", quality: "Графика", clickToLook: "Тышқанмен басқару үшін ойынды басыңыз", low: "Төмен", medium: "Орташа", high: "Жоғары" },
    en: { play: "Play", resume: "Resume", restart: "Restart", menu: "Menu", paused: "Paused", over: "Game over", won: "You win!", score: "score", best: "Best", level: "Level", health: "Health", ammo: "Ammo", reloading: "Reloading", controls: "Controls", error: "The game hit an error", reload: "Restart", newBest: "New best!", noGame: "The game code did not load.", noThree: "The 3D engine did not load: three.js needs internet.", noGl: "The browser gave no WebGL; the 3D game cannot run.", alive: "Alive", zone: "Zone", quality: "Graphics", clickToLook: "Click the game to look with the mouse", low: "Low", medium: "Medium", high: "High" }
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function finite(v) { return typeof v === "number" && v === v && v !== Infinity && v !== -Infinity; }

  /* =============================================================== core */

  function createCore3D(options) {
    options = options || {};
    var THREE = options.THREE || root.THREE;
    if (!THREE) throw new Error("three.js is not loaded");
    var plan = options.plan || {}, game = options.game || {}, events = options.events || {};
    var theme = plan.theme || {}, pal = theme.palette || {};
    var colors = {
      bg: pal.bg || "#0b1020", bg2: pal.bg2 || "#1c2550", fg: pal.fg || "#f4f6ff", muted: pal.muted || "#98a2d4",
      accent: pal.accent || "#ffd23f", accent2: pal.accent2 || "#3bceac", danger: pal.danger || "#ee4266", good: pal.good || "#3bceac"
    };
    var W = Number(plan.width) || 1280, H = Number(plan.height) || 720;
    var totalLevels = Number(plan.levels) || 0;
    var startLives = Math.max(1, Number(plan.lives) || 3);
    var makeCanvas = options.makeCanvas || null;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(70, W / H, 0.1, 1500);
    camera.rotation.order = "YXZ";
    var api = {};
    var keys = {}, hit = {}, raw = {}, rawHit = {}, joy = { x: 0, y: 0 }, look = { dx: 0, dy: 0 };
    var pointer = { x: 0.5, y: 0.5, down: false, pressed: false, released: false };
    var started = false, setupDone = false, clock = 0;
    var colliders = [], blockers = [], targets = [], bodies = [], bots = [], weapons = [], tweens = [], spinners = [], tracers = [], texts = [], feed = [], lights = [];
    var zone = null, playerRef = null, follow = null, shake = { t: 0, power: 0 }, flash = { t: 0, max: 1, color: "#ffffff" };
    var materials = {}, geometries = {};
    var tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
    var raycaster = new THREE.Raycaster();
    var sun = null, hemi = null, ambientLight = null;

    api.three = THREE; api.scene = scene; api.camera = camera;
    api.W = W; api.H = H; api.time = 0; api.frame = 0; api.dt = 0;
    api.score = 0; api.lives = startLives; api.level = 1; api.levels = totalLevels;
    api.best = Number(options.best) || 0; api.state = "menu"; api.status = "";
    api.colors = colors; api.plan = plan; api.data = {}; api.pointer = pointer;
    api.hud = { crosshair: false, minimap: false };
    api.stats = { shots: 0, hits: 0, kills: 0 };

    function emit(type, value) { var fn = events[type]; if (fn) { try { fn(value, api); } catch (e) { /* page handlers never stop the game */ } } }
    var core = { api: api, scene: scene, camera: camera, W: W, H: H, colors: colors, error: null };
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
        if (name === "update") return fn.call(game, arg, api);
        return fn.call(game, api, arg);
      } catch (error) { fail(error, name); return undefined; }
    }

    /* ---------------------------------------------------------- input */
    api.key = function (n) {
      return !!keys[n] || (n === "left" && joy.x < -0.35) || (n === "right" && joy.x > 0.35) || (n === "up" && joy.y < -0.35) || (n === "down" && joy.y > 0.35);
    };
    api.pressed = function (n) { return !!hit[n]; };
    api.rawKey = function (code) { return !!raw[code]; };
    api.rawPressed = function (code) { return !!rawHit[code]; };
    api.axis = function () {
      var x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + joy.x, y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0) + joy.y;
      var len = Math.sqrt(x * x + y * y);
      return len > 1 ? { x: x / len, y: y / len } : { x: x, y: y };
    };
    api.look = look;

    /* ------------------------------------------------------- helpers */
    api.rand = function (a, b) { if (b === undefined) { b = a === undefined ? 1 : a; a = 0; } return a + Math.random() * (b - a); };
    api.randi = function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); };
    api.pick = function (list) { return list && list.length ? list[Math.floor(Math.random() * list.length)] : undefined; };
    api.chance = function (p) { return Math.random() < p; };
    api.clamp = clamp;
    api.lerp = function (a, b, t) { return a + (b - a) * t; };
    api.dist = function (a, b) { var dx = a.x - b.x, dz = a.z - b.z, dy = (a.y || 0) - (b.y || 0); return Math.sqrt(dx * dx + dy * dy + dz * dz); };
    api.dist2d = function (a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); };
    api.vec = function (x, y, z) { return new THREE.Vector3(x || 0, y || 0, z || 0); };
    api.forward = function (yaw) { return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); };
    api.yawTo = function (from, to) { return Math.atan2(-(to.x - from.x), -(to.z - from.z)); };

    /* ------------------------------------------------- world builder */
    function color(c) { return new THREE.Color(c === undefined || c === null ? colors.accent : c); }
    api.color = color;
    api.mat = function (c, opt) {
      if (c && c.isMaterial) return c;
      opt = opt || {};
      var key = String(c) + "|" + JSON.stringify(opt);
      if (!opt.map && materials[key]) return materials[key];
      var m = new THREE.MeshStandardMaterial({
        color: color(c), roughness: opt.rough === undefined ? 0.78 : opt.rough, metalness: opt.metal === undefined ? 0.04 : opt.metal,
        flatShading: !!opt.flat, transparent: opt.opacity !== undefined && opt.opacity < 1, opacity: opt.opacity === undefined ? 1 : opt.opacity
      });
      if (opt.glow) { m.emissive = color(opt.emissive || c); m.emissiveIntensity = opt.glow; }
      if (opt.map) m.map = opt.map;
      if (!opt.map) materials[key] = m;
      return m;
    };
    function geo(kind, a, b, c, d) {
      var key = kind + ":" + [a, b, c, d].join(",");
      if (geometries[key]) return geometries[key];
      var g = kind === "box" ? new THREE.BoxGeometry(1, 1, 1)
        : kind === "sphere" ? new THREE.SphereGeometry(1, a || 20, b || 14)
        : kind === "cylinder" ? new THREE.CylinderGeometry(a, b, 1, c || 18)
        : kind === "cone" ? new THREE.ConeGeometry(1, 1, a || 18)
        : new THREE.PlaneGeometry(1, 1);
      geometries[key] = g;
      return g;
    }
    function place(mesh, opt, defaultY) {
      opt = opt || {};
      mesh.position.set(opt.x || 0, opt.y === undefined ? defaultY : opt.y, opt.z || 0);
      if (opt.ry) mesh.rotation.y = opt.ry;
      if (opt.rx) mesh.rotation.x = opt.rx;
      if (opt.rz) mesh.rotation.z = opt.rz;
      mesh.castShadow = opt.shadow !== false;
      mesh.receiveShadow = true;
      if (opt.parent) opt.parent.add(mesh); else if (opt.add !== false) scene.add(mesh);
      if (opt.solid) api.solid(mesh);
      return mesh;
    }
    api.box = function (w, h, d, c, opt) {
      var mesh = new THREE.Mesh(geo("box"), api.mat(c, opt && opt.material));
      mesh.scale.set(w || 1, h || 1, d || 1);
      return place(mesh, opt, (h || 1) / 2);
    };
    api.sphere = function (r, c, opt) {
      var mesh = new THREE.Mesh(geo("sphere", opt && opt.segments), api.mat(c, opt && opt.material));
      mesh.scale.setScalar(r || 0.5);
      return place(mesh, opt, r || 0.5);
    };
    api.cylinder = function (rTop, rBottom, h, c, opt) {
      var mesh = new THREE.Mesh(geo("cylinder", 1, (rBottom || 0.5) / Math.max(0.001, rTop || 0.5), opt && opt.segments), api.mat(c, opt && opt.material));
      mesh.scale.set(rTop || 0.5, h || 1, rTop || 0.5);
      return place(mesh, opt, (h || 1) / 2);
    };
    api.cone = function (r, h, c, opt) {
      var mesh = new THREE.Mesh(geo("cone", opt && opt.segments), api.mat(c, opt && opt.material));
      mesh.scale.set(r || 0.5, h || 1, r || 0.5);
      return place(mesh, opt, (h || 1) / 2);
    };
    api.group = function (opt) { var g = new THREE.Group(); return place(g, opt, 0); };
    api.add = function (object, opt) { return place(object, opt, object.position ? object.position.y : 0); };
    api.remove = function (object) {
      if (!object) return;
      if (object.parent) object.parent.remove(object);
      blockers = blockers.filter(function (b) { return b !== object; });
      colliders = colliders.filter(function (c) { return c.object !== object; });
      targets = targets.filter(function (t) { return t.obj !== object; });
      bodies = bodies.filter(function (b) { return b.obj !== object; });
      bots = bots.filter(function (b) { return b.obj !== object; });
    };
    api.canvasTexture = function (w, h, draw, repeat) {
      if (!makeCanvas) return null;
      try {
        var canvas = makeCanvas(w, h), g = canvas.getContext("2d");
        draw(g, w, h);
        var tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat, repeat); }
        tex.anisotropy = 4;
        return tex;
      } catch (e) { return null; }
    };
    function noiseFill(g, w, h, base, spread, dots) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (var i = 0; i < dots; i++) {
        var v = Math.floor((Math.random() - 0.5) * spread);
        var c = new THREE.Color(base);
        c.offsetHSL(0, 0, v / 255);
        g.fillStyle = "#" + c.getHexString();
        g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
      }
    }
    var TEXTURES = {
      grass: function (g, w, h) { noiseFill(g, w, h, "#4f8a3a", 50, 2600); },
      sand: function (g, w, h) { noiseFill(g, w, h, "#d8c08a", 36, 2200); },
      snow: function (g, w, h) { noiseFill(g, w, h, "#e9f0f6", 20, 1600); },
      dirt: function (g, w, h) { noiseFill(g, w, h, "#7a5a3a", 46, 2400); },
      asphalt: function (g, w, h) { noiseFill(g, w, h, "#2c2f35", 30, 3000); },
      concrete: function (g, w, h) { noiseFill(g, w, h, "#8d9096", 26, 2000); g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 2; g.strokeRect(0, 0, w, h); },
      tiles: function (g, w, h) { g.fillStyle = "#cfd4dc"; g.fillRect(0, 0, w, h); g.strokeStyle = "#9aa1ac"; g.lineWidth = 3; for (var i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); } },
      grid: function (g, w, h) { g.fillStyle = colors.bg; g.fillRect(0, 0, w, h); g.strokeStyle = colors.accent2; g.globalAlpha = 0.5; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); g.globalAlpha = 1; }
    };
    api.ground = function (size, opt) {
      opt = opt || {};
      size = size || 200;
      var tex = opt.texture && TEXTURES[opt.texture] ? api.canvasTexture(128, 128, TEXTURES[opt.texture], Math.max(1, Math.round(size / (opt.tile || 6)))) : null;
      var m = tex ? api.mat("#ffffff", { map: tex, rough: 0.92 }) : api.mat(opt.color || "#3d6b35", { rough: 0.95 });
      var mesh = new THREE.Mesh(geo("plane"), m);
      mesh.scale.set(size, size, 1);
      mesh.rotation.x = -Math.PI / 2;
      mesh.receiveShadow = true;
      mesh.position.set(opt.x || 0, 0, opt.z || 0);
      scene.add(mesh);
      return mesh;
    };
    var SKIES = {
      day: { top: "#5aa9ff", bottom: "#cfe8ff", sun: "#fff4e0", sunI: 2.4, hemiTop: "#bfe1ff", hemiBottom: "#59684a", hemiI: 0.9, fog: "#cfe8ff" },
      sunset: { top: "#2b2d6e", bottom: "#ff9a5c", sun: "#ffb27a", sunI: 2.1, hemiTop: "#ffb98a", hemiBottom: "#3a2a3a", hemiI: 0.8, fog: "#e48a6a" },
      night: { top: "#03050f", bottom: "#141a3a", sun: "#9db4ff", sunI: 0.7, hemiTop: "#3a4a8a", hemiBottom: "#0a0a12", hemiI: 0.45, fog: "#0b1024" },
      overcast: { top: "#8a96a6", bottom: "#c9cfd6", sun: "#ffffff", sunI: 1.3, hemiTop: "#d0d6de", hemiBottom: "#5a5f55", hemiI: 1.0, fog: "#bfc6ce" },
      neon: { top: "#090014", bottom: "#3a0a5a", sun: "#ff4fd8", sunI: 1.4, hemiTop: "#7a3cff", hemiBottom: "#0a0018", hemiI: 0.7, fog: "#2a0a44" },
      desert: { top: "#4f9be0", bottom: "#f3d9a4", sun: "#fff0c8", sunI: 2.6, hemiTop: "#ffe6b8", hemiBottom: "#8a6a3a", hemiI: 0.9, fog: "#f0d9a8" }
    };
    api.sky = function (preset, opt) {
      opt = opt || {};
      var s = SKIES[preset] || SKIES.day;
      var tex = api.canvasTexture(4, 256, function (g, w, h) { var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, s.top); gr.addColorStop(1, s.bottom); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
      scene.background = tex || color(s.bottom);
      scene.fog = new THREE.Fog(color(s.fog), opt.fogNear || 40, opt.fogFar || 260);
      if (hemi) scene.remove(hemi);
      if (sun) { scene.remove(sun); scene.remove(sun.target); }
      hemi = new THREE.HemisphereLight(color(s.hemiTop), color(s.hemiBottom), s.hemiI);
      scene.add(hemi);
      sun = new THREE.DirectionalLight(color(s.sun), s.sunI);
      sun.position.set(opt.sunX || 60, opt.sunY || 110, opt.sunZ || 40);
      sun.castShadow = true;
      var range = opt.shadowRange || 90;
      sun.shadow.camera.left = -range; sun.shadow.camera.right = range; sun.shadow.camera.top = range; sun.shadow.camera.bottom = -range;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 400;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0004;
      scene.add(sun); scene.add(sun.target);
      return { sun: sun, hemi: hemi };
    };
    api.light = function (x, y, z, c, intensity, distance) {
      if (lights.length >= 8) { var old = lights.shift(); scene.remove(old); }
      var l = new THREE.PointLight(color(c || "#ffffff"), intensity === undefined ? 30 : intensity, distance || 18, 2);
      l.position.set(x, y, z);
      scene.add(l); lights.push(l);
      return l;
    };
    api.tree = function (x, z, opt) {
      opt = opt || {};
      var s = opt.scale || 1, g = api.group({ x: x, z: z });
      var trunk = api.cylinder(0.22 * s, 0.3 * s, 2.2 * s, opt.trunk || "#6b4a2b", { parent: g, y: 1.1 * s });
      if (opt.kind === "oak") {
        api.sphere(1.5 * s, opt.leaves || "#3f7f35", { parent: g, y: 3 * s, material: { flat: true } });
        api.sphere(1.1 * s, opt.leaves2 || "#4d9441", { parent: g, y: 3.9 * s, x: 0.5 * s, material: { flat: true } });
      } else {
        api.cone(1.6 * s, 2.6 * s, opt.leaves || "#2f6b3a", { parent: g, y: 2.8 * s, material: { flat: true } });
        api.cone(1.2 * s, 2.2 * s, opt.leaves2 || "#3a8046", { parent: g, y: 4 * s, material: { flat: true } });
      }
      colliders.push({ object: trunk, minX: x - 0.35 * s, maxX: x + 0.35 * s, minY: 0, maxY: 3 * s, minZ: z - 0.35 * s, maxZ: z + 0.35 * s });
      blockers.push(trunk);
      return g;
    };
    api.rock = function (x, z, s, c) {
      var r = api.sphere((s || 1), c || "#7d7f86", { x: x, z: z, y: (s || 1) * 0.45, material: { flat: true, rough: 1 }, segments: 7 });
      r.scale.y *= 0.7;
      api.solid(r);
      return r;
    };
    api.building = function (x, z, w, d, h, opt) {
      opt = opt || {};
      var c = opt.color || "#a7adb8";
      var windows = opt.windows === false ? null : api.canvasTexture(64, 128, function (g, cw, ch) {
        g.fillStyle = c; g.fillRect(0, 0, cw, ch);
        for (var row = 0; row < 8; row++) for (var col = 0; col < 3; col++) {
          g.fillStyle = Math.random() < 0.35 ? "#ffe9a8" : "#2a3442";
          g.fillRect(6 + col * 20, 6 + row * 15, 13, 9);
        }
      });
      if (windows) { windows.wrapS = windows.wrapT = THREE.RepeatWrapping; windows.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 12))); }
      var b = api.box(w, h, d, windows ? api.mat("#ffffff", { map: windows, rough: 0.7 }) : c, { x: x, z: z, solid: true, ry: opt.ry });
      if (opt.roof !== false) api.box(w + 0.4, 0.4, d + 0.4, opt.roofColor || "#3b3f47", { x: x, z: z, y: h + 0.2 });
      return b;
    };
    api.road = function (x1, z1, x2, z2, width, opt) {
      opt = opt || {};
      var len = Math.sqrt((x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1)), ang = Math.atan2(x2 - x1, z2 - z1);
      var road = api.box(width || 8, 0.04, len, opt.color || "#2b2e34", { x: (x1 + x2) / 2, z: (z1 + z2) / 2, y: 0.02, ry: ang, shadow: false });
      for (var t = 2; t < len - 2; t += 6) {
        var k = t / len;
        api.box(0.25, 0.05, 2.6, opt.line || "#f2d14b", { x: x1 + (x2 - x1) * k, z: z1 + (z2 - z1) * k, y: 0.045, ry: ang, shadow: false });
      }
      return road;
    };
    api.scatter = function (count, fn, opt) {
      opt = opt || {};
      var radius = opt.radius || 80, avoid = opt.avoid || [], made = 0, tries = 0;
      while (made < count && tries < count * 20) {
        tries++;
        var a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
        var x = (opt.x || 0) + Math.cos(a) * r, z = (opt.z || 0) + Math.sin(a) * r, ok = true;
        for (var i = 0; i < avoid.length; i++) if (Math.abs(x - avoid[i].x) < avoid[i].r && Math.abs(z - avoid[i].z) < avoid[i].r) ok = false;
        if (!ok) continue;
        try { fn(x, z, made); } catch (e) { fail(e, "scatter"); return; }
        made++;
      }
    };
    api.instances = function (w, h, d, c, positions, opt) {
      opt = opt || {};
      var mesh = new THREE.InstancedMesh(geo("box"), api.mat(c, opt.material), positions.length);
      var m = new THREE.Matrix4();
      for (var i = 0; i < positions.length; i++) {
        var p = positions[i];
        m.makeScale(w, h, d); m.setPosition(p.x, p.y === undefined ? h / 2 : p.y, p.z);
        mesh.setMatrixAt(i, m);
        if (opt.solid) colliders.push({ object: mesh, minX: p.x - w / 2, maxX: p.x + w / 2, minY: (p.y === undefined ? h / 2 : p.y) - h / 2, maxY: (p.y === undefined ? h / 2 : p.y) + h / 2, minZ: p.z - d / 2, maxZ: p.z + d / 2 });
      }
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
      if (opt.solid) blockers.push(mesh);
      return mesh;
    };

    /* -------------------------------------------------------- physics */
    var box3 = new THREE.Box3();
    api.solid = function (mesh) {
      mesh.updateMatrixWorld(true);
      box3.setFromObject(mesh);
      colliders.push({ object: mesh, minX: box3.min.x, maxX: box3.max.x, minY: box3.min.y, maxY: box3.max.y, minZ: box3.min.z, maxZ: box3.max.z });
      if (blockers.indexOf(mesh) < 0) blockers.push(mesh);
      return mesh;
    };
    api.gravity = 22;
    api.body = function (obj, opt) {
      opt = opt || {};
      var b = { obj: obj, pos: obj.position, vel: new THREE.Vector3(), radius: opt.radius || 0.4, height: opt.height || 1.8, gravity: opt.gravity !== false, onGround: false, step: opt.step === undefined ? 0.45 : opt.step, collide: opt.collide !== false, bounce: opt.bounce || 0 };
      bodies.push(b);
      obj.userData.body = b;
      return b;
    };
    function resolveAxis(b) {
      if (!b.collide) return;
      for (var i = 0; i < colliders.length; i++) {
        var c = colliders[i];
        if (b.pos.y >= c.maxY - b.step || b.pos.y + b.height <= c.minY) continue;
        var cx = clamp(b.pos.x, c.minX, c.maxX), cz = clamp(b.pos.z, c.minZ, c.maxZ);
        var dx = b.pos.x - cx, dz = b.pos.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= b.radius * b.radius) continue;
        if (d2 > 1e-8) {
          var d = Math.sqrt(d2), push = b.radius - d;
          b.pos.x += dx / d * push; b.pos.z += dz / d * push;
        } else {
          var left = b.pos.x - c.minX, right = c.maxX - b.pos.x, back = b.pos.z - c.minZ, front = c.maxZ - b.pos.z;
          var m = Math.min(left, right, back, front);
          if (m === left) b.pos.x = c.minX - b.radius; else if (m === right) b.pos.x = c.maxX + b.radius; else if (m === back) b.pos.z = c.minZ - b.radius; else b.pos.z = c.maxZ + b.radius;
        }
      }
    }
    function groundUnder(b) {
      var g = api.heightAt ? api.heightAt(b.pos.x, b.pos.z) : 0;
      if (!finite(g)) g = 0;
      if (!b.collide) return g;
      for (var i = 0; i < colliders.length; i++) {
        var c = colliders[i];
        if (b.pos.x + b.radius * 0.7 < c.minX || b.pos.x - b.radius * 0.7 > c.maxX || b.pos.z + b.radius * 0.7 < c.minZ || b.pos.z - b.radius * 0.7 > c.maxZ) continue;
        if (c.maxY <= b.pos.y + b.step + 0.001 && c.maxY > g) g = c.maxY;
      }
      return g;
    }
    function stepBodies(dt) {
      for (var i = 0; i < bodies.length; i++) {
        var b = bodies[i];
        if (b.dead) continue;
        if (b.gravity) b.vel.y -= api.gravity * dt;
        b.pos.x += b.vel.x * dt; resolveAxis(b);
        b.pos.z += b.vel.z * dt; resolveAxis(b);
        b.pos.y += b.vel.y * dt;
        var floor = groundUnder(b);
        b.onGround = false;
        if (b.pos.y <= floor) {
          b.pos.y = floor;
          if (b.vel.y < 0) b.vel.y = b.bounce ? -b.vel.y * b.bounce : 0;
          b.onGround = true;
        }
        if (!finite(b.pos.x) || !finite(b.pos.y) || !finite(b.pos.z)) { b.pos.set(0, 2, 0); b.vel.set(0, 0, 0); }
      }
    }
    api.collide = function (a, b, r) {
      var pa = a.position || a.pos || a, pb = b.position || b.pos || b;
      var rr = r || ((a.userData && a.userData.radius) || 0.6) + ((b.userData && b.userData.radius) || 0.6);
      return api.dist(pa, pb) < rr;
    };
    function findTarget(object) {
      for (var o = object; o; o = o.parent) if (o.userData && o.userData.target) return o.userData.target;
      return null;
    }
    api.raycast = function (origin, dir, maxDist, opt) {
      opt = opt || {};
      raycaster.set(origin, dir.clone().normalize());
      raycaster.far = maxDist || 200;
      var list = blockers.slice();
      if (opt.targets !== false) for (var i = 0; i < targets.length; i++) if (!targets[i].dead && targets[i] !== opt.ignore) list.push(targets[i].obj);
      var hits = raycaster.intersectObjects(list, true);
      for (var k = 0; k < hits.length; k++) {
        var t = findTarget(hits[k].object);
        if (t && (t === opt.ignore || t.dead)) continue;
        return { point: hits[k].point, distance: hits[k].distance, object: hits[k].object, target: t };
      }
      return null;
    };
    function lineOfSight(a, b) {
      tmpA.set(a.x, a.y, a.z); tmpB.set(b.x - a.x, b.y - a.y, b.z - a.z);
      var d = tmpB.length();
      if (d < 0.01) return true;
      raycaster.set(tmpA, tmpB.normalize());
      raycaster.far = d;
      return raycaster.intersectObjects(blockers, true).length === 0;
    }
    api.canSee = function (a, b) { return lineOfSight(a, b); };

    /* ------------------------------------------------- characters */
    api.character = function (opt) {
      opt = opt || {};
      var s = (opt.height || 1.8) / 1.8, g = new THREE.Group();
      var skin = api.mat(opt.skin || "#e9b98a"), shirt = api.mat(opt.color || colors.accent), pants = api.mat(opt.pants || "#2b2f3a"), dark = api.mat("#16181d");
      function limb(w, h, d, m, px, py) {
        var pivot = new THREE.Group(); pivot.position.set(px, py, 0);
        var mesh = new THREE.Mesh(geo("box"), m); mesh.scale.set(w, h, d); mesh.position.y = -h / 2; mesh.castShadow = true;
        pivot.add(mesh); g.add(pivot); return pivot;
      }
      var legL = limb(0.22 * s, 0.82 * s, 0.24 * s, pants, -0.13 * s, 0.82 * s);
      var legR = limb(0.22 * s, 0.82 * s, 0.24 * s, pants, 0.13 * s, 0.82 * s);
      var torso = new THREE.Mesh(geo("box"), shirt); torso.scale.set(0.58 * s, 0.64 * s, 0.32 * s); torso.position.y = 1.14 * s; torso.castShadow = true; g.add(torso);
      var armL = limb(0.17 * s, 0.62 * s, 0.2 * s, shirt, -0.38 * s, 1.43 * s);
      var armR = limb(0.17 * s, 0.62 * s, 0.2 * s, shirt, 0.38 * s, 1.43 * s);
      var head = new THREE.Mesh(geo("box"), skin); head.scale.set(0.4 * s, 0.4 * s, 0.4 * s); head.position.y = 1.68 * s; head.castShadow = true; g.add(head);
      [-0.09, 0.09].forEach(function (ex) { var eye = new THREE.Mesh(geo("box"), dark); eye.scale.set(0.07 * s, 0.07 * s, 0.02 * s); eye.position.set(ex * s, 1.71 * s, -0.205 * s); g.add(eye); });
      if (opt.hat) { var hat = new THREE.Mesh(geo("box"), api.mat(opt.hat)); hat.scale.set(0.46 * s, 0.12 * s, 0.46 * s); hat.position.y = 1.92 * s; g.add(hat); }
      if (opt.gun) { var gun = new THREE.Mesh(geo("box"), dark); gun.scale.set(0.09 * s, 0.12 * s, 0.6 * s); gun.position.set(0, -0.58 * s, -0.22 * s); armR.add(gun); }
      g.userData.limbs = { legL: legL, legR: legR, armL: armL, armR: armR, phase: Math.random() * 6, aim: !!opt.gun };
      g.userData.radius = 0.45 * s;
      if (opt.x !== undefined || opt.z !== undefined) g.position.set(opt.x || 0, opt.y || 0, opt.z || 0);
      if (opt.add !== false) scene.add(g);
      return g;
    };
    function animateCharacter(g, speed, dt, airborne) {
      var L = g.userData.limbs;
      if (!L) return;
      if (g.userData.dying !== undefined) {
        g.userData.dying = Math.min(1, g.userData.dying + dt * 2.2);
        g.rotation.x = -Math.PI / 2 * g.userData.dying;
        return;
      }
      L.phase += dt * (2 + speed * 1.9);
      var amount = Math.min(1, speed / 4) * 0.75;
      var swing = airborne ? 0.5 : Math.sin(L.phase) * amount;
      L.legL.rotation.x = swing; L.legR.rotation.x = airborne ? -0.3 : -swing;
      if (L.aim) { L.armR.rotation.x = -1.45; L.armL.rotation.x = -1.2; L.armL.rotation.z = -0.35; }
      else { L.armL.rotation.x = -swing * 0.9; L.armR.rotation.x = swing * 0.9; }
    }

    // A character the game moves itself (a runner, a dancer): walk cycle at this speed.
    api.animate = function (obj, speed, airborne) { if (obj) animateCharacter(obj, Number(speed) || 0, api.dt, !!airborne); };

    /* ----------------------------------------------- tweens & effects */
    var EASE = {
      linear: function (t) { return t; },
      outQuad: function (t) { return t * (2 - t); },
      outCubic: function (t) { var u = t - 1; return u * u * u + 1; },
      outBack: function (t) { var c = 1.70158, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; },
      inOutQuad: function (t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
    };
    api.ease = EASE;
    api.tween = function (obj, props, seconds, opt) {
      if (!obj || !props) return;
      opt = opt || {};
      if (tweens.length > 200) tweens.shift();
      tweens.push({ obj: obj, to: props, from: null, t: 0, d: Math.max(0.01, Number(seconds) || 0.3), delay: Number(opt.delay) || 0, ease: EASE[opt.ease] || EASE.outCubic, done: opt.onDone || null });
    };
    function prop(obj, key, value) {
      var p = obj.position, r = obj.rotation, s = obj.scale;
      var map = { x: [p, "x"], y: [p, "y"], z: [p, "z"], rx: [r, "x"], ry: [r, "y"], rz: [r, "z"], s: null, sx: [s, "x"], sy: [s, "y"], sz: [s, "z"] };
      if (key === "s") { if (value === undefined) return s ? s.x : 1; s.set(value, value, value); return value; }
      var slot = map[key] && map[key][0] ? map[key] : [obj, key];
      if (value === undefined) return Number(slot[0][slot[1]]) || 0;
      slot[0][slot[1]] = value; return value;
    }
    function stepTweens(dt) {
      for (var k = tweens.length - 1; k >= 0; k--) {
        var tw = tweens[k];
        if (tw.delay > 0) { tw.delay -= dt; continue; }
        if (!tw.from) { tw.from = {}; for (var p in tw.to) tw.from[p] = prop(tw.obj, p); }
        tw.t += dt;
        var e = tw.ease(Math.min(1, tw.t / tw.d));
        for (var q in tw.to) prop(tw.obj, q, tw.from[q] + (Number(tw.to[q]) - tw.from[q]) * e);
        if (tw.t >= tw.d) { tweens.splice(k, 1); if (tw.done) { try { tw.done(); } catch (err) { fail(err, "tween"); } } }
      }
    }
    api.spin = function (obj, speed) { spinners.push({ obj: obj, spin: speed === undefined ? 2 : speed, bob: 0, base: obj.position.y }); };
    api.bob = function (obj, amount, speed) { spinners.push({ obj: obj, spin: 0, bob: amount || 0.25, speed: speed || 2, base: obj.position.y }); };

    var MAX_PARTS = 900;
    var partPos = new Float32Array(MAX_PARTS * 3), partCol = new Float32Array(MAX_PARTS * 3), parts = [];
    var partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute("position", new THREE.BufferAttribute(partPos, 3));
    partGeo.setAttribute("color", new THREE.BufferAttribute(partCol, 3));
    var partMat = new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
    var partPoints = new THREE.Points(partGeo, partMat);
    partPoints.frustumCulled = false;
    scene.add(partPoints);
    api.burst = function (pos, opt) {
      opt = opt || {};
      var n = Math.min(80, opt.count || 16), cols = Array.isArray(opt.color) ? opt.color : [opt.color || colors.accent];
      for (var i = 0; i < n; i++) {
        if (parts.length >= MAX_PARTS) parts.shift();
        var a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI, sp = (opt.speed || 6) * (0.4 + Math.random() * 0.8);
        var c = color(cols[i % cols.length]);
        parts.push({ x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + (opt.up || 2), vz: Math.sin(a) * Math.cos(e) * sp, life: (opt.life || 0.7) * (0.6 + Math.random() * 0.6), r: c.r, g: c.g, b: c.b, grav: opt.gravity === undefined ? 12 : opt.gravity });
      }
    };
    function stepParticles(dt) {
      for (var k = parts.length - 1; k >= 0; k--) {
        var p = parts[k];
        p.life -= dt;
        if (p.life <= 0) { parts.splice(k, 1); continue; }
        p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      }
      for (var i = 0; i < MAX_PARTS; i++) {
        var q = parts[i];
        partPos[i * 3] = q ? q.x : 0; partPos[i * 3 + 1] = q ? q.y : -999; partPos[i * 3 + 2] = q ? q.z : 0;
        partCol[i * 3] = q ? q.r : 0; partCol[i * 3 + 1] = q ? q.g : 0; partCol[i * 3 + 2] = q ? q.b : 0;
      }
      partGeo.attributes.position.needsUpdate = true;
      partGeo.attributes.color.needsUpdate = true;
    }
    api.shake = function (power, seconds) { shake.power = Math.max(shake.power, Number(power) || 0.3); shake.t = Math.max(shake.t, Number(seconds) || 0.25); };
    api.flash = function (c, seconds) { flash.color = c || "#ffffff"; flash.t = flash.max = Number(seconds) || 0.15; };
    api.floatText = function (text, pos, c) { texts.push({ text: String(text).slice(0, 24), x: pos.x, y: (pos.y || 0) + 2, z: pos.z, life: 1, color: c || colors.fg }); if (texts.length > 30) texts.shift(); };
    api.feed = function (text) { feed.push({ text: String(text).slice(0, 60), life: 5 }); if (feed.length > 5) feed.shift(); };
    var tracerMat = new THREE.LineBasicMaterial({ color: color("#ffe9a8"), transparent: true, opacity: 0.9 });
    function tracer(from, to) {
      var g = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
      var line = new THREE.Line(g, tracerMat);
      scene.add(line);
      tracers.push({ line: line, life: 0.06 });
    }
    api.sfx = function (name, pos) {
      var volume = 1;
      if (pos) { var d = camera.position.distanceTo(tmpC.set(pos.x, pos.y || 0, pos.z)); volume = clamp(1 - d / 70, 0, 1); }
      if (volume > 0.03) emit("sfx", { name: name, volume: volume });
    };

    /* ------------------------------------------------------- combat */
    api.target = function (obj, opt) {
      opt = opt || {};
      var t = { obj: obj, hp: opt.hp || 100, maxHp: opt.hp || 100, team: opt.team || "enemy", dead: false, onHit: opt.onHit || null, onDeath: opt.onDeath || null, name: opt.name || "", remove: opt.remove !== false };
      obj.userData.target = t;
      targets.push(t);
      return t;
    };
    function hostile(a, b) { return a !== b && !b.dead && (a.team === "ffa" || b.team === "ffa" || a.team !== b.team); }
    api.damage = function (t, amount, source) {
      if (!t || t.dead || !(amount > 0)) return false;
      t.hp = Math.max(0, t.hp - amount);
      // The zone wears targets down every frame: no hit sound or flash for that.
      var quiet = source && source.zone;
      if (t.onHit && !quiet) { try { t.onHit(amount, source); } catch (e) { fail(e, "onHit"); } }
      if (quiet) { /* the HUD shows the falling health */ }
      else if (t === (playerRef && playerRef.target)) { api.flash(colors.danger, 0.18); api.shake(0.18, 0.15); api.sfx("hurt"); }
      else api.sfx("hit", t.obj.position);
      if (t.hp <= 0) {
        t.dead = true;
        if (t.obj.userData.limbs) t.obj.userData.dying = 0;
        if (t.obj.userData.body) t.obj.userData.body.dead = true;
        api.burst({ x: t.obj.position.x, y: t.obj.position.y + 1, z: t.obj.position.z }, { color: [colors.danger, "#ffffff"], count: 30, speed: 7 });
        if (source && source.owner && source.owner === (playerRef && playerRef.target)) { api.stats.kills++; }
        if (t.onDeath) { try { t.onDeath(source); } catch (e) { fail(e, "onDeath"); } }
        if (t.remove && t !== (playerRef && playerRef.target)) {
          var corpse = t.obj;
          setTimeoutLike(1.6, function () { api.remove(corpse); });
        }
        return true;
      }
      return false;
    };
    var timers = [];
    function setTimeoutLike(seconds, fn) { timers.push({ t: seconds, fn: fn }); }
    api.after = function (seconds, fn) { setTimeoutLike(Number(seconds) || 0, fn); };
    api.weapon = function (opt) {
      opt = opt || {};
      var w = { name: opt.name || "rifle", damage: opt.damage || 22, rate: opt.rate || 8, mag: opt.mag || 30, inMag: opt.mag || 30, ammo: opt.ammo === undefined ? 120 : opt.ammo, reloadTime: opt.reload || 1.5, reloading: 0, cool: 0, spread: opt.spread === undefined ? 0.015 : opt.spread, range: opt.range || 140, auto: opt.auto !== false, pellets: opt.pellets || 1, sound: opt.sound || "shoot" };
      weapons.push(w);
      return w;
    };
    api.reload = function (w) {
      if (!w || w.reloading > 0 || w.inMag >= w.mag || w.ammo <= 0) return false;
      w.reloading = w.reloadTime;
      api.sfx("reload");
      return true;
    };
    var aimDir = new THREE.Vector3();
    api.fire = function (w, origin, dir, owner) {
      if (!w || w.cool > 0 || w.reloading > 0) return null;
      if (w.inMag <= 0) { api.reload(w); return null; }
      w.inMag--; w.cool = 1 / w.rate;
      var first = null;
      for (var p = 0; p < w.pellets; p++) {
        aimDir.copy(dir).normalize();
        aimDir.x += (Math.random() - 0.5) * w.spread * 2; aimDir.y += (Math.random() - 0.5) * w.spread * 2; aimDir.z += (Math.random() - 0.5) * w.spread * 2;
        var hitInfo = api.raycast(origin, aimDir, w.range, { ignore: owner });
        var end = hitInfo ? hitInfo.point : origin.clone().add(aimDir.clone().normalize().multiplyScalar(w.range));
        tracer(origin.clone().add(aimDir.clone().normalize().multiplyScalar(0.8)), end);
        if (hitInfo) {
          api.burst(hitInfo.point, { color: hitInfo.target ? [colors.danger, "#ffcc99"] : ["#cccccc", "#888888"], count: 8, speed: 3, life: 0.4 });
          if (hitInfo.target && hostileOrAny(owner, hitInfo.target)) {
            if (owner === (playerRef && playerRef.target)) api.stats.hits++;
            api.damage(hitInfo.target, w.damage, { owner: owner, weapon: w });
          }
        }
        if (!first) first = hitInfo;
      }
      if (owner === (playerRef && playerRef.target)) { api.stats.shots++; api.shake(0.04, 0.05); }
      api.sfx(w.sound, origin);
      return first || { miss: true };
    };
    function hostileOrAny(owner, t) { return !owner || hostile(owner, t); }
    function stepWeapons(dt) {
      for (var i = 0; i < weapons.length; i++) {
        var w = weapons[i];
        if (w.cool > 0) w.cool -= dt;
        if (w.reloading > 0) {
          w.reloading -= dt;
          if (w.reloading <= 0) { var take = Math.min(w.mag - w.inMag, w.ammo); w.inMag += take; w.ammo -= take; w.reloading = 0; }
        }
      }
    }

    /* ------------------------------------------- character controller */
    api.player = function (opt) {
      opt = opt || {};
      var model = opt.model === false ? null : opt.model && opt.model.isObject3D ? opt.model : api.character({ color: opt.color || colors.accent, gun: !!opt.weapon, hat: opt.hat });
      var obj = model || api.group();
      obj.position.set(opt.x || 0, opt.y || 0, opt.z || 0);
      var body = api.body(obj, { radius: 0.4, height: opt.height || 1.8 });
      var target = api.target(obj, { hp: opt.hp || 100, team: opt.team || "player", name: "player", remove: false });
      var p = {
        obj: obj, body: body, target: target, pos: obj.position, yaw: opt.yaw || 0, pitch: 0, mode: opt.mode === "first" ? "first" : "third",
        speed: opt.speed || 6, sprint: opt.sprint || 1.6, jump: opt.jump === undefined ? 8 : opt.jump, crouch: false, weapon: opt.weapon ? api.weapon(opt.weapon === true ? {} : opt.weapon) : null,
        spawn: { x: opt.x || 0, y: opt.y || 0, z: opt.z || 0 }, sens: opt.sensitivity || 0.0024, camDist: opt.distance || 4.6, moving: false
      };
      if (model && p.mode === "first") model.visible = false;
      playerRef = p;
      api.me = p;
      api.hud.crosshair = api.hud.crosshair || !!p.weapon || p.mode === "first";
      return p;
    };
    function stepPlayer(dt) {
      var p = playerRef;
      if (!p || p.target.dead) return;
      p.yaw -= look.dx * p.sens; p.pitch = clamp(p.pitch - look.dy * p.sens, -1.35, 1.2);
      var ax = api.axis();
      p.crouch = api.key("crouch");
      var speed = p.speed * (api.key("sprint") && !p.crouch ? p.sprint : 1) * (p.crouch ? 0.5 : 1);
      var fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      var mx = fx * -ax.y + rx * ax.x, mz = fz * -ax.y + rz * ax.x;
      var accel = p.body.onGround ? 14 : 4;
      p.body.vel.x += (mx * speed - p.body.vel.x) * Math.min(1, accel * dt);
      p.body.vel.z += (mz * speed - p.body.vel.z) * Math.min(1, accel * dt);
      p.moving = Math.abs(ax.x) + Math.abs(ax.y) > 0.1;
      if (api.pressed("jump") && p.body.onGround && p.jump) { p.body.vel.y = p.jump; api.sfx("jump"); }
      if (p.obj) p.obj.rotation.y = p.yaw;
      if (p.weapon) {
        if (api.pressed("reload")) api.reload(p.weapon);
        if ((p.weapon.auto && api.key("action")) || api.pressed("action")) {
          camera.getWorldDirection(tmpB);
          api.fire(p.weapon, camera.position.clone(), tmpB.clone(), p.target);
        }
      }
    }
    function placeCamera(dt) {
      var p = playerRef;
      if (p) {
        var eye = (p.crouch ? 1.05 : 1.62) * (p.body.height / 1.8);
        if (p.mode === "first") {
          camera.position.set(p.pos.x, p.pos.y + eye, p.pos.z);
          camera.rotation.set(p.pitch, p.yaw, 0, "YXZ");
        } else {
          var fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
          var head = tmpA.set(p.pos.x + rx * 0.55, p.pos.y + eye + 0.25, p.pos.z + rz * 0.55);
          var back = p.camDist * Math.cos(p.pitch * 0.6);
          var want = tmpB.set(head.x - fx * back, head.y - Math.sin(p.pitch) * p.camDist * 0.8 + 0.4, head.z - fz * back);
          tmpC.copy(want).sub(head);
          var len = tmpC.length();
          raycaster.set(head, tmpC.normalize()); raycaster.far = len;
          var block = raycaster.intersectObjects(blockers, true)[0];
          if (block) want.copy(head).add(tmpC.multiplyScalar(Math.max(0.6, block.distance - 0.3)));
          camera.position.copy(want);
          camera.rotation.set(p.pitch * 0.85, p.yaw, 0, "YXZ");
        }
      } else if (follow) {
        var t = follow.target.position || follow.target;
        var off = follow.offset;
        tmpA.set(t.x + off.x, t.y + off.y, t.z + off.z);
        var k = 1 - Math.pow(1 - follow.lerp, dt * 60);
        camera.position.lerp(tmpA, k);
        camera.lookAt(t.x + (follow.look.x || 0), t.y + (follow.look.y || 0), t.z + (follow.look.z || 0));
      }
      if (shake.t > 0) {
        camera.position.x += (Math.random() - 0.5) * shake.power;
        camera.position.y += (Math.random() - 0.5) * shake.power;
      }
    }
    api.follow = function (target, opt) {
      opt = opt || {};
      follow = { target: target, offset: opt.offset || { x: 0, y: 5, z: 9 }, look: opt.look || { x: 0, y: 1, z: -6 }, lerp: opt.lerp === undefined ? 0.12 : opt.lerp };
    };

    /* ---------------------------------------------------- NPC brains */
    api.bot = function (opt) {
      opt = opt || {};
      var obj = opt.model && opt.model.isObject3D ? opt.model : api.character({ color: opt.color || colors.danger, gun: !!opt.weapon, hat: opt.hat, pants: opt.pants });
      obj.position.set(opt.x || 0, opt.y || 0, opt.z || 0);
      var body = api.body(obj, { radius: 0.4, height: 1.8 });
      var target = api.target(obj, { hp: opt.hp || 100, team: opt.team || "ffa", name: opt.name || "", onDeath: opt.onDeath, onHit: opt.onHit });
      var bot = {
        obj: obj, body: body, target: target, yaw: opt.yaw || Math.random() * 6.28, speed: opt.speed || 3.4, sight: opt.sight || 38, fov: opt.fov || 2.4,
        behavior: opt.behavior || "hunter", weapon: opt.weapon ? api.weapon(opt.weapon === true ? { rate: 3, damage: 9, spread: 0.06, ammo: 999 } : opt.weapon) : null,
        accuracy: opt.accuracy === undefined ? 0.6 : opt.accuracy, melee: opt.melee || 18, path: opt.path || null, pathIndex: 0,
        state: "wander", goal: null, foe: null, think: Math.random() * 0.3, lastSeen: 0, strafe: Math.random() < 0.5 ? 1 : -1, reaction: 0.35 + Math.random() * 0.35, aimTime: 0, arena: opt.arena || 70
      };
      bots.push(bot);
      return bot;
    };
    api.bots = function () { return bots.filter(function (b) { return !b.target.dead; }); };
    api.alive = function () { return targets.filter(function (t) { return !t.dead && (t === (playerRef && playerRef.target) || bots.some(function (b) { return b.target === t; })); }).length; };
    var feeler = new THREE.Vector3(), eyeA = new THREE.Vector3(), eyeB = new THREE.Vector3();
    function randomGoal(bot) {
      var cx = zone ? zone.x : 0, cz = zone ? zone.z : 0, r = zone ? zone.radius * 0.8 : bot.arena;
      var a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      return { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d };
    }
    function steer(bot, dx, dz) {
      var len = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= len; dz /= len;
      eyeA.set(bot.obj.position.x, bot.obj.position.y + 0.9, bot.obj.position.z);
      for (var attempt = 0; attempt < 3; attempt++) {
        feeler.set(dx, 0, dz);
        raycaster.set(eyeA, feeler); raycaster.far = 1.6;
        if (!raycaster.intersectObjects(blockers, true).length) break;
        var turn = (attempt + 1) * 0.9 * bot.strafe, c = Math.cos(turn), s = Math.sin(turn);
        var ndx = dx * c - dz * s, ndz = dx * s + dz * c; dx = ndx; dz = ndz;
      }
      return { x: dx, z: dz };
    }
    function stepBots(dt) {
      for (var i = 0; i < bots.length; i++) {
        var bot = bots[i], b = bot.body, pos = bot.obj.position;
        if (bot.target.dead) { b.vel.x = 0; b.vel.z = 0; animateCharacter(bot.obj, 0, dt, false); continue; }
        bot.think -= dt;
        if (bot.think <= 0) {
          bot.think = 0.25;
          var best = null, bestD = Infinity;
          for (var k = 0; k < targets.length; k++) {
            var t = targets[k];
            if (!hostile(bot.target, t)) continue;
            var d = api.dist2d(pos, t.obj.position);
            if (d > bot.sight || d >= bestD) continue;
            var ang = Math.abs(((api.yawTo(pos, t.obj.position) - bot.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            if (d > 6 && ang > bot.fov / 2 && bot.behavior !== "chaser") continue;
            eyeA.set(pos.x, pos.y + 1.5, pos.z); eyeB.set(t.obj.position.x, t.obj.position.y + 1.4, t.obj.position.z);
            if (bot.behavior !== "chaser" && !lineOfSight(eyeA, eyeB)) continue;
            best = t; bestD = d;
          }
          if (bot.behavior === "chaser" && !best && playerRef && !playerRef.target.dead) best = playerRef.target;
          if (best) { if (bot.foe !== best) bot.aimTime = 0; bot.foe = best; bot.state = "attack"; bot.lastSeen = 0; }
          else if (bot.foe) { bot.lastSeen += 0.25; if (bot.lastSeen > 3) { bot.foe = null; bot.state = bot.path ? "patrol" : "wander"; } }
          if (zone && api.dist2d(pos, zone) > zone.radius * 0.92) { bot.state = "zone"; }
          if (bot.behavior === "hunter" && bot.target.hp < bot.target.maxHp * 0.25 && bot.foe && Math.random() < 0.3) bot.state = "flee";
        }
        var mx = 0, mz = 0, speed = bot.speed;
        if (bot.state === "zone") { mx = zone.x - pos.x; mz = zone.z - pos.z; speed *= 1.3; if (api.dist2d(pos, zone) < zone.radius * 0.6) bot.state = "wander"; }
        else if (bot.state === "attack" && bot.foe && !bot.foe.dead) {
          var fp = bot.foe.obj.position, dist = api.dist2d(pos, fp);
          bot.yaw = api.yawTo(pos, fp);
          var range = bot.weapon ? 14 : 1.2;
          if (dist > range) { mx = fp.x - pos.x; mz = fp.z - pos.z; speed *= 1.25; }
          else if (bot.weapon) { mx = Math.cos(bot.yaw) * bot.strafe; mz = -Math.sin(bot.yaw) * bot.strafe; speed *= 0.6; if (Math.random() < dt * 0.4) bot.strafe *= -1; }
          bot.aimTime += dt;
          if (bot.weapon && bot.aimTime > bot.reaction) {
            eyeA.set(pos.x, pos.y + 1.5, pos.z); eyeB.set(fp.x, fp.y + 1.25, fp.z);
            if (lineOfSight(eyeA, eyeB)) {
              var w = bot.weapon, keep = w.spread;
              w.spread = keep + (1 - bot.accuracy) * 0.09 + dist * 0.0015;
              api.fire(w, eyeA.clone(), eyeB.clone().sub(eyeA), bot.target);
              w.spread = keep;
            }
          } else if (!bot.weapon && dist < 1.6) {
            bot.biteCool = (bot.biteCool || 0) - dt;
            if (bot.biteCool <= 0) { bot.biteCool = 0.8; api.damage(bot.foe, bot.melee, { owner: bot.target }); }
          }
        } else if (bot.state === "flee" && bot.foe) {
          mx = pos.x - bot.foe.obj.position.x; mz = pos.z - bot.foe.obj.position.z; speed *= 1.3;
          if (Math.random() < dt * 0.5) bot.state = "attack";
        } else if (bot.state === "patrol" && bot.path && bot.path.length) {
          var wp = bot.path[bot.pathIndex % bot.path.length];
          mx = wp.x - pos.x; mz = wp.z - pos.z;
          if (Math.abs(mx) + Math.abs(mz) < 1.2) bot.pathIndex++;
          speed *= 0.6;
        } else {
          if (!bot.goal || api.dist2d(pos, bot.goal) < 1.5) bot.goal = randomGoal(bot);
          mx = bot.goal.x - pos.x; mz = bot.goal.z - pos.z; speed *= 0.65;
        }
        if (mx || mz) {
          var dir = steer(bot, mx, mz);
          b.vel.x = dir.x * speed; b.vel.z = dir.z * speed;
          if (bot.state !== "attack") bot.yaw = Math.atan2(-dir.x, -dir.z);
        } else { b.vel.x *= 0.8; b.vel.z *= 0.8; }
        bot.obj.rotation.y = bot.yaw;
        animateCharacter(bot.obj, Math.sqrt(b.vel.x * b.vel.x + b.vel.z * b.vel.z), dt, !b.onGround);
      }
    }

    /* ---------------------------------------------------------- zone */
    api.zone = function (opt) {
      opt = opt || {};
      if (zone && zone.mesh) scene.remove(zone.mesh);
      zone = { x: opt.x || 0, z: opt.z || 0, radius: opt.radius || 80, start: opt.radius || 80, min: opt.minRadius === undefined ? 8 : opt.minRadius, wait: opt.wait === undefined ? 20 : opt.wait, shrink: opt.shrink || 60, damage: opt.damage || 6, t: 0, mesh: null };
      var m = new THREE.MeshBasicMaterial({ color: color(opt.color || "#4fa3ff"), transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
      zone.mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 80, 64, 1, true), m);
      zone.mesh.position.set(zone.x, 40, zone.z);
      zone.mesh.scale.set(zone.radius, 1, zone.radius);
      scene.add(zone.mesh);
      return zone;
    };
    api.zoneInfo = function () { return zone ? { radius: zone.radius, x: zone.x, z: zone.z, shrinking: zone.t > zone.wait && zone.radius > zone.min, next: Math.max(0, zone.wait - zone.t) } : null; };
    function stepZone(dt) {
      if (!zone) return;
      zone.t += dt;
      if (zone.t > zone.wait && zone.radius > zone.min) zone.radius = Math.max(zone.min, zone.start - (zone.t - zone.wait) * (zone.start - zone.min) / zone.shrink);
      zone.mesh.scale.set(zone.radius, 1, zone.radius);
      for (var i = 0; i < targets.length; i++) {
        var t = targets[i];
        if (t.dead) continue;
        if (api.dist2d(t.obj.position, zone) > zone.radius) api.damage(t, zone.damage * dt, { zone: true });
      }
    }

    /* ----------------------------------------------------------- flow */
    api.addScore = function (n, pos) { n = Number(n) || 0; api.score += n; emit("score", api.score); if (pos && n) api.floatText((n > 0 ? "+" : "") + n, pos, colors.accent); };
    api.setScore = function (n) { api.score = Number(n) || 0; emit("score", api.score); };
    api.setLives = function (n) { api.lives = Math.max(0, Math.floor(Number(n) || 0)); emit("lives", api.lives); };
    api.addLife = function () { api.lives++; emit("lives", api.lives); };
    api.loseLife = function () {
      if (api.state !== "playing") return api.lives;
      api.lives = Math.max(0, api.lives - 1);
      emit("lives", api.lives);
      api.sfx("hurt"); api.shake(0.4, 0.3); api.flash(colors.danger, 0.3);
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
    api.setStatus = function (text) { api.status = String(text === undefined || text === null ? "" : text).slice(0, 80); emit("status", api.status); };

    function clearWorld() {
      for (var i = scene.children.length - 1; i >= 0; i--) { var c = scene.children[i]; if (c !== partPoints) scene.remove(c); }
      colliders = []; blockers = []; targets = []; bodies = []; bots = []; weapons = []; tweens = []; spinners = []; tracers = []; texts = []; lights = []; timers = [];
      zone = null; playerRef = null; follow = null; api.me = null; sun = null; hemi = null; parts.length = 0;
      ambientLight = new THREE.AmbientLight(0xffffff, 0.25); scene.add(ambientLight);
      scene.background = color(colors.bg); scene.fog = null;
      camera.position.set(0, 6, 12); camera.rotation.set(-0.3, 0, 0, "YXZ");
      api.hud.crosshair = false; api.hud.minimap = false;
    }
    api.nextLevel = function () {
      if (api.state !== "playing") return;
      if (totalLevels && api.level >= totalLevels) { api.win(); return; }
      api.level += 1;
      clearWorld();
      emit("level", api.level);
      api.sfx("power");
      call("start", api.level);
    };

    /* ------------------------------------------------------ the loop */
    function stepPlayerDeath() {
      var p = playerRef;
      if (!p || !p.target.dead || api.state !== "playing") return;
      if (p.respawning === undefined) { p.respawning = 1.4; p.obj.visible = true; if (p.obj.userData.limbs) p.obj.userData.dying = 0; return; }
      p.respawning -= api.dt;
      if (p.respawning > 0) return;
      p.respawning = undefined;
      if (api.loseLife() > 0 && api.state === "playing") {
        p.target.dead = false; p.target.hp = p.target.maxHp; p.body.dead = false;
        p.pos.set(p.spawn.x, p.spawn.y + 0.5, p.spawn.z); p.body.vel.set(0, 0, 0);
        p.obj.rotation.x = 0; delete p.obj.userData.dying;
        if (p.mode === "first") p.obj.visible = false;
      }
    }
    core.setup = function () { if (setupDone) return; setupDone = true; clearWorld(); call("setup"); };
    core.play = function () {
      core.setup();
      api.score = 0; api.lives = startLives; api.level = 1; api.time = 0; api.frame = 0; api.status = ""; api.data = {};
      api.stats.shots = 0; api.stats.hits = 0; api.stats.kills = 0;
      keys = {}; hit = {}; raw = {}; rawHit = {}; core.error = null; feed = [];
      clearWorld();
      api.state = "playing"; started = true;
      emit("score", 0); emit("lives", api.lives); emit("level", 1); emit("status", ""); emit("state", "playing");
      call("start", 1);
    };
    core.pause = function () { if (api.state === "playing") { api.state = "paused"; emit("state", "paused"); } };
    core.resume = function () { if (api.state === "paused") { api.state = "playing"; emit("state", "playing"); } };
    core.menu = function () { api.state = "menu"; started = false; emit("state", "menu"); };
    core.step = function (dt) {
      dt = Math.min(Math.max(Number(dt) || 0, 0), 0.05);
      api.dt = dt; clock += dt;
      // Raycasts read world matrices; the page's renderer is not what keeps them current.
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      if (api.state === "playing") {
        api.time += dt; api.frame += 1;
        call("update", dt);
        if (api.state === "playing" || api.state === "over" || api.state === "won") {
          stepPlayer(dt); stepBots(dt); stepBodies(dt); stepWeapons(dt); stepZone(dt); stepPlayerDeath();
          if (playerRef && !playerRef.target.dead && playerRef.obj.userData.limbs) {
            var v = playerRef.body.vel;
            animateCharacter(playerRef.obj, Math.sqrt(v.x * v.x + v.z * v.z), dt, !playerRef.body.onGround);
          }
        }
        stepTweens(dt);
        for (var t = timers.length - 1; t >= 0; t--) { timers[t].t -= dt; if (timers[t].t <= 0) { var fn = timers[t].fn; timers.splice(t, 1); try { fn(); } catch (e) { fail(e, "after"); } } }
      }
      for (var s = 0; s < spinners.length; s++) { var sp = spinners[s]; if (sp.spin) sp.obj.rotation.y += sp.spin * dt; if (sp.bob) sp.obj.position.y = sp.base + Math.sin(clock * sp.speed) * sp.bob; }
      for (var r = tracers.length - 1; r >= 0; r--) { tracers[r].life -= dt; if (tracers[r].life <= 0) { scene.remove(tracers[r].line); tracers[r].line.geometry.dispose(); tracers.splice(r, 1); } }
      for (var x = texts.length - 1; x >= 0; x--) { texts[x].life -= dt; texts[x].y += dt * 1.2; if (texts[x].life <= 0) texts.splice(x, 1); }
      for (var f = feed.length - 1; f >= 0; f--) { feed[f].life -= dt; if (feed[f].life <= 0) feed.splice(f, 1); }
      if (shake.t > 0) { shake.t -= dt; if (shake.t <= 0) shake.power = 0; }
      if (flash.t > 0) flash.t -= dt;
      stepParticles(dt);
      if (started) placeCamera(dt);
      look.dx = 0; look.dy = 0;
      hit = {}; rawHit = {}; pointer.pressed = false; pointer.released = false;
    };
    core.view = function () {
      var p = playerRef;
      return {
        health: p ? Math.round(p.target.hp) : null, maxHealth: p ? p.target.maxHp : null,
        ammo: p && p.weapon ? { inMag: p.weapon.inMag, mag: p.weapon.mag, ammo: p.weapon.ammo, reloading: p.weapon.reloading > 0 } : null,
        alive: bots.length ? api.alive() : null, zone: api.zoneInfo(), feed: feed, texts: texts, flash: flash, crosshair: api.hud.crosshair,
        minimap: (api.hud.minimap || bots.length > 0 || !!zone) ? {
          me: p ? { x: p.pos.x, z: p.pos.z, yaw: p.yaw } : null,
          bots: bots.filter(function (b) { return !b.target.dead; }).map(function (b) { return { x: b.obj.position.x, z: b.obj.position.z }; }),
          zone: zone ? { x: zone.x, z: zone.z, r: zone.radius } : null
        } : null
      };
    };
    core.input = {
      key: function (name, down) { if (down && !keys[name]) hit[name] = true; keys[name] = !!down; },
      raw: function (code, down) { if (down && !raw[code]) rawHit[code] = true; raw[code] = !!down; },
      joystick: function (x, y) { joy.x = clamp(Number(x) || 0, -1, 1); joy.y = clamp(Number(y) || 0, -1, 1); },
      look: function (dx, dy) { look.dx += Number(dx) || 0; look.dy += Number(dy) || 0; },
      pointer: function (x, y, down) {
        pointer.x = x; pointer.y = y;
        if (down !== undefined) { if (down && !pointer.down) pointer.pressed = true; if (!down && pointer.down) pointer.released = true; pointer.down = !!down; }
      }
    };
    core.stats = function () {
      var meshes = 0;
      scene.traverse(function (o) { if (o.isMesh || o.isInstancedMesh) meshes++; });
      return { meshes: meshes, bodies: bodies.length, bots: bots.length, alive: bots.length ? api.alive() : 0, player: playerRef ? { x: playerRef.pos.x, y: playerRef.pos.y, z: playerRef.pos.z } : null, camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, shots: api.stats.shots, hits: api.stats.hits, kills: api.stats.kills };
    };
    return core;
  }
  M.createCore3D = createCore3D;

  /* ============================================================== audio */

  function createAudio(mood) {
    var AC = root.AudioContext || root.webkitAudioContext;
    var ac = null, out = null, muted = false, timer = null, step = 0, nextAt = 0;
    function unlock() {
      if (!AC) return null;
      if (!ac) { try { ac = new AC(); out = ac.createGain(); out.gain.value = muted ? 0 : 0.55; out.connect(ac.destination); } catch (e) { ac = null; return null; } }
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
      shoot: function (v) { noise(0.09, 0.32 * v, 2600); tone(180, 60, 0.08, "square", 0.08 * v); },
      laser: function (v) { tone(1400, 300, 0.16, "sawtooth", 0.06 * v); },
      hit: function (v) { noise(0.06, 0.2 * v, 3000); },
      explode: function (v) { noise(0.6, 0.4 * v, 800); tone(120, 40, 0.5, "sawtooth", 0.1 * v); },
      coin: function (v) { tone(988, 0, 0.07, "square", 0.08 * v); tone(1319, 0, 0.14, "square", 0.08 * v, 0.07); },
      pickup: function (v) { tone(660, 1320, 0.12, "triangle", 0.12 * v); },
      jump: function (v) { tone(300, 560, 0.14, "sine", 0.1 * v); },
      power: function (v) { tone(523, 0, 0.08, "square", 0.08 * v); tone(784, 0, 0.14, "square", 0.08 * v, 0.1); },
      hurt: function (v) { tone(240, 70, 0.25, "sawtooth", 0.12 * v); noise(0.1, 0.12 * v, 1200); },
      reload: function (v) { noise(0.04, 0.15 * v, 4000); noise(0.05, 0.15 * v, 3000, 0.25); },
      step: function (v) { noise(0.03, 0.06 * v, 900); },
      engine: function (v) { tone(90, 110, 0.2, "sawtooth", 0.05 * v); },
      win: function (v) { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0, 0.18, "square", 0.08 * v, i * 0.12); }); },
      lose: function (v) { [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0, 0.22, "triangle", 0.1 * v, i * 0.16); }); },
      click: function (v) { tone(700, 0, 0.04, "square", 0.05 * v); }
    };
    var SCALES = { upbeat: [0, 4, 7, 12, 7, 4, 9, 7], tense: [0, 3, 7, 6, 0, 3, 10, 7], calm: [0, 7, 12, 4, 9, 7, 5, 4], epic: [0, 7, 10, 12, 3, 7, 5, 2] };
    var ROOT = { upbeat: 220, tense: 196, calm: 262, epic: 147 }, CHORDS = { upbeat: [0, 9, 5, 7], tense: [0, 8, 5, 7], calm: [0, 5, 9, 7], epic: [0, 8, 3, 10] };
    function music(on) {
      if (timer) { clearInterval(timer); timer = null; }
      if (!on || !mood || mood === "none" || !unlock()) return;
      var notes = SCALES[mood] || SCALES.tense, base = ROOT[mood] || 196, beat = mood === "calm" ? 0.34 : 0.24, chords = CHORDS[mood] || CHORDS.tense;
      nextAt = ac.currentTime + 0.06;
      timer = setInterval(function () {
        if (muted || !ac) return;
        while (nextAt < ac.currentTime + 0.3) {
          var shift = chords[Math.floor(step / 8) % chords.length], delay = Math.max(0, nextAt - ac.currentTime);
          tone(base * Math.pow(2, (notes[step % notes.length] + shift) / 12), 0, beat * 0.9, "triangle", 0.022, delay);
          if (step % 2 === 0) tone(base / 2 * Math.pow(2, shift / 12), 0, beat * 1.6, "sine", 0.04, delay);
          if (mood !== "calm") { if (step % 4 === 0) tone(120, 45, 0.16, "sine", 0.1, delay); if (step % 4 === 2) noise(0.08, 0.05, 3200, delay); }
          step++; nextAt += beat;
        }
      }, 100);
    }
    return {
      unlock: unlock,
      play: function (e) { if (muted || !unlock()) return; try { (SFX[e.name] || SFX.click)(e.volume === undefined ? 1 : e.volume); } catch (x) { /* sound is optional */ } },
      music: music,
      toggle: function () { muted = !muted; if (out) out.gain.value = muted ? 0 : 0.55; if (muted) music(false); return muted; },
      isMuted: function () { return muted; }
    };
  }

  /* =============================================================== page */

  M.boot = function () {
    if (!doc) return;
    var plan = M.plan || {};
    var L = TEXT[plan.locale] || TEXT.en;
    var stage = doc.getElementById("stage"), host = doc.getElementById("view"), ui = doc.getElementById("ui"), hud = doc.getElementById("hud");
    function post(message) { try { if (root.parent && root.parent !== root) root.parent.postMessage(message, "*"); } catch (e) { /* preview only */ } }
    function esc(v) { return String(v === undefined || v === null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }
    function showError(error) {
      ui.hidden = false;
      ui.innerHTML = '<div class="panel over"><h2>' + esc(L.error) + '</h2><p class="error">' + esc(error && error.message) + '</p><div class="row"><button class="primary" data-act="restart">' + esc(L.reload) + '</button></div></div>';
      post({ type: "malik-game-error", message: String(error && error.message || ""), where: error && error.where });
    }
    if (!root.THREE) { showError({ message: L.noThree, where: "load" }); return; }
    var game = M.definition;
    if (!game) { showError({ message: L.noGame, where: "load" }); return; }
    var THREE = root.THREE;
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch (e) { showError({ message: L.noGl, where: "webgl" }); return; }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    var canvas = renderer.domElement;
    canvas.tabIndex = 0;
    var store = { get: function (k) { try { return root.localStorage.getItem("malik3d:" + plan.title + ":" + k); } catch (e) { return null; } }, set: function (k, v) { try { root.localStorage.setItem("malik3d:" + plan.title + ":" + k, String(v)); } catch (e) { /* storage is optional */ } } };
    var audio = createAudio((plan.theme && plan.theme.mood) || "tense");
    var QUALITY = { low: { ratio: 1, shadows: false }, medium: { ratio: 1.25, shadows: true, map: 1024 }, high: { ratio: 1.75, shadows: true, map: 2048 } };
    var quality = store.get("quality") || "high", autoQuality = !store.get("quality");
    function applyQuality() {
      var q = QUALITY[quality] || QUALITY.high;
      renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, q.ratio));
      renderer.shadowMap.enabled = q.shadows;
      core.scene.traverse(function (o) { if (o.isDirectionalLight && o.shadow) { o.castShadow = q.shadows; if (q.map) o.shadow.mapSize.set(q.map, q.map); if (o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; } } });
      resize();
    }
    var core = M.core = M.createCore3D({
      THREE: THREE, plan: plan, game: game, best: Number(store.get("best") || 0) || 0,
      makeCanvas: function (w, h) { var c = doc.createElement("canvas"); c.width = w; c.height = h; return c; },
      events: {
        sfx: function (e) { audio.play(e); },
        end: function (r) { if (r.record) store.set("best", r.best); audio.music(false); endScreen(r); },
        level: function (v) { if (v > 1) banner(L.level + " " + v); },
        error: function (e) { audio.music(false); showError(e); }
      }
    });
    var api = core.api;
    function resize() {
      var w = stage.clientWidth || root.innerWidth, h = stage.clientHeight || root.innerHeight;
      renderer.setSize(w, h, false);
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      core.camera.aspect = w / Math.max(1, h); core.camera.updateProjectionMatrix();
    }
    root.addEventListener("resize", resize);

    /* -- input: keyboard, mouse look (pointer lock or drag), touch */
    var KEYMAP = { KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", Space: "jump", ShiftLeft: "sprint", ShiftRight: "sprint", KeyC: "crouch", ControlLeft: "crouch", KeyR: "reload", KeyE: "interact", KeyF: "action", Enter: "action", KeyQ: "action2" };
    root.addEventListener("keydown", function (e) {
      if (e.code === "Escape" || e.code === "KeyP") { if (api.state === "playing") pause(); else if (api.state === "paused") resume(); return; }
      if (e.code === "KeyM") { mute(); return; }
      var name = KEYMAP[e.code];
      if (name) { core.input.key(name, true); e.preventDefault(); }
      core.input.raw(e.code, true);
    });
    root.addEventListener("keyup", function (e) { var name = KEYMAP[e.code]; if (name) core.input.key(name, false); core.input.raw(e.code, false); });
    var locked = false, dragging = false, lastX = 0, lastY = 0;
    doc.addEventListener("pointerlockchange", function () { locked = doc.pointerLockElement === canvas; });
    canvas.addEventListener("mousedown", function (e) {
      audio.unlock();
      if (api.state !== "playing") return;
      if (!locked && canvas.requestPointerLock) { try { var r = canvas.requestPointerLock(); if (r && r.catch) r.catch(function () {}); } catch (x) { /* sandboxed preview: drag to look */ } }
      if (e.button === 0) core.input.key("action", true);
      if (e.button === 2) core.input.key("action2", true);
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    root.addEventListener("mouseup", function (e) { if (e.button === 0) core.input.key("action", false); if (e.button === 2) core.input.key("action2", false); dragging = false; });
    root.addEventListener("mousemove", function (e) {
      if (locked) core.input.look(e.movementX || 0, e.movementY || 0);
      else if (dragging) { core.input.look((e.clientX - lastX) * 1.6, (e.clientY - lastY) * 1.6); lastX = e.clientX; lastY = e.clientY; }
      var rect = canvas.getBoundingClientRect();
      core.input.pointer((e.clientX - rect.left) / Math.max(1, rect.width), (e.clientY - rect.top) / Math.max(1, rect.height));
    });
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    var touch = doc.getElementById("touch"), coarse = root.matchMedia && root.matchMedia("(pointer: coarse)").matches;
    if (coarse && touch) {
      touch.hidden = false;
      touch.innerHTML = '<div class="stick" id="stick"><div class="knob" id="knob"></div></div><div class="look" id="lookpad"></div><div class="buttons"><button class="tbtn" data-key="jump">⤒</button><button class="tbtn" data-key="action">●</button></div>';
      var stick = doc.getElementById("stick"), knob = doc.getElementById("knob"), lookpad = doc.getElementById("lookpad"), sid = null, lid = null, lx = 0, ly = 0;
      stick.addEventListener("pointerdown", function (e) { sid = e.pointerId; stick.setPointerCapture(sid); audio.unlock(); });
      stick.addEventListener("pointermove", function (e) {
        if (e.pointerId !== sid) return;
        var r = stick.getBoundingClientRect(), x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
        var len = Math.sqrt(x * x + y * y); if (len > 1) { x /= len; y /= len; }
        core.input.joystick(x, y); knob.style.transform = "translate(" + x * 36 + "px," + y * 36 + "px)";
      });
      var release = function () { sid = null; core.input.joystick(0, 0); knob.style.transform = ""; };
      stick.addEventListener("pointerup", release); stick.addEventListener("pointercancel", release);
      lookpad.addEventListener("pointerdown", function (e) { lid = e.pointerId; lookpad.setPointerCapture(lid); lx = e.clientX; ly = e.clientY; });
      lookpad.addEventListener("pointermove", function (e) { if (e.pointerId !== lid) return; core.input.look((e.clientX - lx) * 2.2, (e.clientY - ly) * 2.2); lx = e.clientX; ly = e.clientY; });
      lookpad.addEventListener("pointerup", function () { lid = null; });
      Array.prototype.forEach.call(touch.querySelectorAll(".tbtn"), function (b) {
        var k = b.getAttribute("data-key");
        b.addEventListener("pointerdown", function (e) { e.preventDefault(); core.input.key(k, true); b.classList.add("on"); });
        var up = function () { core.input.key(k, false); b.classList.remove("on"); };
        b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("pointerleave", up);
      });
    }

    /* -- HUD */
    hud.innerHTML = '<div class="hud-left"><span class="pill score"><b id="hud-score">0</b><small>' + esc(L.score) + '</small></span><span class="pill soft">' + esc(L.best) + ' <b id="hud-best">' + esc(api.best) + '</b></span><span class="pill soft" id="hud-status" hidden></span></div>' +
      '<div class="hud-right"><span class="pill" id="hud-alive" hidden></span><span class="pill" id="hud-zone" hidden></span><button class="icon" data-act="mute" id="hud-mute" aria-label="sound">🔊</button><button class="icon" data-act="pause" aria-label="' + esc(L.paused) + '">❚❚</button></div>' +
      '<div class="vitals"><div class="bar" id="hud-health" hidden><i></i><span></span></div><div class="pill ammo" id="hud-ammo" hidden></div><div class="pill" id="hud-lives"></div></div>' +
      '<ul class="feed" id="hud-feed"></ul><canvas class="minimap" id="hud-map" width="150" height="150" hidden></canvas><div class="crosshair" id="hud-cross" hidden></div><div class="flash" id="hud-flash"></div><div class="floats" id="hud-floats"></div>';
    var el = function (id) { return doc.getElementById(id); };
    var mapCtx = el("hud-map").getContext("2d");
    function setText(id, v) { var n = el(id); if (n && n.textContent !== String(v)) n.textContent = String(v); }
    var hudTick = 0, projected = new THREE.Vector3();
    function updateHud(dt) {
      hudTick += dt;
      var view = core.view();
      setText("hud-score", api.score);
      setText("hud-lives", api.lives > 9 ? "❤ × " + api.lives : new Array(api.lives + 1).join("❤"));
      var status = el("hud-status"); status.hidden = !api.status; if (api.status) setText("hud-status", api.status);
      var health = el("hud-health"); health.hidden = view.health === null;
      if (view.health !== null) { health.firstChild.style.width = Math.max(0, view.health / view.maxHealth * 100) + "%"; health.lastChild.textContent = L.health + " " + view.health; health.classList.toggle("low", view.health < view.maxHealth * 0.3); }
      var ammo = el("hud-ammo"); ammo.hidden = !view.ammo;
      if (view.ammo) ammo.textContent = view.ammo.reloading ? L.reloading + "…" : view.ammo.inMag + " / " + view.ammo.ammo;
      var alive = el("hud-alive"); alive.hidden = view.alive === null; if (view.alive !== null) alive.textContent = L.alive + ": " + view.alive;
      var zoneEl = el("hud-zone"); zoneEl.hidden = !view.zone; if (view.zone) zoneEl.textContent = L.zone + ": " + (view.zone.next > 0 ? Math.ceil(view.zone.next) + "s" : Math.round(view.zone.radius) + "m");
      el("hud-cross").hidden = !view.crosshair || api.state !== "playing";
      var flashEl = el("hud-flash"); flashEl.style.background = view.flash.color; flashEl.style.opacity = view.flash.t > 0 ? String(Math.max(0, view.flash.t / view.flash.max) * 0.45) : "0";
      if (hudTick > 0.1) {
        hudTick = 0;
        el("hud-feed").innerHTML = view.feed.map(function (f) { return "<li>" + esc(f.text) + "</li>"; }).join("");
        var map = el("hud-map");
        map.hidden = !view.minimap;
        if (view.minimap && view.minimap.me) {
          var m = view.minimap, S = 150, scale = S / 2 / 90;
          mapCtx.clearRect(0, 0, S, S);
          mapCtx.fillStyle = "rgba(0,0,0,0.45)"; mapCtx.beginPath(); mapCtx.arc(S / 2, S / 2, S / 2, 0, 6.283); mapCtx.fill();
          var cx = function (x) { return S / 2 + (x - m.me.x) * scale; }, cz = function (z) { return S / 2 + (z - m.me.z) * scale; };
          if (m.zone) { mapCtx.strokeStyle = "#4fa3ff"; mapCtx.lineWidth = 2; mapCtx.beginPath(); mapCtx.arc(cx(m.zone.x), cz(m.zone.z), m.zone.r * scale, 0, 6.283); mapCtx.stroke(); }
          mapCtx.fillStyle = core.colors.danger;
          m.bots.forEach(function (b) { mapCtx.fillRect(cx(b.x) - 2, cz(b.z) - 2, 4, 4); });
          mapCtx.save(); mapCtx.translate(S / 2, S / 2); mapCtx.rotate(-m.me.yaw); mapCtx.fillStyle = core.colors.accent; mapCtx.beginPath(); mapCtx.moveTo(0, -7); mapCtx.lineTo(5, 6); mapCtx.lineTo(-5, 6); mapCtx.closePath(); mapCtx.fill(); mapCtx.restore();
        }
      }
      var floats = el("hud-floats"), html = "";
      for (var i = 0; i < view.texts.length; i++) {
        var t = view.texts[i];
        projected.set(t.x, t.y, t.z).project(core.camera);
        if (projected.z > 1) continue;
        html += '<b style="left:' + ((projected.x + 1) / 2 * 100).toFixed(2) + '%;top:' + ((1 - projected.y) / 2 * 100).toFixed(2) + '%;color:' + esc(t.color) + ';opacity:' + Math.max(0, t.life).toFixed(2) + '">' + esc(t.text) + "</b>";
      }
      floats.innerHTML = html;
    }

    /* -- screens */
    function controlsHtml() {
      var list = (plan.controls || []).map(function (c) { return "<li><kbd>" + esc(c.keys) + "</kbd>" + esc(c.action) + "</li>"; }).join("");
      return list ? '<div class="controls"><p>' + esc(L.controls) + "</p><ul>" + list + "</ul></div>" : "";
    }
    function menuScreen() {
      ui.hidden = false; hud.hidden = true;
      ui.innerHTML = '<div class="panel"><p class="eyebrow">' + esc(plan.genre || "3D") + '</p><h1>' + esc(plan.title) + '</h1><p class="tagline">' + esc(plan.tagline) + '</p><button class="primary" data-act="play">▶ ' + esc(L.play) + "</button>" + controlsHtml() + (plan.goal ? '<p class="goal">' + esc(plan.goal) + "</p>" : "") + (api.best ? '<p class="best">' + esc(L.best) + " <b>" + esc(api.best) + "</b></p>" : "") + '<p class="hint">' + esc(L.clickToLook) + "</p></div>";
    }
    function qualityRow() {
      return '<div class="row"><span class="hint">' + esc(L.quality) + ":</span>" + ["low", "medium", "high"].map(function (q) { return '<button data-quality="' + q + '"' + (q === quality ? ' class="on"' : "") + ">" + esc(L[q]) + "</button>"; }).join("") + "</div>";
    }
    function pause() { core.pause(); audio.music(false); if (doc.exitPointerLock && locked) doc.exitPointerLock(); ui.hidden = false; ui.innerHTML = '<div class="panel"><h2>' + esc(L.paused) + '</h2><button class="primary" data-act="resume">▶ ' + esc(L.resume) + '</button><div class="row"><button data-act="restart">↻ ' + esc(L.restart) + '</button><button data-act="menu">' + esc(L.menu) + "</button></div>" + qualityRow() + controlsHtml() + "</div>"; }
    function resume() { ui.hidden = true; core.resume(); if (!audio.isMuted()) audio.music(true); canvas.focus(); }
    function endScreen(r) {
      if (doc.exitPointerLock && locked) doc.exitPointerLock();
      ui.hidden = false;
      ui.innerHTML = '<div class="panel ' + (r.won ? "won" : "over") + '"><h2>' + esc(r.won ? L.won : L.over) + "</h2>" + (r.message ? '<p class="tagline">' + esc(r.message) + "</p>" : "") + '<p class="final">' + esc(L.score) + "<b>" + esc(r.score) + "</b></p>" + (r.record ? '<p class="best"><b>' + esc(L.newBest) + "</b></p>" : "") + '<button class="primary" data-act="restart">↻ ' + esc(L.restart) + '</button><div class="row"><button data-act="menu">' + esc(L.menu) + "</button></div></div>";
      setText("hud-best", r.best);
    }
    function start() { ui.hidden = true; hud.hidden = false; core.play(); if (!audio.isMuted()) audio.music(true); applyQuality(); canvas.focus(); }
    function mute() { var m = audio.toggle(); setText("hud-mute", m ? "🔇" : "🔊"); if (!m && api.state === "playing") audio.music(true); }
    function banner(text) { var b = doc.createElement("div"); b.className = "banner"; b.textContent = text; stage.appendChild(b); setTimeout(function () { b.remove(); }, 1700); }
    doc.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("[data-act],[data-quality]") : null;
      if (!t) return;
      audio.unlock();
      var q = t.getAttribute("data-quality");
      if (q) { quality = q; autoQuality = false; store.set("quality", q); applyQuality(); pause(); return; }
      var act = t.getAttribute("data-act");
      if (act === "play" || act === "restart") start();
      else if (act === "resume") resume();
      else if (act === "pause") pause();
      else if (act === "menu") { core.menu(); audio.music(false); menuScreen(); }
      else if (act === "mute") mute();
    });
    doc.addEventListener("visibilitychange", function () { if (doc.hidden && api.state === "playing") pause(); });

    /* -- the loop: fixed steps, render, adaptive quality */
    var STEP = 1 / 60, acc = 0, last = 0, frames = 0, slow = 0, bootSent = false, readySent = false;
    M.qa = function () { var s = core.stats(); s.state = api.state; s.score = api.score; s.frames = frames; s.drawCalls = renderer.info.render.calls; s.triangles = renderer.info.render.triangles; s.quality = quality; return s; };
    function frame(now) {
      var dt = last ? (now - last) / 1000 : 0; last = now;
      if (dt > 0.25) dt = 0.25;
      acc += dt;
      var steps = 0;
      while (acc >= STEP && steps < 5) { core.step(STEP); acc -= STEP; steps++; }
      if (steps >= 5) acc = 0;
      renderer.render(core.scene, core.camera);
      updateHud(dt);
      frames++;
      if (autoQuality && api.state === "playing" && dt > 0) {
        slow = dt > 0.026 ? slow + 1 : Math.max(0, slow - 1);
        if (slow > 120 && quality !== "low") { quality = quality === "high" ? "medium" : "low"; slow = 0; applyQuality(); }
      }
      if (!bootSent && frames > 10 && !core.error) { bootSent = true; post({ type: "malik-game-booted", frames: frames }); }
      if (!readySent && frames > 30 && api.state === "playing" && !core.error) { readySent = true; post({ type: "malik-game-ready", frames: frames, playFrames: api.frame }); }
      root.requestAnimationFrame(frame);
    }
    core.setup();
    resize();
    menuScreen();
    root.requestAnimationFrame(frame);
  };
})(typeof window !== "undefined" ? window : this);
`
