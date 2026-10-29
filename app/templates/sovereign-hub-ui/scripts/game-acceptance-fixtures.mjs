// The three acceptance games the studio pipeline must carry end to end:
// A — 3D battle royale, B — 3D endless runner, C — 2D platformer.
// Written against the runtimes' public API only, as a model would write them.

export const PROMPT_A = "Создай 3D Battle Royale как PUBG: персонаж, карта, стрельба, боты, здоровье, зона, победа"
export const PROMPT_B = "Создай 3D бесконечный раннер как Subway Surfers: три дорожки, прыжки, препятствия, монеты, счёт"
export const PROMPT_C = "Создай 2D платформер: управление, физика, платформы, враги, монеты и финиш"

export const BATTLE_ROYALE = String.raw`
const S = { pickups: [], kills: 0 };
const BLOCKS = [[-34, -30], [32, -34], [-30, 34], [36, 30], [-66, 8], [64, -6], [8, 66], [-8, -68]];
const COLORS = ["#b8b2a7", "#a9b4c2", "#c7b9a5", "#9fa8a3"];

function spawnPickup(api, kind) {
  const x = api.rand(-95, 95), z = api.rand(-95, 95);
  const mesh = api.box(0.9, 0.9, 0.9, kind === "ammo" ? "#d4a017" : "#2ecc71", { x: x, z: z, y: 0.7, material: { glow: 0.5 } });
  api.spin(mesh, 1.6);
  S.pickups.push({ mesh: mesh, kind: kind });
}

MalikGame.define({
  start(api, level) {
    S.pickups = []; S.kills = 0;
    api.sky("day", { fogFar: 340, shadowRange: 130 });
    api.ground(340, { texture: "grass" });
    api.road(-150, 0, 150, 0, 10);
    api.road(0, -150, 0, 150, 10);
    BLOCKS.forEach(function (b, i) { api.building(b[0], b[1], 12 + (i % 3) * 3, 12, 10 + (i % 4) * 4, { color: COLORS[i % 4] }); });
    const avoid = [{ x: 0, z: 0, r: 22 }].concat(BLOCKS.map(function (b) { return { x: b[0], z: b[1], r: 13 }; }));
    api.scatter(46, function (x, z) { api.tree(x, z, { kind: api.chance(0.5) ? "pine" : "oak", scale: 0.8 + api.rand(0, 0.6) }); }, { radius: 145, avoid: avoid });
    api.scatter(22, function (x, z) { api.rock(x, z, 0.7 + api.rand(0, 1.2)); }, { radius: 145, avoid: avoid });
    api.zone({ radius: 135, minRadius: 12, wait: 20, shrink: 120, damage: 8 });
    const me = api.player({ mode: "third", x: 0, z: 8, hp: 100, weapon: { name: "AR", damage: 28, rate: 9, mag: 30, ammo: 180 } });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r = 45 + (i % 3) * 25, name = "Бот-" + (i + 1);
      api.bot({
        x: Math.cos(a) * r, z: Math.sin(a) * r, name: name, team: "ffa", behavior: "hunter",
        weapon: { damage: 7, rate: 3, spread: 0.05, ammo: 999 }, accuracy: 0.3 + (i % 4) * 0.1,
        color: ["#e74c3c", "#9b59b6", "#e67e22", "#16a085"][i % 4],
        onDeath: function (src) {
          if (src && src.owner === me.target) { S.kills++; api.addScore(100, me.pos); api.feed("Вы устранили: " + name); api.shake(0.2, 0.2); }
          else api.feed(name + " выбыл");
        },
      });
    }
    for (let i = 0; i < 12; i++) spawnPickup(api, i % 2 ? "ammo" : "med");
    api.hud.minimap = true;
  },
  update(dt, api) {
    const me = api.me;
    for (const p of S.pickups) {
      if (!p.mesh.parent || me.target.dead) continue;
      if (api.dist2d(p.mesh.position, me.pos) < 1.6) {
        if (p.kind === "ammo") me.weapon.ammo += 60;
        else me.target.hp = Math.min(me.target.maxHp, me.target.hp + 40);
        api.sfx("pickup"); api.burst(p.mesh.position, { color: "#ffffff", count: 14 });
        api.floatText(p.kind === "ammo" ? "+60" : "+40 HP", p.mesh.position, api.colors.good);
        api.remove(p.mesh);
      }
    }
    S.pickups = S.pickups.filter(function (p) { return p.mesh.parent; });
    const zone = api.zoneInfo();
    api.setStatus(zone.next > 0 ? "Зона через " + Math.ceil(zone.next) + " с" : "Зона: " + Math.round(zone.radius) + " м · убийств " + S.kills);
    if (!me.target.dead && api.alive() === 1) api.win("Вы — последний выживший! Убийств: " + S.kills);
  },
});
`.trim()

export const RUNNER_3D = String.raw`
const LANES = [-3, 0, 3];
const S = { lane: 1, speed: 14, dist: 0, coins: 0, slide: 0, shield: 0, spawnZ: -30, hero: null, body: null, track: [], things: [] };

function segment(api, z) {
  const g = api.group({ z: z });
  api.box(10, 0.2, 30, "#3b3f4a", { parent: g, y: -0.1, shadow: false });
  for (let i = 0; i < 2; i++) api.box(0.3, 0.25, 30, "#c9a24a", { parent: g, x: i ? 1.5 : -1.5, y: 0.05 });
  api.box(1.2, 4 + (z % 3), 4, "#7b8794", { parent: g, x: -7, y: 2 });
  api.box(1.2, 5, 4, "#8e9aaf", { parent: g, x: 7, y: 2.5, z: 10 });
  return g;
}

function spawnRow(api, z) {
  const lane = api.randi(0, 2), kind = api.pick(["barrier", "gate", "train"]);
  const x = LANES[lane];
  let mesh;
  if (kind === "barrier") mesh = api.box(2.4, 1, 0.6, "#e74c3c", { x: x, z: z });
  else if (kind === "gate") mesh = api.box(2.6, 0.5, 0.6, "#f39c12", { x: x, z: z, y: 1.9 });
  else mesh = api.box(2.6, 3, 10, "#2e86de", { x: x, z: z - 4 });
  S.things.push({ kind: kind, mesh: mesh, lane: lane, len: kind === "train" ? 10 : 0.6 });
  for (let other = 0; other < 3; other++) {
    if (other === lane) continue;
    for (let k = 0; k < 4; k++) {
      const coin = api.cylinder(0.4, 0.4, 0.1, "#ffd23f", { x: LANES[other], z: z - k * 2, y: 1, rx: Math.PI / 2, material: { glow: 0.6, metal: 0.6 } });
      api.spin(coin, 4);
      S.things.push({ kind: "coin", mesh: coin, lane: other, len: 0.8 });
    }
  }
  if (api.chance(0.12)) {
    const orb = api.sphere(0.5, "#3bceac", { x: LANES[(lane + 1) % 3], z: z - 10, y: 1.2, material: { glow: 0.8 } });
    api.bob(orb, 0.3, 3);
    S.things.push({ kind: "shield", mesh: orb, lane: (lane + 1) % 3, len: 0.8 });
  }
}

MalikGame.define({
  start(api) {
    api.sky("sunset", { fogNear: 40, fogFar: 160 });
    S.lane = 1; S.speed = 14; S.dist = 0; S.coins = 0; S.slide = 0; S.shield = 0; S.spawnZ = -30; S.things = []; S.track = [];
    S.hero = api.character({ color: api.colors.accent, hat: "#222831" });
    S.body = api.body(S.hero, { radius: 0.4, height: 1.8, collide: false });
    for (let i = 0; i < 8; i++) S.track.push(segment(api, -i * 30 + 15));
    api.follow(S.hero, { offset: { x: 0, y: 4.2, z: 7.5 }, look: { x: 0, y: 1.2, z: -8 }, lerp: 0.18 });
  },
  update(dt, api) {
    const hero = S.hero;
    S.speed = Math.min(34, 14 + api.time * 0.35);
    if (api.pressed("left") && S.lane > 0) { S.lane--; api.sfx("click"); }
    if (api.pressed("right") && S.lane < 2) { S.lane++; api.sfx("click"); }
    if ((api.pressed("up") || api.pressed("jump") || api.pressed("action")) && S.body.onGround) { S.body.vel.y = 9; api.sfx("jump"); }
    if (api.pressed("down") || api.pressed("action2")) S.slide = 0.7;
    S.slide = Math.max(0, S.slide - dt);
    S.shield = Math.max(0, S.shield - dt);
    hero.position.x += (LANES[S.lane] - hero.position.x) * Math.min(1, dt * 12);
    hero.position.z -= S.speed * dt;
    hero.scale.y = S.slide > 0 ? 0.55 : 1;
    api.animate(hero, S.speed / 3, !S.body.onGround);
    S.dist += S.speed * dt;
    for (const seg of S.track) if (seg.position.z - hero.position.z > 30) seg.position.z -= 240;
    while (S.spawnZ > hero.position.z - 110) { spawnRow(api, S.spawnZ); S.spawnZ -= 18 + api.rand(0, 10); }
    for (const t of S.things) {
      if (!t.mesh.parent) continue;
      const dz = Math.abs(t.mesh.position.z - hero.position.z), dx = Math.abs(LANES[t.lane] - hero.position.x);
      if (t.mesh.position.z - hero.position.z > 12) { api.remove(t.mesh); continue; }
      if (dx > 1.1 || dz > t.len / 2 + 0.6) continue;
      if (t.kind === "coin") { S.coins++; api.sfx("coin"); api.burst(t.mesh.position, { color: "#ffd23f", count: 6, speed: 3 }); api.remove(t.mesh); continue; }
      if (t.kind === "shield") { S.shield = 8; api.sfx("power"); api.flash(api.colors.accent2, 0.2); api.remove(t.mesh); continue; }
      const blocked = t.kind === "train" || (t.kind === "barrier" && hero.position.y < 0.9) || (t.kind === "gate" && S.slide <= 0);
      if (!blocked) continue;
      api.remove(t.mesh);
      if (S.shield > 0) { S.shield = 0; api.shake(0.3, 0.2); api.sfx("hit"); continue; }
      api.shake(0.6, 0.4); api.burst(hero.position, { color: [api.colors.danger, "#ffffff"], count: 30 });
      api.loseLife();
    }
    S.things = S.things.filter(function (t) { return t.mesh.parent; });
    api.setScore(Math.floor(S.dist) + S.coins * 10);
    api.setStatus("Дистанция " + Math.floor(S.dist) + " м · монет " + S.coins + (S.shield > 0 ? " · щит" : ""));
  },
});
`.trim()

export const PLATFORMER_2D = String.raw`
const S = { p: null, plats: [], coins: [], enemies: [], flag: null };
const WORLD = 3000;

function collide(p, axis) {
  for (const b of S.plats) {
    if (p.x + p.w <= b.x || p.x >= b.x + b.w || p.y + p.h <= b.y || p.y >= b.y + b.h) continue;
    if (axis === "x") { if (p.vx > 0) p.x = b.x - p.w; else if (p.vx < 0) p.x = b.x + b.w; p.vx = 0; }
    else { if (p.vy > 0) { p.y = b.y - p.h; p.on = true; } else if (p.vy < 0) p.y = b.y + b.h; p.vy = 0; }
  }
}

MalikGame.define({
  start(api, level) {
    S.p = { x: 60, y: 380, w: 28, h: 38, vx: 0, vy: 0, on: false, inv: 0, face: 1 };
    S.plats = [{ x: 0, y: 480, w: WORLD, h: 60 }];
    for (let i = 0; i < 14; i++) S.plats.push({ x: 260 + i * 190, y: 400 - (i % 4) * 55, w: 120, h: 18 });
    S.coins = [];
    for (let i = 0; i < 14; i++) S.coins.push({ x: 320 + i * 190, y: 365 - (i % 4) * 55, r: 9, got: false });
    S.enemies = [];
    for (let i = 0; i < 3 + level; i++) S.enemies.push({ x: 520 + i * 560, y: 450, w: 30, h: 30, vx: 70 + level * 15, min: 440 + i * 560, max: 700 + i * 560, alive: true });
    S.flag = { x: 2860, y: 380, w: 16, h: 100 };
    api.setStatus("Монеты: 0/" + S.coins.length);
  },
  update(dt, api) {
    const p = S.p, ax = api.axis();
    p.vx = api.approach(p.vx, ax.x * 260, 1800 * dt);
    if (ax.x) p.face = ax.x > 0 ? 1 : -1;
    if ((api.pressed("up") || api.pressed("action")) && p.on) { p.vy = -640; p.on = false; api.sfx("jump"); }
    p.vy = Math.min(900, p.vy + 1500 * dt);
    p.x = api.clamp(p.x + p.vx * dt, 0, WORLD - p.w); collide(p, "x");
    p.on = false; p.y += p.vy * dt; collide(p, "y");
    p.inv = Math.max(0, p.inv - dt);
    for (const c of S.coins) {
      if (c.got || !api.overlap(p, { x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 })) continue;
      c.got = true; api.addScore(10, c.x, c.y); api.sfx("coin"); api.particles(c.x, c.y, { count: 10, color: api.colors.accent });
      api.setStatus("Монеты: " + S.coins.filter(function (k) { return k.got; }).length + "/" + S.coins.length);
    }
    for (const e of S.enemies) {
      if (!e.alive) continue;
      e.x += e.vx * dt;
      if (e.x < e.min || e.x > e.max) e.vx = -e.vx;
      if (!api.overlap(p, e)) continue;
      if (p.vy > 0 && p.y + p.h - e.y < 18) { e.alive = false; p.vy = -420; api.addScore(50, e.x, e.y); api.sfx("hit"); api.particles(e.x + 15, e.y + 15, { count: 18, color: api.colors.danger }); api.shake(4, 0.15); }
      else if (!p.inv) { p.inv = 1.5; p.vx = -p.face * 300; p.vy = -300; api.loseLife(); }
    }
    if (p.y > 700) { p.x = 60; p.y = 380; p.vx = 0; p.vy = 0; api.loseLife(); }
    if (api.overlap(p, S.flag)) { api.addScore(200, p.x, p.y); api.nextLevel(); return; }
    api.camera.x = api.clamp(p.x - api.W / 2, 0, WORLD - api.W);
  },
  draw(ctx, api) {
    const c = api.colors;
    for (const b of S.plats) { api.draw.roundRect(b.x, b.y, b.w, b.h, 6, c.bg2); api.draw.rect(b.x, b.y, b.w, 4, c.accent2); }
    for (const k of S.coins) if (!k.got) { api.draw.glow(c.accent, 12); api.draw.circle(k.x, k.y + Math.sin(api.time * 4 + k.x) * 3, k.r, c.accent); api.draw.noGlow(); }
    for (const e of S.enemies) if (e.alive) { api.draw.roundRect(e.x, e.y, e.w, e.h, 8, c.danger); api.draw.circle(e.x + 9, e.y + 11, 4, "#fff"); api.draw.circle(e.x + 21, e.y + 11, 4, "#fff"); }
    api.draw.rect(S.flag.x, S.flag.y, 6, S.flag.h, c.fg);
    api.draw.poly([S.flag.x + 6, S.flag.y, S.flag.x + 50, S.flag.y + 16, S.flag.x + 6, S.flag.y + 32], c.good);
    const p = S.p;
    if (p.inv && Math.floor(api.time * 12) % 2) return;
    api.draw.roundRect(p.x, p.y, p.w, p.h, 8, c.accent);
    api.draw.roundRect(p.x + 4, p.y + 4, p.w - 8, 12, 5, c.fg);
    api.draw.circle(p.x + (p.face > 0 ? 19 : 9), p.y + 10, 3, c.bg);
  },
});
`.trim()
