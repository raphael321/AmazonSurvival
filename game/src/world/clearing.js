import { rng, makeNoise } from '../engine/math.js';
import { P, sortKey } from '../engine/projection.js';
import { paintSamauma, paintAcai, paintBush, paintRock, paintForestTree, drawFruit } from '../art/scenery.js';
import { drawSprite, drawSwaying, tintSprite } from '../art/sprite.js';
import { T, HL, CHUNK, VOID, paintTerrainChunk, drawWater } from './terrain.js';

const FOREST_BAND = 3; // tiles de mata fechada nas bordas de trás

// Clareira de várzea em tiles isométricos: chão em chunks cacheados + objetos com sprites cacheados.
export class World {
  constructor(seed = 2026) {
    this.seed = seed;
    this.NX = 38;
    this.NY = 34;
    this.W = this.NX * T;
    this.H = this.NY * T;
    this.noise = makeNoise(seed + 3);
    this.props = [];
    this.colliders = [];
    this.chunks = new Map();
    this.time = 0;
    this.generate();
  }

  // margem do rio (y do mundo onde começa a água)
  riverY(x) {
    return this.H - 300 + Math.sin(x * 0.0032 + 1) * 70 + Math.sin(x * 0.011 + 2) * 24;
  }

  h(i, j) {
    if (i < 0 || j < 0 || i >= this.NX || j >= this.NY) return VOID;
    return this.heights[j * this.NX + i];
  }

  isForest(i, j) {
    return i < FOREST_BAND || j < FOREST_BAND;
  }

  tileAt(x, y) {
    return [Math.floor(x / T), Math.floor(y / T)];
  }

  walkable(x, y) {
    const [i, j] = this.tileAt(x, y);
    return this.h(i, j) === 0 && !this.isForest(i, j);
  }

  generate() {
    const { NX, NY } = this;
    this.heights = new Int8Array(NX * NY);
    const spawn = [19, 16];
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const cx = (i + 0.5) * T, cy = (j + 0.5) * T;
        let h = 0;
        if (cy > this.riverY(cx)) h = -1;
        else if (!this.isForest(i, j) && cy < this.riverY(cx) - 2.5 * T && Math.hypot(i - spawn[0], j - spawn[1]) > 6) {
          const n = this.noise(i / 4.5 + 40, j / 4.5 + 40);
          if (n > 0.68) h = 1;
        }
        this.heights[j * NX + i] = h;
      }
    }
    // ordem de pintura (de trás para frente) e lista de água
    this.tileOrder = [];
    this.waterTiles = [];
    for (let s = 0; s < NX + NY; s++)
      for (let i = 0; i <= s; i++) {
        const j = s - i;
        if (i < NX && j < NY) {
          this.tileOrder.push([i, j]);
          if (this.h(i, j) < 0) this.waterTiles.push([i, j]);
        }
      }

    const r = rng(this.seed);
    const add = (p) => { this.props.push(p); return p; };
    const free = (x, y, d) => this.walkable(x, y) && this.props.every((p) => Math.hypot(p.x - x, p.y - y) > d + (p.space || 0));
    const sx = (spawn[0] + 0.5) * T, sy = (spawn[1] + 0.5) * T;
    this.spawn = [sx, sy];

    add({ kind: 'samauma', x: sx - 520, y: sy - 330, seed: 11, space: 160, canopy: 300, shadow: 70 });
    this.colliders.push({ x: sx - 520, y: sy - 330, r: 62 });

    let tries = 0;
    for (let n = 0; n < 16 && tries < 800; tries++) {
      const x = r.range(4 * T, this.W - 2 * T), y = r.range(4 * T, this.riverY(x) - 60);
      if (Math.hypot(x - sx, y - sy) < 300 || !free(x, y, 150)) continue;
      add({ kind: 'acai', x, y, seed: Math.floor(r() * 1e9), space: 20, canopy: 110, shadow: 22 });
      this.colliders.push({ x, y, r: 14 });
      n++;
    }
    // camu-camu cresce na beira do rio
    tries = 0;
    for (let n = 0; n < 8 && tries < 800; tries++) {
      const x = r.range(5 * T, this.W - 3 * T), y = this.riverY(x) - r.range(70, 170);
      if (!free(x, y, 110)) continue;
      add({ kind: 'bush', fruit: true, x, y, seed: Math.floor(r() * 1e9), hasFruit: true, regrow: 0, shake: 0, shadow: 30 });
      n++;
    }
    tries = 0;
    for (let n = 0; n < 22 && tries < 900; tries++) {
      const x = r.range(4 * T, this.W - 2 * T), y = r.range(4 * T, this.riverY(x) - 80);
      if (Math.hypot(x - sx, y - sy) < 200 || !free(x, y, 90)) continue;
      add({ kind: 'bush', fruit: false, x, y, seed: Math.floor(r() * 1e9), scale: r.range(0.8, 1.3), shake: 0, shadow: 30 });
      n++;
    }
    tries = 0;
    for (let n = 0; n < 9 && tries < 600; tries++) {
      const x = r.range(4 * T, this.W - 2 * T), y = r.range(4 * T, this.riverY(x) - 40);
      if (Math.hypot(x - sx, y - sy) < 220 || !free(x, y, 90)) continue;
      const size = r.range(0.7, 1.4);
      add({ kind: 'rock', x, y, seed: Math.floor(r() * 1e9), size, shadow: 26 * size });
      this.colliders.push({ x, y, r: 26 * size });
      n++;
    }
    // parede de mata fechada nas bordas de trás
    for (let j = 0; j < this.NY; j++)
      for (let i = 0; i < this.NX; i++) {
        if (!this.isForest(i, j) || this.h(i, j) < 0) continue;
        const inner = i === FOREST_BAND - 1 || j === FOREST_BAND - 1;
        if (!inner && r() < 0.35) continue;
        add({
          kind: 'forest', x: (i + 0.2 + r() * 0.6) * T, y: (j + 0.2 + r() * 0.6) * T,
          variant: Math.floor(r() * 4), canopy: 140, shadow: 24,
        });
      }

    // poças de sol: clareiras onde a copa abre
    this.sunSpots = [
      { x: sx + 40, y: sy + 20, r: 260 },
      { x: sx + 520, y: sy - 260, r: 200 },
      { x: sx - 260, y: sy + 380, r: 220 },
      { x: sx + 700, y: sy + 420, r: 190 },
      { x: sx - 700, y: sy - 40, r: 170 },
      { x: sx + 160, y: sy - 620, r: 180 },
    ];

    // limites da vista (para o mapa de luz e a câmera)
    const c = [P([0, 0, 0]), P([this.W, 0, 0]), P([this.W, this.H, 0]), P([0, this.H, 0])];
    this.viewBounds = {
      x0: Math.min(...c.map((p) => p[0])) - 60, x1: Math.max(...c.map((p) => p[0])) + 60,
      y0: Math.min(...c.map((p) => p[1])) - 420, y1: Math.max(...c.map((p) => p[1])) + 220,
    };
  }

  // (re)pinta todos os caches na escala de renderização atual
  buildCaches(rs) {
    this.rs = rs;
    this.groundRs = Math.min(rs, 1.6);
    this.chunks.clear();
    const forestArt = [0, 1, 2, 3].map((v) => paintForestTree(500 + v * 17, rs));
    // a mata fechada fica toda na penumbra
    if (this.lightAt) for (const a of forestArt) { tintSprite(a.trunk, [150, 150, 130]); tintSprite(a.canopy, [175, 175, 155]); }
    for (const p of this.props) {
      if (p.kind === 'samauma') p.art = paintSamauma(p.seed, rs);
      else if (p.kind === 'acai') p.art = paintAcai(p.seed, rs);
      else if (p.kind === 'bush') p.art = paintBush(p.seed, rs, { fruit: p.fruit, scale: p.scale || 1 });
      else if (p.kind === 'rock') p.art = paintRock(p.seed, rs, p.size);
      else if (p.kind === 'forest') p.art = forestArt[p.variant];
      if (this.lightAt && p.kind !== 'forest') this.tintProp(p);
      if (p.kind === 'bush' && !p.collider) {
        p.collider = { x: p.x, y: p.y, r: p.art.w * 0.28 };
        this.colliders.push(p.collider);
      }
    }
  }

  // luz do lugar: tronco recebe a do chão, copa recebe mais (está acima da sombra)
  tintProp(p) {
    const l = this.lightAt(p.x, p.y);
    const up = l.map((c) => Math.round(c + (255 - c) * 0.45));
    const a = p.art;
    if (p.kind === 'samauma') { tintSprite(a.trunk, l); tintSprite(a.canopy, up); }
    else if (p.kind === 'acai') { tintSprite(a.trunk, l); tintSprite(a.crown, up); }
    else if (p.kind === 'bush') tintSprite(a.sprite, l);
    else if (p.kind === 'rock') tintSprite(a, l);
  }

  chunk(ix, iy) {
    const k = ix + ',' + iy;
    let c = this.chunks.get(k);
    if (!c) {
      c = paintTerrainChunk(this, ix * CHUNK, iy * CHUNK, this.groundRs);
      this.chunks.set(k, c);
    }
    return c;
  }

  warmChunks() {
    const b = this.viewBounds;
    for (let iy = Math.floor(b.y0 / CHUNK); iy * CHUNK < b.y1; iy++)
      for (let ix = Math.floor(b.x0 / CHUNK); ix * CHUNK < b.x1; ix++) this.chunk(ix, iy);
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

  // move de (px,py) para (e.x,e.y) deslizando em barrancos, água e obstáculos
  resolve(e, rad, px, py) {
    const ok = (x, y) => this.walkable(x - rad, y) && this.walkable(x + rad, y) && this.walkable(x, y - rad) && this.walkable(x, y + rad);
    if (!ok(e.x, e.y)) {
      if (ok(e.x, py)) e.y = py;
      else if (ok(px, e.y)) e.x = px;
      else { e.x = px; e.y = py; }
    }
    for (const c of this.colliders) {
      const dx = e.x - c.x, dy = e.y - c.y;
      const d = Math.hypot(dx, dy), m = c.r + rad;
      if (d < m && d > 0.001) {
        const nx = c.x + (dx / d) * m, ny = c.y + (dy / d) * m;
        if (ok(nx, ny)) { e.x = nx; e.y = ny; }
        else { e.x = px; e.y = py; }
      }
    }
  }

  isFree(x, y, rad) {
    for (const [dx, dy] of [[-rad, 0], [rad, 0], [0, -rad], [0, rad]]) if (!this.walkable(x + dx, y + dy)) return false;
    return this.colliders.every((c) => Math.hypot(x - c.x, y - c.y) > c.r + rad);
  }

  drawGround(ctx, view) {
    const x0 = Math.floor(view.x0 / CHUNK), x1 = Math.floor(view.x1 / CHUNK);
    const y0 = Math.floor(view.y0 / CHUNK), y1 = Math.floor(view.y1 / CHUNK);
    for (let iy = y0; iy <= y1; iy++)
      for (let ix = x0; ix <= x1; ix++)
        ctx.drawImage(this.chunk(ix, iy), ix * CHUNK, iy * CHUNK, CHUNK + 0.5, CHUNK + 0.5);
    drawWater(ctx, this, view, this.time);
  }

  drawables(view, player) {
    const out = [];
    const pv = P([player.x, player.y, 40]);
    for (const p of this.props) {
      const [vx, vy] = P([p.x, p.y, p.z || 0]);
      if (vx < view.x0 - 320 || vx > view.x1 + 320 || vy < view.y0 - 60 || vy > view.y1 + 600) continue;
      out.push({ key: sortKey(p.x, p.y), draw: (ctx) => this.drawProp(ctx, p, vx, vy, pv, player) });
    }
    return out;
  }

  drawProp(ctx, p, vx, vy, pv, player) {
    const t = this.time;
    const wind = Math.sin(t * 1.1 + p.x * 0.01) * 0.5 + Math.sin(t * 2.3 + p.y * 0.02) * 0.25;
    // copa fica translúcida se o jogador estiver atrás dela
    const behind = (s, cy) => {
      if (sortKey(player.x, player.y) >= sortKey(p.x, p.y)) return 1;
      const inX = Math.abs(pv[0] - vx) < s.w * 0.45;
      const inY = pv[1] > vy + cy - s.oy && pv[1] < vy + cy + (s.h - s.oy);
      return inX && inY ? 0.4 : 1;
    };
    if (p.kind === 'samauma' || p.kind === 'forest') {
      drawSprite(ctx, p.art.trunk, vx, vy);
      ctx.globalAlpha = p.kind === 'forest' ? 1 : behind(p.art.canopy, p.art.canopyY);
      drawSwaying(ctx, p.art.canopy, vx + (p.art.canopyX || 0), vy + p.art.canopyY, wind * (p.kind === 'forest' ? 0.008 : 0.012));
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
      if (p.fruit && p.hasFruit) for (const [fx, fy] of p.art.fruits) drawFruit(ctx, vx + fx + fy * sk, vy + fy);
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

  strike(x, y, fx, fy, reach) {
    for (const p of this.props) {
      if (p.kind !== 'bush') continue;
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
      if (d < reach + p.art.w * 0.4 && (dx * fx + dy * fy) / (d || 1) > 0.2) p.shake = 1;
    }
  }
}
