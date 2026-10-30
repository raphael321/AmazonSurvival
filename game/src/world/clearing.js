import { rng } from '../engine/math.js';
import { GROUND_K } from '../engine/projection.js';
import { paintSamauma, paintAcai, paintBush, paintRock, drawFruit } from '../art/scenery.js';
import { drawSprite, drawSwaying } from '../art/sprite.js';
import { buildGroundFeatures, paintGroundChunk, CHUNK } from './ground.js';
import { PAL } from '../art/palette.js';

// Clareira de várzea: chão cacheado em chunks + objetos (árvores, arbustos, pedras) com sprites cacheados.
export class World {
  constructor(seed = 2026) {
    this.seed = seed;
    this.W = 2600;
    this.H = 2100;
    this.border = { N: 300, Wb: 260, E: 260 };
    this.props = [];
    this.colliders = [];
    this.chunks = new Map();
    this.time = 0;
    this.generate();
  }

  // margem do rio (y do mundo onde começa a água)
  riverY(x) {
    return 1650 + Math.sin(x * 0.0032 + 1) * 48 + Math.sin(x * 0.011 + 2) * 18;
  }

  generate() {
    const r = rng(this.seed);
    const add = (p) => { this.props.push(p); return p; };
    const free = (x, y, d) => this.props.every((p) => Math.hypot(p.x - x, p.y - y) > d + (p.space || 0));

    add({ kind: 'samauma', x: 820, y: 760, seed: 11, space: 160 });
    this.colliders.push({ x: 820, y: 760, r: 62 });

    const center = [1300, 1080];
    let tries = 0;
    for (let n = 0; n < 14 && tries < 500; tries++) {
      const x = r.range(380, 2240), y = r.range(420, this.riverY(x) - 70);
      if (Math.hypot(x - center[0], y - center[1]) < 300 || !free(x, y, 150)) continue;
      add({ kind: 'acai', x, y, seed: Math.floor(r() * 1e9), space: 20 });
      this.colliders.push({ x, y, r: 14 });
      n++;
    }
    // camu-camu cresce na beira do rio
    tries = 0;
    for (let n = 0; n < 7 && tries < 500; tries++) {
      const x = r.range(420, 2200), y = this.riverY(x) - r.range(90, 190);
      if (!free(x, y, 110)) continue;
      add({ kind: 'bush', fruit: true, x, y, seed: Math.floor(r() * 1e9), hasFruit: true, regrow: 0, shake: 0 });
      n++;
    }
    tries = 0;
    for (let n = 0; n < 20 && tries < 800; tries++) {
      const x = r.range(330, 2280), y = r.range(400, this.riverY(x) - 80);
      if (Math.hypot(x - center[0], y - center[1]) < 200 || !free(x, y, 90)) continue;
      add({ kind: 'bush', fruit: false, x, y, seed: Math.floor(r() * 1e9), scale: r.range(0.8, 1.3), shake: 0 });
      n++;
    }
    tries = 0;
    for (let n = 0; n < 9 && tries < 500; tries++) {
      const x = r.range(330, 2280), y = r.range(400, this.riverY(x) - 40);
      if (Math.hypot(x - center[0], y - center[1]) < 220 || !free(x, y, 90)) continue;
      const size = r.range(0.7, 1.4);
      add({ kind: 'rock', x, y, seed: Math.floor(r() * 1e9), size });
      this.colliders.push({ x, y, r: 26 * size });
      n++;
    }
    this.features = buildGroundFeatures(this, this.seed + 1);
  }

  // (re)pinta todos os caches na escala de renderização atual
  buildCaches(rs) {
    this.rs = rs;
    this.chunks.clear();
    for (const p of this.props) {
      if (p.kind === 'samauma') p.art = paintSamauma(p.seed, rs);
      else if (p.kind === 'acai') p.art = paintAcai(p.seed, rs);
      else if (p.kind === 'bush') p.art = paintBush(p.seed, rs, { fruit: p.fruit, scale: p.scale || 1 });
      else if (p.kind === 'rock') p.art = paintRock(p.seed, rs, p.size);
      if (p.kind === 'bush' && !p.collider) {
        p.collider = { x: p.x, y: p.y, r: p.art.w * 0.28 };
        this.colliders.push(p.collider);
      }
    }
  }

  chunk(ix, iy) {
    const k = ix + ',' + iy;
    let c = this.chunks.get(k);
    if (!c) {
      c = paintGroundChunk(this, this.features, ix * CHUNK, iy * CHUNK, this.rs);
      this.chunks.set(k, c);
    }
    return c;
  }

  // força todos os chunks agora (evita engasgo ao andar)
  warmChunks() {
    for (let iy = 0; iy * CHUNK < this.H * GROUND_K; iy++)
      for (let ix = 0; ix * CHUNK < this.W; ix++) this.chunk(ix, iy);
  }

  update(dt) {
    this.time += dt;
    for (const p of this.props) {
      if (p.kind !== 'bush') continue;
      p.shake = Math.max(0, p.shake - dt * 2.5);
      if (p.fruit && !p.hasFruit) {
        p.regrow -= dt;
        if (p.regrow <= 0) p.hasFruit = true;
      }
    }
  }

  // empurra uma entidade para fora de obstáculos, bordas e água funda
  resolve(e, rad) {
    const { N, Wb, E } = this.border;
    e.x = Math.max(Wb + rad, Math.min(this.W - E - rad, e.x));
    e.y = Math.max(N + rad, e.y);
    const maxY = this.riverY(e.x) + 6;
    if (e.y > maxY) e.y = maxY;
    for (const c of this.colliders) {
      const dx = e.x - c.x, dy = e.y - c.y;
      const d = Math.hypot(dx, dy), m = c.r + rad;
      if (d < m && d > 0.001) {
        e.x = c.x + (dx / d) * m;
        e.y = c.y + (dy / d) * m;
      }
    }
  }

  isFree(x, y, rad) {
    const { N, Wb, E } = this.border;
    if (x < Wb + rad || x > this.W - E - rad || y < N + rad || y > this.riverY(x) - 10) return false;
    return this.colliders.every((c) => Math.hypot(x - c.x, y - c.y) > c.r + rad);
  }

  drawGround(ctx, view) {
    const x0 = Math.max(0, Math.floor(view.x0 / CHUNK)), x1 = Math.floor(view.x1 / CHUNK);
    const y0 = Math.max(0, Math.floor(view.y0 / CHUNK)), y1 = Math.floor(view.y1 / CHUNK);
    for (let iy = y0; iy <= y1; iy++) {
      for (let ix = x0; ix <= x1; ix++) {
        if (ix * CHUNK >= this.W || iy * CHUNK >= this.H * GROUND_K) continue;
        // +0.5px de sobreposição evita costura entre chunks
        ctx.drawImage(this.chunk(ix, iy), ix * CHUNK, iy * CHUNK, CHUNK + 0.5, CHUNK + 0.5);
      }
    }
    this.drawWater(ctx, view);
  }

  // única parte animada do chão: brilho da água
  drawWater(ctx, view) {
    const t = this.time;
    ctx.lineCap = 'round';
    ctx.strokeStyle = PAL.river[2];
    const start = Math.floor(view.x0 / 70) * 70;
    for (let x = start; x < view.x1 + 70; x += 70) {
      for (let k = 0; k < 4; k++) {
        const ph = Math.sin(x * 12.9898 + k * 78.233) * 43758.5453;
        const fr = ph - Math.floor(ph);
        const wy = this.riverY(x) + 24 + k * 55 + fr * 30;
        const vy = wy * GROUND_K;
        if (vy < view.y0 - 20 || vy > view.y1 + 20) continue;
        const a = 0.5 + 0.5 * Math.sin(t * 1.4 + fr * 20);
        const drift = ((t * 14 + fr * 70) % 70);
        const L = 10 + fr * 22;
        ctx.globalAlpha = a * 0.75;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + drift, vy);
        ctx.lineTo(x + drift + L, vy);
        ctx.stroke();
      }
    }
    // marolinhas na margem
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const s0 = Math.floor(view.x0 / 8) * 8;
    for (let x = s0; x < view.x1 + 8; x += 8) {
      const vy = (this.riverY(x) + 7 + Math.sin(t * 2 + x * 0.05) * 2.5) * GROUND_K;
      if (x === s0) ctx.moveTo(x, vy);
      else ctx.lineTo(x, vy);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // devolve objetos desenháveis para a ordenação por profundidade
  drawables(view, player) {
    const out = [];
    const pv = [player.x, player.y * GROUND_K - 40];
    for (const p of this.props) {
      const vx = p.x, vy = p.y * GROUND_K;
      if (vx < view.x0 - 320 || vx > view.x1 + 320 || vy < view.y0 - 60 || vy > view.y1 + 600) continue;
      out.push({ y: p.y, draw: (ctx) => this.drawProp(ctx, p, vx, vy, pv, player) });
    }
    return out;
  }

  drawProp(ctx, p, vx, vy, pv, player) {
    const t = this.time;
    const wind = Math.sin(t * 1.1 + p.x * 0.01) * 0.5 + Math.sin(t * 2.3 + p.y * 0.02) * 0.25;
    // copa fica translúcida se o jogador estiver atrás dela
    const behind = (art, cy) => {
      if (player.y >= p.y) return 1;
      const s = art;
      const inX = Math.abs(pv[0] - vx) < s.w * 0.45;
      const inY = pv[1] > vy + cy - s.oy && pv[1] < vy + cy + (s.h - s.oy);
      return inX && inY ? 0.45 : 1;
    };
    if (p.kind === 'samauma') {
      drawSprite(ctx, p.art.trunk, vx, vy);
      ctx.globalAlpha = behind(p.art.canopy, p.art.canopyY);
      drawSwaying(ctx, p.art.canopy, vx, vy + p.art.canopyY, wind * 0.012);
      ctx.globalAlpha = 1;
    } else if (p.kind === 'acai') {
      ctx.globalAlpha = behind(p.art.trunk, 0) < 1 ? 0.6 : 1;
      drawSprite(ctx, p.art.trunk, vx, vy);
      ctx.globalAlpha = behind(p.art.crown, p.art.crownY);
      drawSwaying(ctx, p.art.crown, vx, vy + p.art.crownY, wind * 0.05);
      ctx.globalAlpha = 1;
    } else if (p.kind === 'bush') {
      const sk = wind * 0.03 + Math.sin(t * 30) * p.shake * 0.12;
      drawSwaying(ctx, p.art.sprite, vx, vy, sk);
      if (p.fruit && p.hasFruit) {
        for (const [fx, fy] of p.art.fruits) drawFruit(ctx, vx + fx + fy * sk, vy + fy);
      }
    } else if (p.kind === 'rock') {
      drawSprite(ctx, p.art, vx, vy);
    }
  }

  nearestFruitBush(x, y, maxD) {
    let best = null, bd = maxD;
    for (const p of this.props) {
      if (p.kind !== 'bush' || !p.fruit || !p.hasFruit) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // golpe de facão: sacode arbustos atingidos
  strike(x, y, fx, fy, reach) {
    for (const p of this.props) {
      if (p.kind !== 'bush') continue;
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
      if (d < reach + p.art.w * 0.4 && (dx * fx + dy * fy) / (d || 1) > 0.2) p.shake = 1;
    }
  }
}
