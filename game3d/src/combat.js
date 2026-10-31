import * as THREE from 'three';
import { toonRamp, INK_MATERIAL } from './toon.js';

// Inventário (barra 1–4), armas, corte de árvores e flechas.
// Armas: dano em animais, dano em árvores (o machado derruba rápido), alcance.
export const WEAPONS = {
  facao: { nome: 'Facão', dano: 12, arvore: 1, alcance: 80, melee: true },
  machado: { nome: 'Machado', dano: 18, arvore: 4, alcance: 85, melee: true },
  espada: { nome: 'Espada', dano: 32, arvore: 0.5, alcance: 95, melee: true },
  arco: { nome: 'Arco', dano: 34, arvore: 0, alcance: 0, melee: false },
};
// vida das árvores (golpes de facão) e madeira que cada uma dá
const TREE = { forest: { hp: 12, madeira: 4 }, samauma: { hp: 30, madeira: 10 }, acai: { hp: 5, madeira: 2 } };

export class Inventory {
  constructor() {
    this.slots = ['facao', 'machado', 'espada', 'arco'];
    this.sel = 0;
    this.madeira = 0;
    this.carne = 0;
    this.flechas = 20;
  }
  get atual() {
    return WEAPONS[this.slots[this.sel]];
  }
  get id() {
    return this.slots[this.sel];
  }
  update(input) {
    for (let i = 0; i < this.slots.length; i++) if (input.hit('Digit' + (i + 1), 'Numpad' + (i + 1))) this.sel = i;
  }

  // barra de itens embaixo, recursos ao lado, mira no centro com o arco
  draw(ctx, sw, sh) {
    const S = 54, gap = 8, n = this.slots.length, w = n * S + (n - 1) * gap;
    const x0 = sw / 2 - w / 2, y0 = sh - S - 86;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (S + gap);
      ctx.fillStyle = 'rgba(29,26,18,0.78)';
      ctx.strokeStyle = i === this.sel ? '#f2c14e' : 'rgba(244,234,210,0.35)';
      ctx.lineWidth = i === this.sel ? 3 : 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y0, S, S, 8);
      ctx.fill();
      ctx.stroke();
      icon(ctx, this.slots[i], x + S / 2, y0 + S / 2);
      ctx.fillStyle = 'rgba(244,234,210,0.8)';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(String(i + 1), x + 5, y0 + 13);
      if (this.slots[i] === 'arco') { ctx.textAlign = 'right'; ctx.fillText(String(this.flechas), x + S - 5, y0 + S - 6); ctx.textAlign = 'left'; }
    }
    // nome do item e recursos
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = '#f4ead2';
    ctx.textAlign = 'center';
    ctx.fillText(this.atual.nome, sw / 2, y0 - 8);
    ctx.textAlign = 'left';
    const rx = x0 + w + 18;
    ctx.fillText(`Madeira ${this.madeira}`, rx, y0 + 20);
    ctx.fillText(`Carne ${this.carne}`, rx, y0 + 40);
    if (this.id === 'arco') {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sw / 2, sh / 2, 9, 0, Math.PI * 2);
      ctx.moveTo(sw / 2 - 16, sh / 2); ctx.lineTo(sw / 2 - 5, sh / 2);
      ctx.moveTo(sw / 2 + 5, sh / 2); ctx.lineTo(sw / 2 + 16, sh / 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ícones desenhados por código
function icon(ctx, id, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  ctx.lineCap = 'round';
  const wood = '#8a5a32', steel = '#c9d2c4';
  if (id === 'facao') {
    ctx.strokeStyle = wood; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 16); ctx.lineTo(0, 6); ctx.stroke();
    ctx.fillStyle = steel; ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(4, 6); ctx.lineTo(5, -14); ctx.lineTo(-1, -18); ctx.closePath(); ctx.fill();
  } else if (id === 'machado') {
    ctx.strokeStyle = wood; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(0, -16); ctx.stroke();
    ctx.fillStyle = steel; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(12, -18); ctx.lineTo(12, -4); ctx.lineTo(0, -7); ctx.closePath(); ctx.fill();
  } else if (id === 'espada') {
    ctx.fillStyle = steel; ctx.beginPath(); ctx.moveTo(-3, 4); ctx.lineTo(3, 4); ctx.lineTo(2, -18); ctx.lineTo(0, -22); ctx.lineTo(-2, -18); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#b8862e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-9, 5); ctx.lineTo(9, 5); ctx.stroke();
    ctx.strokeStyle = wood; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(0, 17); ctx.stroke();
  } else if (id === 'arco') {
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = wood; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(8, 0, 18, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
    ctx.strokeStyle = '#e8e2d0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-6, -15); ctx.lineTo(-6, 15); ctx.stroke();
    ctx.strokeStyle = '#d9c9a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.stroke();
  }
  ctx.restore();
}

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _t = new THREE.Matrix4();

export class Combat {
  constructor(scene, world, dinos, inv) {
    this.scene = scene;
    this.world = world;
    this.dinos = dinos;
    this.inv = inv;
    this.treeHp = new Map();
    this.falling = [];
    this.arrows = [];
    this.cooldown = 0;
    this.events = []; // { texto, x, y, z, cor } para os avisos na tela
    const shaft = new THREE.CylinderGeometry(0.9, 0.9, 52, 5);
    shaft.rotateZ(Math.PI / 2);
    const tip = new THREE.ConeGeometry(2.4, 8, 6);
    tip.rotateZ(-Math.PI / 2);
    tip.translate(30, 0, 0);
    this.arrowGeo = { shaft, tip };
    this.arrowMat = { shaft: new THREE.MeshToonMaterial({ color: '#b8915a', gradientMap: toonRamp() }), tip: new THREE.MeshToonMaterial({ color: '#59605a', gradientMap: toonRamp() }) };
  }

  say(texto, x, y, z, cor = '#f29a4b') {
    this.events.push({ texto, x, y, z, cor });
  }

  // golpe corpo a corpo: animal à frente (o mais perto) ou árvore à frente
  strike(p) {
    const w = this.inv.atual, fx = Math.cos(p.angle), fy = Math.sin(p.angle);
    let hitAnimal = false;
    for (const d of this.dinos.list) {
      if (d.dead || !d.pelvis || !d.mouth) continue;
      const ax = d.pelvis[0], ay = d.pelvis[1], bx = d.mouth[0], by = d.mouth[1];
      const t = Math.max(0, Math.min(1, ((p.x - ax) * (bx - ax) + (p.y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)));
      const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t, dd = Math.hypot(cx - p.x, cy - p.y);
      if (dd < (d.bodyR || 40) + w.alcance && ((cx - p.x) * fx + (cy - p.y) * fy) / (dd || 1) > 0.1) {
        this.hitAnimal(d, w.dano, cx, cy, p.z + 120);
        hitAnimal = true;
      }
    }
    if (hitAnimal || !(w.arvore > 0)) return hitAnimal;
    // árvore: tronco à frente, dentro do alcance
    let best = null, bd = Infinity;
    for (const q of this.world.streamer.propsNear(p.x, p.y, 260)) {
      if (!TREE[q.kind] || this.world.cut.has(q.id)) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      const r = (q.collider || 24) + w.alcance;
      if (d < r && (dx * fx + dy * fy) / (d || 1) > 0.15 && d < bd) { bd = d; best = q; }
    }
    if (!best) return false;
    const T = TREE[best.kind];
    const hp = (this.treeHp.has(best.id) ? this.treeHp.get(best.id) : T.hp) - w.arvore;
    this.treeHp.set(best.id, hp);
    if (hp <= 0) {
      this.fell(best, p);
      this.inv.madeira += T.madeira;
      this.say(`Árvore derrubada! +${T.madeira} madeira`, best.x, best.y, (best.z || 0) + 140, '#c9a46a');
    } else this.say(w.arvore >= 3 ? 'Tchac!' : 'Toc', best.x, best.y, (best.z || 0) + 100, '#d8c9a0');
    return true;
  }

  hitAnimal(d, dano, x, y, z) {
    const wasCalm = !d.sp.aggressive && !(d.angry > 0);
    const morreu = d.damage(dano);
    if (morreu) {
      const carne = d.sp.carne || 4;
      this.inv.carne += carne;
      this.say(`${d.sp.nome} abatido! +${carne} carne`, x, y, z, '#9fd16b');
    } else this.say(wasCalm ? `-${dano} — ${d.sp.nome} ficou furioso!` : `-${dano}`, x, y, z, '#e2553d');
  }

  // árvore cai na direção oposta ao jogador e some depois
  fell(q, p) {
    this.world.cut.add(q.id);
    this.world.pool.dirty = true;
    const parts = [];
    this.world.pool.partsOf(q, parts);
    const group = new THREE.Group();
    const meshes = [];
    for (const [name, m] of parts) {
      const e = this.world.pool.entries.get(name);
      if (!e) continue;
      const mat = new THREE.MeshToonMaterial({ map: e.mat.map || null, color: e.mat.map ? '#ffffff' : e.mat.color || '#4a6a3a', gradientMap: toonRamp() });
      for (const [geo, mt] of [[e.geo, mat], [e.inkGeo, INK_MATERIAL]]) {
        if (!geo) continue;
        const mesh = new THREE.Mesh(geo, mt);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = mt !== INK_MATERIAL;
        mesh.userData.base = m.clone();
        group.add(mesh);
        meshes.push(mesh);
      }
    }
    this.scene.add(group);
    const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1;
    this.falling.push({ group, meshes, t: 0, pivot: new THREE.Vector3(q.x, q.z || 0, q.y), axis: new THREE.Vector3(dy / l, 0, -dx / l) });
  }

  // flecha sai do peito na direção da câmera, com gravidade
  shoot(player, camera) {
    if (this.cooldown > 0) return;
    if (this.inv.flechas <= 0) { this.say('Sem flechas', player.x, player.y, player.z + 100); this.cooldown = 0.5; return; }
    this.inv.flechas--;
    this.cooldown = 0.55;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    dir.y += 0.04;
    dir.normalize();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.arrowGeo.shaft, this.arrowMat.shaft), new THREE.Mesh(this.arrowGeo.tip, this.arrowMat.tip));
    const pos = new THREE.Vector3(player.x, player.z + 62, player.y).addScaledVector(dir, 30);
    g.position.copy(pos);
    this.scene.add(g);
    this.arrows.push({ g, pos, vel: dir.multiplyScalar(1700), life: 6, stuck: false });
    player.angle = Math.atan2(dir.z, dir.x);
  }

  update(dt) {
    this.cooldown -= dt;
    // árvores caindo: acelera como de verdade, bate no chão, afunda e some
    for (const f of this.falling) {
      f.t += dt;
      const k = Math.min(1, f.t / 1.7);
      const ang = (Math.PI / 2 - 0.12) * k * k * k;
      const sink = f.t > 3.2 ? (f.t - 3.2) * 60 : 0;
      _q.setFromAxisAngle(f.axis, ang);
      _m.makeTranslation(f.pivot.x, f.pivot.y - sink, f.pivot.z).multiply(_t.makeRotationFromQuaternion(_q)).multiply(new THREE.Matrix4().makeTranslation(-f.pivot.x, -f.pivot.y, -f.pivot.z));
      for (const mesh of f.meshes) mesh.matrix.multiplyMatrices(_m, mesh.userData.base);
      if (f.t > 5) { this.scene.remove(f.group); f.done = true; }
    }
    this.falling = this.falling.filter((f) => !f.done);
    // flechas
    for (const a of this.arrows) {
      a.life -= dt;
      if (a.life <= 0) { this.scene.remove(a.g); a.done = true; continue; }
      if (a.stuck) continue;
      a.vel.y -= 500 * dt;
      const from = a.pos.clone();
      a.pos.addScaledVector(a.vel, dt);
      a.g.position.copy(a.pos);
      a.g.quaternion.setFromUnitVectors(_v.set(1, 0, 0), a.vel.clone().normalize());
      // acertou um animal? (segmento do quadril até a boca, em 3D aproximado)
      for (const d of this.dinos.list) {
        if (d.dead || !d.pelvis || !d.mouth) continue;
        const hit = segDist(from, a.pos, d);
        if (hit) {
          this.hitAnimal(d, WEAPONS.arco.dano, a.pos.x, a.pos.z, a.pos.y + 40);
          this.scene.remove(a.g);
          a.done = true;
          break;
        }
      }
      if (a.done) continue;
      // chão: a flecha crava e fica um tempo
      if (a.pos.y < this.world.groundZ(a.pos.x, a.pos.z)) { a.stuck = true; a.life = Math.min(a.life, 8); }
    }
    this.arrows = this.arrows.filter((a) => !a.done);
  }
}

// a flecha (de "from" até "to", coordenadas three) passou perto do corpo do animal?
function segDist(from, to, d) {
  const r = (d.bodyR || 30) + 10;
  for (let s = 0; s <= 4; s++) {
    const x = from.x + (to.x - from.x) * (s / 4), y = from.z + (to.z - from.z) * (s / 4), z = from.y + (to.y - from.y) * (s / 4);
    const ax = d.pelvis[0], ay = d.pelvis[1], bx = d.mouth[0], by = d.mouth[1];
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)));
    const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t, cz = d.pelvis[2] + (d.mouth[2] - d.pelvis[2]) * t;
    if (Math.hypot(x - cx, y - cy) < r && Math.abs(z - cz) < r * 1.6) return true;
  }
  return false;
}
