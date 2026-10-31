import { Field, T } from './field.js';
import { TerrainStreamer } from './terrain3d.js';
import { PropPool } from './props3d.js';
import { inflate } from './assets.js';
import { Bridges } from './bridges3d.js';
import { Physics } from './physics3d.js';

// Mundo 3D com a MESMA interface que o Player e a Capybara do 2D usam
// (resolve, isFree, groundZ, findSpawn): a lógica deles roda aqui sem mudanças.
export class World3D {
  constructor(scene, params) {
    this.scene = scene;
    this.time = 0;
    this.picked = new Map();
    this.extras = []; // objetos fora do gerador (ex.: vitrine perto do início)
    this.fixed = []; // objetos fixos de lugares especiais (pedras da cachoeira)
    this.clearZones = []; // áreas sem árvores/objetos do gerador (ex.: água da cachoeira)
    this.pool = new PropPool(scene);
    this.bridges = new Bridges(this);
    this.physics = new Physics(this);
    this.streamer = new TerrainStreamer(scene, this);
    this.setParams(params);
  }

  setParams(params) {
    this.field = new Field(params);
    this.params = this.field.p;
    this.bridges.clear();
    this.streamer.clear();
  }

  // chão: sobre a água a superfície é 0 (o jogador não entra no fundo)
  // chão do terreno (sem malhas); para entidades use groundAt/stepZ, que incluem a física
  groundZ(x, y) {
    return Math.max(0, this.field.H(x, y));
  }

  groundAt(x, y, z) {
    return this.physics.groundAt(x, y, z);
  }

  stepZ(e, dt) {
    return this.physics.stepZ(e, dt);
  }

  // terreno pisável (a ponte e outras malhas entram pela física em resolve)
  walkable(x, y) {
    const h = this.field.H(x, y);
    if (h < -6) return false; // água funda (mata fechada é andável: só os troncos colidem)
    return this.field.slope(x, y) <= this.params.maxSlope;
  }

  colliders(x, y) {
    const near = this.streamer.propsNear(x, y, 160);
    for (const p of this.extras) if (Math.abs(p.x - x) < 200 && Math.abs(p.y - y) < 200) near.push(p);
    return near.filter((p) => p.collider);
  }

  resolve(e, rad, px, py) {
    if (e.noclip) return;
    const bodies = this.physics.bodiesNear(e.x, e.y);
    const z = e.z || 0;
    // pisável: terreno bom OU uma malha embaixo do pé (tabuleiro da ponte sobre o rio)
    // água funda: checada em volta do corpo. Inclinação: só no centro e só para SUBIR
    // (subida / passo dado acima do limite = barranco); descer qualquer encosta é livre.
    // água é atravessável a nado; a altura que conta é a da superfície (0) sobre a água
    const surf = (x, y) => Math.max(0, this.field.H(x, y));
    const hHere = surf(px, py);
    const climbOk = (x, y) => {
      if (bodies.length > 0 && this.physics.hasFooting(x, y, z, bodies)) return true; // ponte, pedra, etc.
      const step = Math.hypot(x - px, y - py);
      // nadando dá para escalar a margem para sair do rio
      const limit = e.swimming ? 2.5 : this.params.maxSlope;
      return surf(x, y) - hHere <= limit * step + 0.5;
    };
    const ok = climbOk;
    if (!ok(e.x, e.y)) {
      if (ok(e.x, py)) e.y = py;
      else if (ok(px, e.y)) e.x = px;
      else { e.x = px; e.y = py; }
    }
    for (const c of this.colliders(e.x, e.y)) {
      const dx = e.x - c.x, dy = e.y - c.y;
      const d = Math.hypot(dx, dy), m = c.collider + rad;
      if (d < m && d > 0.001) {
        const nx = c.x + (dx / d) * m, ny = c.y + (dy / d) * m;
        if (ok(nx, ny)) { e.x = nx; e.y = ny; } else { e.x = px; e.y = py; }
      }
    }
    // paredes, estacas, bancada, pedras: a cápsula é empurrada pela forma real
    if (bodies.length) this.physics.pushOut(e, rad, e.height || 80, bodies);
  }

  isFree(x, y, rad) {
    for (const [dx, dy] of [[-rad, 0], [rad, 0], [0, -rad], [0, rad], [0, 0]]) if (!this.walkable(x + dx, y + dy)) return false;
    if (this.field.H(x, y) < 2) return false;
    return this.colliders(x, y).every((c) => Math.hypot(x - c.x, y - c.y) > c.collider + rad);
  }

  findSpawn(x, y) {
    const i0 = Math.floor(x / T), j0 = Math.floor(y / T);
    for (let r = 0; r < 200; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const cx = (i0 + di + 0.5) * T, cy = (j0 + dj + 0.5) * T;
          // chão livre e plano, sem samaúma colada (a câmera em 3ª pessoa precisa de espaço)
          // clareira (fora da mata fechada) para a câmera ter espaço
          if (this.isFree(cx, cy, 40) && this.field.slope(cx, cy) < 0.4 && (r > 120 || !this.field.forest(cx, cy)) && !this.streamer.propsNear(cx, cy, 400).some((p) => (p.kind === 'samauma' && Math.hypot(p.x - cx, p.y - cy) < 260) || (p.kind === 'cliff' && Math.hypot(p.x - cx, p.y - cy) < p.foot + 80))) return [cx, cy];
        }
    return [x, y];
  }

  inClearZone(x, y) {
    for (const z of this.clearZones) if (Math.hypot(x - z.x, y - z.y) < z.r) return true;
    return false;
  }

  setModels(models) {
    this.pool.setModels(models, inflate);
  }

  update(dt, x, y) {
    this.time += dt;
    this.streamer.update(x, y);
    // camu-camu volta a dar fruto
    for (const [id, t] of this.picked) {
      if (t > this.time) continue;
      this.picked.delete(id);
      const p = this.streamer.propsNear(x, y, 4000).find((q) => q.id === id);
      if (p) { p.picked = false; this.pool.dirty = true; }
    }
    // instâncias refeitas quando chunks mudam ou o jogador anda um pouco (distância de desenho)
    const c0 = this.pool.center;
    if (this.pool.dirty || !c0 || Math.hypot(x - c0[0], y - c0[1]) > 250) {
      const all = [];
      for (const c of this.streamer.chunks.values()) for (const p of c.props.list) all.push(p);
      all.push(...this.extras);
      // pontes dos chunks carregados
      for (const c of this.streamer.chunks.values()) {
        if (c.lod >= 2) continue; // chunks distantes: só relevo
        const b = this.bridges.forChunk(c.i, c.j);
        if (b) all.push(b.prop || (b.prop = { id: b.id, kind: 'bridge', x: b.x, y: b.y, z: b.deckZ, bridge: b }));
      }
      this.pool.rebuild(all, x, y);
    }
  }

  nearestFruitBush(x, y, maxD) {
    let best = null, bd = maxD;
    for (const p of this.streamer.propsNear(x, y, maxD)) {
      if (p.kind !== 'bush' || !p.fruit || this.picked.has(p.id)) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  pick(bush, regrow = 25) {
    this.picked.set(bush.id, this.time + regrow);
    bush.picked = true;
    this.pool.dirty = true;
  }

  // vitrine: um de cada construção numa fileira à frente do ponto inicial
  addShowcase(x, y, variants) {
    this.extras = [...this.fixed];
    variants.forEach((variant, k) => {
      // em diagonal na tela (sudeste no mundo), afastados uns dos outros
      let px = x + 260 + k * 230, py = y + 120 + k * 60;
      [px, py] = this.findSpawn(px, py);
      this.extras.push({ id: 'vitrine' + k, kind: 'build', x: px, y: py, z: this.field.H(px, py), variant, shadow: 40 });
    });
    this.pool.dirty = true;
  }

  strike() {}
}
