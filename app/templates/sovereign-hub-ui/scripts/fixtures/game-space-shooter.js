/* global MalikGame -- provided by the Malik game runtime */
// A complete game written against the Malik game runtime, used by the tests
// as "what a good model reply looks like": it must pass the static checks,
// run in the sandbox without errors and react to input.
const S = { ship: null, bullets: [], enemies: [], shots: [], stars: [], power: [], wave: 0, spawn: 0, boss: null, cool: 0, hurt: 0 };

const SHIP = [
  "....##....",
  "...####...",
  "...#oo#...",
  "..######..",
  ".##.##.##.",
  "##########",
  "#.#....#.#",
];

function spawnWave(api) {
  S.wave += 1;
  const count = 5 + S.wave * 2 + api.level * 2;
  for (let i = 0; i < count; i++) {
    const kind = i % 5 === 4 && api.level > 1 ? "shooter" : i % 3 === 2 ? "diver" : "zig";
    S.enemies.push({
      kind, x: 80 + (i % 8) * ((api.W - 160) / 7), y: -40 - Math.floor(i / 8) * 60, r: kind === "shooter" ? 18 : 14,
      hp: kind === "shooter" ? 3 : 1, t: api.rand(0, 6.28), speed: 60 + api.level * 18 + S.wave * 4, fire: api.rand(1, 3),
    });
  }
  api.setStatus("Волна " + S.wave + "/3");
}

MalikGame.define({
  setup(api) {
    for (let i = 0; i < 40; i++) S.stars.push({ x: api.rand(0, api.W), y: api.rand(0, api.H), s: api.rand(40, 160) });
  },
  start(api, _level) {
    S.ship = { x: api.W / 2, y: api.H - 70, r: 16, vx: 0, vy: 0, spread: 0, shield: 0 };
    S.bullets = []; S.enemies = []; S.shots = []; S.power = []; S.wave = 0; S.spawn = 0.6; S.boss = null; S.cool = 0; S.hurt = 1.5;
  },
  update(dt, api) {
    const p = S.ship;
    const ax = api.axis();
    p.vx = api.approach(p.vx, ax.x * 360, 2400 * dt);
    p.vy = api.approach(p.vy, ax.y * 300, 2400 * dt);
    p.x = api.clamp(p.x + p.vx * dt, 20, api.W - 20);
    p.y = api.clamp(p.y + p.vy * dt, api.H * 0.45, api.H - 24);
    if (api.pointer.down) { p.x = api.lerp(p.x, api.pointer.x, 0.2); p.y = api.lerp(p.y, api.clamp(api.pointer.y, api.H * 0.45, api.H - 24), 0.2); }
    S.cool -= dt; S.hurt -= dt; p.shield = Math.max(0, p.shield - dt);
    if ((api.key("action") || api.pointer.down) && S.cool <= 0) {
      S.cool = 0.16;
      const spread = p.spread > 0 ? [-0.18, 0, 0.18] : [0];
      for (const a of spread) S.bullets.push({ x: p.x, y: p.y - 18, vx: Math.sin(a) * 620, vy: -Math.cos(a) * 620, r: 4 });
      api.sfx("shoot");
    }
    if (api.pressed("action2") && p.shield <= 0) { p.shield = 1.2; api.sfx("power"); }
    p.spread = Math.max(0, p.spread - dt);

    if (!S.enemies.length && !S.boss) {
      S.spawn -= dt;
      if (S.spawn <= 0) {
        if (S.wave < 3) spawnWave(api);
        else if (!S.boss) { S.boss = { x: api.W / 2, y: -80, r: 46, hp: 30 + api.level * 10, max: 30 + api.level * 10, t: 0, fire: 1 }; api.setStatus("Флагман!"); }
        S.spawn = 1.2;
      }
    }
    for (const e of S.enemies) {
      e.t += dt;
      e.y += e.speed * dt * (e.kind === "diver" ? 1.6 : 1);
      e.x += Math.sin(e.t * 2.4) * (e.kind === "zig" ? 120 : 30) * dt;
      if (e.kind === "shooter") { e.fire -= dt; if (e.fire <= 0 && e.y > 0) { e.fire = 2.2; const a = api.angle(e.x, e.y, p.x, p.y); S.shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, r: 5 }); } }
      if (e.y > api.H + 40) { e.dead = true; api.addScore(-5); }
      if (!e.dead && S.hurt <= 0 && p.shield <= 0 && api.circle(e, p)) { e.dead = true; S.hurt = 1.5; api.particles(e.x, e.y, { color: [api.colors.danger, api.colors.accent], count: 24 }); api.loseLife(); }
    }
    if (S.boss) {
      const b = S.boss; b.t += dt;
      b.y = api.lerp(b.y, 110, 0.02); b.x = api.W / 2 + Math.sin(b.t * 0.8) * (api.W * 0.32);
      b.fire -= dt;
      if (b.fire <= 0) { b.fire = 0.9 - api.level * 0.08; for (let k = -2; k <= 2; k++) S.shots.push({ x: b.x, y: b.y + 30, vx: k * 70, vy: 260, r: 6 }); api.sfx("laser"); }
    }
    for (const s of S.bullets) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.y < -20) s.dead = true;
      for (const e of S.enemies) {
        if (!e.dead && !s.dead && api.circle(s, e)) {
          s.dead = true; e.hp -= 1; api.sfx("hit");
          if (e.hp <= 0) { e.dead = true; api.addScore(e.kind === "shooter" ? 30 : 10, e.x, e.y); api.particles(e.x, e.y, { color: [api.colors.accent, api.colors.accent2], count: 18, speed: 200 }); api.shake(3, 0.12); if (api.chance(0.12)) S.power.push({ x: e.x, y: e.y, r: 10, vy: 90 }); }
        }
      }
      if (S.boss && !s.dead && api.circle(s, S.boss)) {
        s.dead = true; S.boss.hp -= 1; api.particles(s.x, s.y, { color: api.colors.accent2, count: 6 });
        if (S.boss.hp <= 0) { api.addScore(250, S.boss.x, S.boss.y); api.particles(S.boss.x, S.boss.y, { count: 80, speed: 320, life: 1.2, color: [api.colors.accent, api.colors.danger, api.colors.fg] }); api.shake(14, 0.6); api.sfx("explode"); S.boss = null; api.nextLevel(); return; }
      }
    }
    for (const s of S.shots) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.y > api.H + 20 || s.x < -20 || s.x > api.W + 20) s.dead = true;
      if (!s.dead && S.hurt <= 0 && api.circle(s, p)) { s.dead = true; if (p.shield > 0) { api.sfx("bounce"); } else { S.hurt = 1.5; api.loseLife(); } }
    }
    for (const u of S.power) { u.y += u.vy * dt; if (api.circle(u, p)) { u.dead = true; p.spread = 8; api.sfx("pickup"); api.floatText("x3", u.x, u.y, api.colors.good); } if (u.y > api.H + 20) u.dead = true; }
    S.bullets = S.bullets.filter((b) => !b.dead).slice(-80);
    S.enemies = S.enemies.filter((e) => !e.dead);
    S.shots = S.shots.filter((b) => !b.dead).slice(-120);
    S.power = S.power.filter((u) => !u.dead);
    for (const st of S.stars) { st.y += st.s * dt; if (st.y > api.H) { st.y = 0; st.x = api.rand(0, api.W); } }
  },
  draw(ctx, api) {
    for (const st of S.stars) api.draw.rect(st.x, st.y, 2, st.s / 40, api.rgba(api.colors.fg, 0.35));
    for (const u of S.power) { api.draw.glow(api.colors.good, 16); api.draw.star(u.x, u.y, 11, 5, 5, api.colors.good); }
    api.draw.noGlow();
    for (const e of S.enemies) {
      const c = e.kind === "shooter" ? api.colors.danger : e.kind === "diver" ? api.colors.accent2 : api.colors.accent;
      api.draw.glow(c, 12);
      api.draw.poly([e.x, e.y + e.r, e.x - e.r, e.y - e.r * 0.6, e.x, e.y - e.r * 0.2, e.x + e.r, e.y - e.r * 0.6], c);
      api.draw.noGlow();
      api.draw.circle(e.x, e.y - 2, 3, api.colors.bg);
    }
    if (S.boss) {
      const b = S.boss;
      api.draw.glow(api.colors.danger, 24);
      api.draw.roundRect(b.x - 70, b.y - 26, 140, 52, 18, api.mix(api.colors.danger, "#000000", 0.2), api.colors.fg, 2);
      api.draw.noGlow();
      api.draw.circle(b.x, b.y, 14 + Math.sin(b.t * 6) * 3, api.colors.accent);
      api.draw.bar(api.W / 2 - 160, 20, 320, 8, b.hp / b.max, api.colors.danger);
    }
    for (const s of S.bullets) { api.draw.glow(api.colors.accent, 10); api.draw.rect(s.x - 2, s.y - 8, 4, 14, api.colors.accent); }
    for (const s of S.shots) { api.draw.glow(api.colors.danger, 10); api.draw.circle(s.x, s.y, s.r, api.colors.danger); }
    api.draw.noGlow();
    const p = S.ship;
    if (S.hurt > 0 && Math.floor(api.time * 12) % 2) return;
    api.draw.radial(p.x, p.y + 26, 22 + Math.sin(api.time * 30) * 4, api.rgba(api.colors.accent2, 0.9));
    api.draw.pixels(SHIP, { "#": api.colors.fg, o: api.colors.accent2 }, p.x - 15, p.y - 12, 3);
    if (p.shield > 0) api.draw.ring(p.x, p.y, 28, api.rgba(api.colors.good, 0.8), 3);
  },
});
