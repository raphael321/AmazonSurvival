import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { toonRamp, INK_MATERIAL } from './toon.js';
import { terrainHole, terrainHoleB } from './terrain3d.js';
import { inflate } from './assets.js';

// Caverna "híbrida": a boca (modelo da Tripo) fica no chão; o terreno ganha um buraco embaixo
// dela e um túnel gerado por código desce por baixo do morro até um salão. Sem tela de
// carregamento: entra andando. Dentro, a física e a câmera usam a malha da caverna (o terreno
// lá em cima vira teto), a luz do sol some e uma tocha ilumina.
// Coordenadas do jogo: x leste, y sul, z cima; three = (x, z, y).

const T3 = (x, y, z) => new THREE.Vector3(x, z, y);

function hash(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j;
  const u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}

export class Cave {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.ready = false;
    this.size = 600; // largura da boca no jogo (o arco tem ~200 de vão)
  }

  // ponto plano em terra, perto do início, com o morro subindo atrás (o túnel fica enterrado)
  find(sx, sy) {
    const f = this.world.field;
    let best = null;
    for (let r = 500; r <= 2600; r += 150)
      for (let a = 0; a < Math.PI * 2; a += 0.2) {
        const x = sx + Math.cos(a) * r, y = sy + Math.sin(a) * r, h = f.H(x, y);
        if (h < 12 || f.slope(x, y) > 0.35 || this.world.inClearZone(x, y)) continue;
        // a boca olha para o jogador; o morro (para dentro) precisa ser mais alto
        const ix = -Math.cos(a), iy = -Math.sin(a); // de frente para o início
        const back = [500, 800, 1100].map((d) => f.H(x - ix * d, y - iy * d));
        const rise = Math.min(...back) - h;
        if (rise < -40) continue;
        const score = rise - r * 0.05;
        if (!best || score > best.score) best = { score, x, y, h, front: [ix, iy] };
      }
    return best;
  }

  build(site, models) {
    const f = this.world.field, S = this.size;
    this.site = site;
    const [fx, fy] = site.front, inx = -fx, iny = -fy;
    const mx = site.x, my = site.y, h0 = site.h;
    // ---- caminho do túnel: entra pela boca descendo forte, faz curva e chega ao salão ----
    const path = [];
    const R = 105; // raio do túnel
    const HR0 = 560; // raio do salão (o mesmo de baixo)
    // começa já dentro do arco (a ponta não sai para fora da boca)
    let x = mx + fx * S * 0.34, y = my + fy * S * 0.34, dir = Math.atan2(iny, inx);
    // o piso do túnel começa na altura do chão em frente ao arco (o terreno pode descer ali)
    let floor = Math.min(h0, f.H(x, y));
    this.mouthZ = floor - 6;
    const turn = (hash(mx, my) < 0.5 ? 1 : -1) * 0.0011;
    for (let s = 0; s <= 1700; s += 40) {
      // boca no nível do chão; depois desce (0,5 dentro do morro, 0,3 adiante)
      const desc = s < 60 ? 0 : s < 700 ? 0.5 : 0.3;
      if (s > 0) {
        floor -= 40 * desc;
        if (s > 700) dir += turn * 40;
        x += Math.cos(dir) * 40;
        y += Math.sin(dir) * 40;
      }
      // fundo o bastante: o teto do túnel nunca sai na superfície
      if (s > 400) floor = Math.min(floor, f.H(x, y) - R * 2.2 - 50);
      if (path.length) floor = Math.min(floor, path[path.length - 1].floor);
      path.push({ x, y, floor, dir });
    }
    // ---- salão no fim do túnel: a parede dele fica exatamente onde o túnel termina ----
    const end = path[path.length - 1];
    const HR = 560, HH = 250; // raios do salão (largura, altura)
    const hc0 = [end.x + Math.cos(end.dir) * (HR * 0.85 + 160), end.y + Math.sin(end.dir) * (HR * 0.85 + 160)];
    let minSurf = Infinity;
    for (let a = 0; a < 6.28; a += 0.5) for (const r of [0, HR * 0.5, HR]) minSurf = Math.min(minSurf, f.H(hc0[0] + Math.cos(a) * r, hc0[1] + Math.sin(a) * r));
    const hallFloor = Math.min(end.floor, minSurf - HH * 1.6 - 60);
    // rampa final até o piso do salão
    for (let k = 1; k <= 4; k++) path.push({ x: end.x + Math.cos(end.dir) * 40 * k, y: end.y + Math.sin(end.dir) * 40 * k, floor: end.floor + (hallFloor - end.floor) * (k / 4), dir: end.dir });
    const last = path[path.length - 1];
    const hc = [last.x + Math.cos(last.dir) * HR * 0.85, last.y + Math.sin(last.dir) * HR * 0.85];
    // dois anéis a mais, já no piso do salão: o túnel atravessa a parede (sem fresta)
    for (let k = 1; k <= 2; k++) path.push({ x: last.x + Math.cos(last.dir) * 50 * k, y: last.y + Math.sin(last.dir) * 50 * k, floor: hallFloor, dir: last.dir });
    this.path = path;
    this.hall = { x: hc[0], y: hc[1], floor: hallFloor, r: HR, h: HH };

    // ---- malha: túnel (anéis com piso achatado) + salão (elipsoide com abertura) ----
    const pos = [], col = [], idx = [];
    const SEG = 20;
    const rock = new THREE.Color('#5d554a'), rockDark = new THREE.Color('#3b352d'), mud = new THREE.Color('#4a3d2c'), c = new THREE.Color();
    const pushV = (X, Y, Z, floorish, n) => {
      pos.push(X, Z, Y); // three
      c.copy(floorish ? mud : rockDark).lerp(rock, n);
      col.push(c.r, c.g, c.b);
    };
    path.forEach((p, i) => {
      const sx = -Math.sin(p.dir), sy = Math.cos(p.dir);
      for (let k = 0; k < SEG; k++) {
        const a = (k / SEG) * Math.PI * 2, n = vnoise(i * 0.35, k * 0.6);
        const rw = R * (0.9 + 0.3 * n), rh = R * (0.95 + 0.25 * vnoise(i * 0.3 + 7, k * 0.5));
        let up = Math.sin(a) * rh;
        const floorish = up < -0.5 * rh;
        if (floorish) up = -0.5 * rh; // piso plano para andar
        const cz = p.floor + 0.5 * rh;
        pushV(p.x + sx * Math.cos(a) * rw, p.y + sy * Math.cos(a) * rw, cz + up, floorish, n);
      }
    });
    const hcx = path[path.length - 1].x + Math.cos(path[path.length - 1].dir) * HR0 * 0.85, hcy = path[path.length - 1].y + Math.sin(path[path.length - 1].dir) * HR0 * 0.85;
    for (let i = 0; i < path.length - 1; i++)
      for (let k = 0; k < SEG; k++) {
        const a = i * SEG + k, b = i * SEG + ((k + 1) % SEG), c2 = (i + 1) * SEG + k, d = (i + 1) * SEG + ((k + 1) % SEG);
        // anel que já entrou no salão vira "parede solta" lá dentro: fica de fora
        const cx = (pos[a * 3] + pos[d * 3]) / 2, cy = (pos[a * 3 + 2] + pos[d * 3 + 2]) / 2;
        if (Math.hypot(cx - hcx, cy - hcy) < HR0 * 0.62) continue;
        idx.push(a, c2, b, b, c2, d);
      }
    // salão: esfera achatada com ruído; piso plano; abertura onde o túnel chega
    const base = pos.length / 3, NU = 40, NV = 22;
    const tunnelEnd = path[path.length - 3]; // onde o túnel cruza a parede do salão
    const hallVerts = [];
    for (let v = 0; v <= NV; v++)
      for (let u = 0; u <= NU; u++) {
        const th = (u / NU) * Math.PI * 2, ph = (v / NV) * Math.PI - Math.PI / 2;
        const n = vnoise(u * 0.4, v * 0.5) * 0.18 + vnoise(u * 1.3, v * 1.6) * 0.08;
        let X = hc[0] + Math.cos(th) * Math.cos(ph) * HR * (0.85 + n), Y = hc[1] + Math.sin(th) * Math.cos(ph) * HR * (0.85 + n);
        let Z = Math.sin(ph) * HH * (0.9 + n * 0.8);
        const floorish = Z < -0.55 * HH;
        if (floorish) Z = -0.55 * HH;
        Z += hallFloor + 0.55 * HH;
        hallVerts.push([X, Y, Z]);
        pushV(X, Y, Z, floorish, n * 2);
      }
    for (let v = 0; v < NV; v++)
      for (let u = 0; u < NU; u++) {
        const a = base + v * (NU + 1) + u, b = a + 1, c2 = a + NU + 1, d = c2 + 1;
        // abertura: tira as faces perto da boca do túnel
        const q = hallVerts[v * (NU + 1) + u];
        // (só parede: o piso do salão continua inteiro)
        if (q[2] > hallFloor + 2 && Math.hypot(q[0] - tunnelEnd.x, q[1] - tunnelEnd.y, q[2] - (tunnelEnd.floor + R * 0.5)) < R * 0.92) continue;
        idx.push(a, b, c2, b, d, c2);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
    this.bvh = new MeshBVH(geo);
    this.body = { model: { geometry: geo }, bvh: this.bvh, m: new THREE.Matrix4(), inv: new THREE.Matrix4(), s: 1, cave: true };

    // ---- enfeites: estalactites, estalagmites e cristais que brilham ----
    this.decorate();
    // ---- boca: modelo da Tripo, de frente para o início ----
    this.mouth = { x: mx, y: my, z: this.mouthZ, rot: Math.atan2(fx, fy) };
    const p0 = path[0];
    let pB = path[path.length - 1];
    for (const q of path) if (q.floor + R * 1.9 < f.H(q.x, q.y) - 20) { pB = q; break; }
    // o buraco começa um pouco depois do 1º anel: até ali o próprio chão segura o jogador
    this.holeA = [p0.x + Math.cos(p0.dir) * 45, p0.y + Math.sin(p0.dir) * 45];
    this.holeB = [pB.x, pB.y];
    this.holeR = R * 1.08;
    terrainHole.value.set(this.holeA[0], this.holeA[1], this.holeR);
    terrainHoleB.value.set(this.holeB[0], this.holeB[1]);
    if (models) this.setModels(models);
    // tocha do jogador (acende dentro)
    this.torch = new THREE.PointLight('#ffb35a', 0, 1400, 1.1);
    this.scene.add(this.torch);
    this.ready = true;
    return this;
  }

  setModels(models) {
    const m = models.boca_caverna;
    if (!m || this.mouthMesh || !this.mouth) return;
    const k = this.size / m.size.x;
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(m.geometry, m.material);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh, new THREE.Mesh(inflate(m.geometry, 1.6 / k), INK_MATERIAL));
    g.position.set(this.mouth.x, this.mouth.z, this.mouth.y);
    g.rotation.y = this.mouth.rot;
    g.scale.setScalar(k);
    g.updateMatrixWorld(true);
    this.scene.add(g);
    this.mouthMesh = g;
    // paredes da boca também colidem (forma real)
    const mm = g.matrixWorld.clone();
    this.mouthBody = { model: m, bvh: new MeshBVH(m.geometry), m: mm, inv: mm.clone().invert(), s: k };
  }

  decorate() {
    const { x, y, floor, r, h } = this.hall;
    const cone = new THREE.ConeGeometry(1, 1, 7);
    const stoneMat = new THREE.MeshToonMaterial({ color: '#6a6052', gradientMap: toonRamp() });
    const crystalMat = new THREE.MeshBasicMaterial({ color: '#7fe3ff' });
    const crystal2 = new THREE.MeshBasicMaterial({ color: '#c79bff' });
    const g = new THREE.Group();
    const ceilAt = (px, py) => floor + 0.55 * h + h * 0.85 * Math.sqrt(Math.max(0, 1 - ((px - x) ** 2 + (py - y) ** 2) / (r * r * 0.7)));
    for (let i = 0; i < 46; i++) {
      const a = hash(i, 3) * 6.28, d = Math.sqrt(hash(i, 5)) * r * 0.7, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      const len = 40 + hash(i, 9) * 90, w = 10 + hash(i, 11) * 14;
      const down = new THREE.Mesh(cone, stoneMat);
      down.scale.set(w, len, w);
      down.rotation.x = Math.PI;
      down.position.copy(T3(px, py, ceilAt(px, py) - len / 2 + 10));
      g.add(down);
      if (i % 2 === 0) {
        const up = new THREE.Mesh(cone, stoneMat);
        up.scale.set(w * 1.2, len * 0.7, w * 1.2);
        up.position.copy(T3(px + 30, py - 20, floor + len * 0.35 - 4));
        g.add(up);
      }
    }
    // aglomerados de cristal com luz própria (ajudam a enxergar o salão)
    this.crystals = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28 + 0.4, d = r * (0.45 + hash(i, 21) * 0.2), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      for (let k = 0; k < 5; k++) {
        const m = new THREE.Mesh(cone, i % 2 ? crystal2 : crystalMat);
        const s = 8 + hash(i, k) * 10;
        m.scale.set(s, s * 4, s);
        m.position.copy(T3(px + (hash(k, i) - 0.5) * 40, py + (hash(i + 5, k) - 0.5) * 40, floor + s * 1.5));
        m.rotation.set((hash(k, 2) - 0.5) * 0.8, 0, (hash(2, k) - 0.5) * 0.8);
        g.add(m);
      }
      if (i % 2 === 0) {
        const L = new THREE.PointLight(i % 4 ? '#c79bff' : '#7fe3ff', 7, 1000, 1.1);
        L.position.copy(T3(px, py, floor + 60));
        g.add(L);
        this.crystals.push(L);
      }
    }
    this.scene.add(g);
    this.deco = g;
  }

  // dentro da caverna? (perto do túnel/salão e abaixo da superfície, ou no buraco da boca)
  inside(x, y, z) {
    if (!this.ready) return false;
    const f = this.world.field;
    const H = f.H(x, y);
    if (this.inHole(x, y) && z < H + 40) return true;
    if (z > H - 30) return false;
    const hl = this.hall;
    if (Math.hypot(x - hl.x, y - hl.y) < hl.r * 1.2) return true;
    for (const p of this.path) if (Math.abs(p.x - x) < 180 && Math.abs(p.y - y) < 180) return true;
    return false;
  }

  inHole(x, y) {
    const [ax, ay] = this.holeA, [bx, by] = this.holeB;
    const t0 = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1);
    if (t0 <= 0) return false; // começo reto, igual ao buraco desenhado
    const t = Math.min(1, t0);
    return Math.hypot(x - (ax + (bx - ax) * t), y - (ay + (by - ay) * t)) < this.holeR;
  }

  // perto (no plano) do túnel, do salão ou da boca
  near2D(x, y, pad = 0) {
    if (!this.ready) return false;
    if (Math.hypot(x - this.mouth.x, y - this.mouth.y) < this.size + pad) return true;
    const hl = this.hall;
    if (Math.hypot(x - hl.x, y - hl.y) < hl.r * 1.2 + pad) return true;
    for (const p of this.path) if (Math.abs(p.x - x) < 180 + pad && Math.abs(p.y - y) < 180 + pad) return true;
    return false;
  }

  // chão da caverna sob o ponto (raio de cima para baixo na malha)
  floorAt(x, y, z) {
    const ray = new THREE.Ray(new THREE.Vector3(x, z + 60, y), new THREE.Vector3(0, -1, 0));
    const hit = this.bvh.raycastFirst(ray, THREE.DoubleSide);
    return hit ? hit.point.y : -Infinity;
  }

  // onde andam as criaturas da caverna
  walkable(x, y) {
    const hl = this.hall;
    return Math.hypot(x - hl.x, y - hl.y) < hl.r * 0.7;
  }

  // câmera não atravessa a rocha: distância livre de "from" na direção "dir" (three)
  rayFree(from, dir, maxD) {
    const hit = this.bvh.raycastFirst(new THREE.Ray(from, dir), THREE.DoubleSide);
    return hit && hit.distance < maxD ? Math.max(40, hit.distance - 18) : maxD;
  }

  // luz e clima: escurece conforme entra, tocha acende
  update(dt, player, light) {
    if (!this.ready) return 0;
    const inside = this.inside(player.x, player.y, player.z);
    const depth = inside ? Math.max(0, this.world.field.H(player.x, player.y) - player.z) : 0;
    const target = inside ? Math.min(1, 0.35 + depth / 220) : 0;
    this.f = (this.f || 0) + (target - (this.f || 0)) * (1 - Math.exp(-dt * 2.5));
    const f = this.f;
    this.torch.intensity = f * 16;
    this.torch.position.set(player.x + 20, player.z + 95, player.y + 10);
    light.hemi.intensity = light.hemiBase * (1 - f * 0.72); // um pouco de luz difusa: dá para ver as formas
    light.sun.intensity = light.sunBase * (1 - f * 0.97);
    light.fog.color.copy(light.fogBase).lerp(new THREE.Color('#231d17'), f);
    light.fog.density = light.fogDensity + f * 0.00025;
    for (const L of this.crystals) L.intensity = 7 * (0.85 + Math.sin(performance.now() * 0.002 + L.id) * 0.15);
    return f;
  }
}
