import { P, sortKey, groundFromView } from '../engine/projection.js';
import { paintSamauma, paintAcai, paintBush, paintRock, paintForestTree, drawFruit } from '../art/scenery.js';
import { drawSprite, drawSwaying, tintSprite } from '../art/sprite.js';
import { Gen, T, BLOCK, DEFAULTS } from './gen.js';
import { CHUNK, chunkPainter, drawWater } from './terrain.js';

const MAX_CHUNKS = 90; // limite de memória dos chunks de chão (LRU)
const MAX_BLOCKS = 160; // limite de blocos de objetos (LRU)
const LIGHT_LEVELS = [0.5, 0.64, 0.8, 0.96];
// caixa de cada tipo de sprite na vista: [altura acima da base, meia-largura]
const EXTENT = { samauma: [580, 290], forest: [560, 200], acai: [340, 160], bush: [110, 70], rock: [70, 70] };

// Mundo infinito: tiles e objetos vêm do ruído; só existe em memória o que está perto da câmera.
export class World {
  constructor(params = {}) {
    this.time = 0;
    this.picked = new Map(); // camu-camu colhido: id -> hora em que volta
    this.stats = { painted: 0, paintMs: 0, queue: 0, evicted: 0 };
    this.setParams(params);
  }

  setParams(params) {
    this.params = { ...DEFAULTS, ...params };
    this.gen = new Gen(this.params);
    this.chunks = new Map(); // "ix,iy" -> { canvas, used }
    this.blocks = new Map(); // "bi,bj" -> { props, used }
    this.bank = new Map(); // sprites compartilhados: tipo|variante|luz
    this.jobs = new Map(); // chunks sendo pintados aos poucos
    this.frame = 0;
  }

  // ---------- consulta de tiles ----------
  h(i, j) { return this.gen.h(i, j); }
  walkable(x, y) {
    const i = Math.floor(x / T), j = Math.floor(y / T);
    return this.gen.h(i, j) === 0 && !this.gen.isForest(i, j);
  }

  // procura em espiral um tile andável e com folga em volta
  findSpawn(x, y) {
    const i0 = Math.floor(x / T), j0 = Math.floor(y / T);
    for (let r = 0; r < 200; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const cx = (i0 + di + 0.5) * T, cy = (j0 + dj + 0.5) * T;
          // chão livre e nenhuma árvore grande tapando a câmera
          if (this.isFree(cx, cy, 40) && !this.propsIn(cx - 450, cy - 450, cx + 450, cy + 450).some((p) => p.kind === 'samauma' || p.kind === 'forest')) return [cx, cy];
        }
    return [x, y];
  }

  // ---------- objetos por bloco ----------
  block(bi, bj) {
    const k = bi + ',' + bj;
    let b = this.blocks.get(k);
    if (!b) {
      b = { props: this.gen.props(bi, bj), used: 0 };
      this.blocks.set(k, b);
    }
    b.used = this.frame;
    return b;
  }

  propsIn(x0, y0, x1, y1) {
    const out = [];
    const S = BLOCK * T;
    for (let bj = Math.floor(y0 / S); bj <= Math.floor(y1 / S); bj++)
      for (let bi = Math.floor(x0 / S); bi <= Math.floor(x1 / S); bi++)
        for (const p of this.block(bi, bj).props) if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) out.push(p);
    return out;
  }

  // ---------- sprites compartilhados (variante × nível de luz) ----------
  setScale(rs) {
    if (rs === this.rs) return;
    this.rs = rs;
    this.groundRs = rs;
    this.chunks.clear();
    this.bank.clear();
  }

  lightLevel(p) {
    if (p.light === undefined) {
      const spots = this.gen.spotsNear(p.x - 600, p.y - 600, p.x + 600, p.y + 600);
      const L = this.gen.lightAt(p.x, p.y, spots).L;
      p.light = L < 0.57 ? 0 : L < 0.72 ? 1 : L < 0.88 ? 2 : 3;
    }
    return p.light;
  }

  art(p) {
    const lv = p.kind === 'forest' ? 0 : this.lightLevel(p);
    const key = p.kind + (p.fruit ? 'F' : '') + '|' + p.variant + '|' + lv;
    let a = this.bank.get(key);
    if (a) return a;
    const rs = this.rs, seed = 1000 + p.variant * 7919 + (p.fruit ? 3 : 0);
    if (p.kind === 'samauma') a = paintSamauma(11 + p.variant * 31, rs);
    else if (p.kind === 'acai') a = paintAcai(seed, rs);
    else if (p.kind === 'bush') a = paintBush(seed, rs, { fruit: p.fruit, scale: 0.85 + (p.variant % 3) * 0.2 });
    else if (p.kind === 'rock') a = { sprite: paintRock(seed, rs, 0.7 + (p.variant % 3) * 0.35) };
    else if (p.kind === 'forest') a = paintForestTree(500 + p.variant * 17, rs);
    const v = LIGHT_LEVELS[lv];
    const base = [v * 255, v * 250, v * 226].map(Math.round);
    const up = base.map((c) => Math.round(c + (255 - c) * 0.45));
    if (a.trunk) tintSprite(a.trunk, base);
    if (a.canopy) tintSprite(a.canopy, up);
    if (a.crown) tintSprite(a.crown, up);
    if (a.sprite) tintSprite(a.sprite, base);
    this.bank.set(key, a);
    return a;
  }

  // ---------- streaming de chunks ----------
  // Visíveis que faltam: pintados na hora (nunca há buraco na tela).
  // Anel de pré-carga: fila por distância à câmera, pintura fatiada em vários quadros
  // até `budgetMs` por quadro. Assim andar não engasga.
  stream(view, budgetMs = 4) {
    this.frame++;
    const ring = this.params.loadRadius;
    const vx0 = Math.floor(view.x0 / CHUNK), vx1 = Math.floor(view.x1 / CHUNK);
    const vy0 = Math.floor(view.y0 / CHUNK), vy1 = Math.floor(view.y1 / CHUNK);
    const cxm = (view.x0 + view.x1) / 2, cym = (view.y0 + view.y1) / 2;
    const want = [];
    for (let iy = vy0 - ring; iy <= vy1 + ring; iy++)
      for (let ix = vx0 - ring; ix <= vx1 + ring; ix++) {
        const k = ix + ',' + iy;
        const c = this.chunks.get(k);
        if (c) { c.used = this.frame; continue; }
        const visible = ix >= vx0 && ix <= vx1 && iy >= vy0 && iy <= vy1;
        const d = Math.hypot((ix + 0.5) * CHUNK - cxm, (iy + 0.5) * CHUNK - cym);
        want.push({ ix, iy, k, visible, d });
      }
    want.sort((a, b) => (b.visible - a.visible) || a.d - b.d);
    // trabalhos em andamento que saíram da área desejada são abandonados
    const wanted = new Set(want.map((w) => w.k));
    for (const k of this.jobs.keys()) if (!wanted.has(k)) this.jobs.delete(k);

    const t0 = performance.now();
    for (const w of want) {
      if (!w.visible && performance.now() - t0 > budgetMs) break;
      let job = this.jobs.get(w.k);
      if (!job) {
        job = { it: chunkPainter(this, w.ix, w.iy, this.groundRs), ms: 0 };
        this.jobs.set(w.k, job);
      }
      for (;;) {
        const s = performance.now();
        const r = job.it.next();
        job.ms += performance.now() - s;
        if (r.done) {
          this.chunks.set(w.k, { canvas: r.value, used: this.frame, born: this.frame, ix: w.ix, iy: w.iy });
          this.jobs.delete(w.k);
          this.stats.paintMs = this.stats.paintMs * 0.8 + job.ms * 0.2;
          this.stats.painted++;
          break;
        }
        if (!w.visible && performance.now() - t0 > budgetMs) break;
      }
    }
    this.stats.queue = want.length;
    this.stats.frameMs = performance.now() - t0;
    this.evict();
  }

  evict() {
    const lru = (map, max) => {
      if (map.size <= max) return;
      const old = [...map.entries()].sort((a, b) => a[1].used - b[1].used);
      for (let k = 0; k < map.size - max; k++) {
        map.delete(old[k][0]);
        this.stats.evicted++;
      }
    };
    lru(this.chunks, MAX_CHUNKS);
    lru(this.blocks, MAX_BLOCKS);
  }

  update(dt) {
    this.time += dt;
    for (const [id, t] of this.picked) if (t <= this.time) this.picked.delete(id);
  }

  // ---------- colisão ----------
  collidersNear(x, y) {
    return this.propsIn(x - 120, y - 120, x + 120, y + 120).filter((p) => p.collider);
  }

  resolve(e, rad, px, py) {
    if (e.noclip) return;
    const ok = (x, y) => this.walkable(x - rad, y) && this.walkable(x + rad, y) && this.walkable(x, y - rad) && this.walkable(x, y + rad);
    if (!ok(e.x, e.y)) {
      if (ok(e.x, py)) e.y = py;
      else if (ok(px, e.y)) e.x = px;
      else { e.x = px; e.y = py; }
    }
    for (const c of this.collidersNear(e.x, e.y)) {
      const dx = e.x - c.x, dy = e.y - c.y;
      const d = Math.hypot(dx, dy), m = c.collider + rad;
      if (d < m && d > 0.001) {
        const nx = c.x + (dx / d) * m, ny = c.y + (dy / d) * m;
        if (ok(nx, ny)) { e.x = nx; e.y = ny; } else { e.x = px; e.y = py; }
      }
    }
  }

  isFree(x, y, rad) {
    for (const [dx, dy] of [[-rad, 0], [rad, 0], [0, -rad], [0, rad], [0, 0]]) if (!this.walkable(x + dx, y + dy)) return false;
    return this.collidersNear(x, y).every((c) => Math.hypot(x - c.x, y - c.y) > c.collider + rad);
  }

  // ---------- desenho ----------
  drawGround(ctx, view) {
    for (let iy = Math.floor(view.y0 / CHUNK); iy <= Math.floor(view.y1 / CHUNK); iy++)
      for (let ix = Math.floor(view.x0 / CHUNK); ix <= Math.floor(view.x1 / CHUNK); ix++) {
        const c = this.chunks.get(ix + ',' + iy);
        if (c) ctx.drawImage(c.canvas, ix * CHUNK, iy * CHUNK, CHUNK + 0.5, CHUNK + 0.5);
      }
    drawWater(ctx, this.gen, view, this.time);
  }

  // retângulo do mundo que cobre a vista (com folga para árvores altas abaixo da tela)
  viewToGroundRect(view, margin = 300) {
    const pts = [[view.x0, view.y0], [view.x1, view.y0], [view.x1, view.y1 + 500], [view.x0, view.y1 + 500]].map(([x, y]) => groundFromView(x, y));
    return [
      Math.min(...pts.map((p) => p[0])) - margin, Math.min(...pts.map((p) => p[1])) - margin,
      Math.max(...pts.map((p) => p[0])) + margin, Math.max(...pts.map((p) => p[1])) + margin,
    ];
  }

  drawables(view, player) {
    const out = [];
    const pv = P([player.x, player.y, 40]);
    for (const p of this.propsIn(...this.viewToGroundRect(view))) {
      const [vx, vy] = P([p.x, p.y, 0]);
      // descarte pela caixa real do sprite (altura acima da base e meia-largura)
      const [top, hw] = EXTENT[p.kind];
      if (vx + hw < view.x0 || vx - hw > view.x1 || vy - top > view.y1 || vy + 40 < view.y0) continue;
      out.push({ key: sortKey(p.x, p.y), draw: (ctx) => this.drawProp(ctx, p, vx, vy, pv, player) });
    }
    return out;
  }

  drawProp(ctx, p, vx, vy, pv, player) {
    const t = this.time;
    const a = this.art(p);
    const wind = Math.sin(t * 1.1 + p.x * 0.01) * 0.5 + Math.sin(t * 2.3 + p.y * 0.02) * 0.25;
    const behind = (s, cy) => {
      if (sortKey(player.x, player.y) >= sortKey(p.x, p.y)) return 1;
      const inX = Math.abs(pv[0] - vx) < s.w * 0.45;
      const inY = pv[1] > vy + cy - s.oy && pv[1] < vy + cy + (s.h - s.oy);
      return inX && inY ? 0.4 : 1;
    };
    if (p.kind === 'samauma' || p.kind === 'forest') {
      drawSprite(ctx, a.trunk, vx, vy);
      ctx.globalAlpha = behind(a.canopy, a.canopyY);
      drawSwaying(ctx, a.canopy, vx + (a.canopyX || 0), vy + a.canopyY, wind * (p.kind === 'forest' ? 0.008 : 0.012));
      ctx.globalAlpha = 1;
    } else if (p.kind === 'acai') {
      ctx.globalAlpha = behind(a.trunk, 0) < 1 ? 0.6 : 1;
      drawSprite(ctx, a.trunk, vx, vy);
      ctx.globalAlpha = behind(a.crown, a.crownY);
      drawSwaying(ctx, a.crown, vx, vy + a.crownY, wind * 0.05);
      ctx.globalAlpha = 1;
    } else if (p.kind === 'bush') {
      const shake = p.shake ? Math.max(0, p.shake - (t - p.shakeAt) * 2.5) : 0;
      const sk = wind * 0.03 + Math.sin(t * 30) * shake * 0.12;
      drawSwaying(ctx, a.sprite, vx, vy, sk);
      if (p.fruit && !this.picked.has(p.id)) for (const [fx, fy] of a.fruits) drawFruit(ctx, vx + fx + fy * sk, vy + fy);
    } else if (p.kind === 'rock') {
      drawSprite(ctx, a.sprite, vx, vy);
    }
  }

  // ---------- interação ----------
  nearestFruitBush(x, y, maxD) {
    let best = null, bd = maxD;
    for (const p of this.propsIn(x - maxD, y - maxD, x + maxD, y + maxD)) {
      if (p.kind !== 'bush' || !p.fruit || this.picked.has(p.id)) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  pick(bush, regrow = 25) {
    this.picked.set(bush.id, this.time + regrow);
    bush.shake = 0.6;
    bush.shakeAt = this.time;
  }

  strike(x, y, fx, fy, reach) {
    for (const p of this.propsIn(x - 140, y - 140, x + 140, y + 140)) {
      if (p.kind !== 'bush') continue;
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
      if (d < reach + 30 && (dx * fx + dy * fy) / (d || 1) > 0.2) { p.shake = 1; p.shakeAt = this.time; }
    }
  }
}
