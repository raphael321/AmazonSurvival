import { RigBody } from './rigs.js';
import * as THREE from 'three';
import { toonRamp, INK_MATERIAL } from './toon.js';

// Dinossauros da Amazônia ("Ecos do Cretáceo"), desenhados por código:
// esqueleto procedural (coluna em corrente: pescoço, tronco e cauda), pernas com IK de
// dois ossos + metatarso, passo com pé plantado no chão e máquina de estados simples.
// Todas as peças de todos os dinos saem de 2 malhas instanciadas (+ contorno de tinta):
// poucas chamadas de desenho mesmo com vários bichos na tela.
// Coordenadas do jogo: x leste, y sul, z cima. Escala: 1 m ≈ 48 unidades (jogador ≈ 85).

const UPZ = [0, 0, 1];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// IK de dois ossos: joelho no plano que contém o alvo e a direção "pole"
function ik2(A, T, l1, l2, pole) {
  const d = sub(T, A);
  const dist = clamp(len(d), Math.abs(l1 - l2) + 1, l1 + l2 - 0.01);
  const dir = nrm(d);
  const a = (l1 * l1 + dist * dist - l2 * l2) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const pd = nrm(add(pole, dir, -dot(pole, dir)));
  return [add(add(A, dir, a), pd, h), add(A, dir, dist)];
}

// ---------- espécies (proporções tiradas das fichas em refs/CRIATURAS) ----------
export const SPECIES = {
  // onça-pintada: só existe com o modelo rigado (rig-onca.glb); ~2,4 m com a cauda
  onca: {
    nome: 'Onça-pintada', biped: false, rig: 'onca', rigOnly: true, length: 120, walk: 85, run: 420, freq: 1.1, aggressive: true, habitat: 'mata', bite: 15,
    hip: 40, torso: 60, bodyW: 16, bodyH: 20, cor: {},
  },
  pycno: {
    nome: 'Pycnonemosaurus', biped: true, hip: 128, hipW: 26, torso: 150, bodyW: 40, bodyH: 52, chestR: 36,
    neck: [[46, 0.55], [40, 0.35]], neckR: 24, head: { len: 72, h: 34, w: 24, snout: 0.9, jaw: 0.55 },
    tail: { n: 8, len: 240, r: 30 }, leg: [72, 68, 40], legR: 17, arm: [16, 12], armR: 5,
    walk: 72, run: 300, freq: 0.9, aggressive: true, habitat: 'mata', bite: 22, model: 'dino_pycno', length: 430,
    cor: { costas: '#94796e', claro: '#c8b3a1', barriga: '#d7c6b1', escuro: '#5e443d', destaque: '#8b4038', olho: '#1d1a12' },
  },
  oxalaia: {
    nome: 'Oxalaia', biped: true, hip: 150, hipW: 30, torso: 205, bodyW: 42, bodyH: 54, chestR: 38,
    neck: [[48, 0.6], [44, 0.35], [40, 0.05]], neckR: 22, head: { len: 118, h: 26, w: 20, snout: 1.6, jaw: 0.45 },
    tail: { n: 9, len: 320, r: 30 }, leg: [80, 74, 44], legR: 18, arm: [34, 28], armR: 8,
    sail: { h: 78, len: 190 },
    walk: 64, run: 240, freq: 0.8, aggressive: true, habitat: 'rio', swim: true, bite: 28, model: 'dino_oxalaia', length: 560,
    cor: { costas: '#3f3c31', claro: '#cfc293', barriga: '#d8cca1', escuro: '#2a2820', destaque: '#a3342b', olho: '#a3342b' },
  },
  amazon: {
    nome: 'Amazonssauro', biped: false, hip: 150, hipW: 34, torso: 190, bodyW: 56, bodyH: 62, chestR: 48, shoulder: 0.94,
    neck: [[48, 0.95], [46, 0.85], [44, 0.75], [42, 0.62], [40, 0.45], [36, 0.25]], neckR: 22, head: { len: 46, h: 22, w: 18, snout: 0.7, jaw: 0.2 },
    tail: { n: 11, len: 380, r: 40 }, leg: [86, 76, 22], legR: 22, front: [78, 66, 18], frontR: 19,
    walk: 55, run: 130, freq: 0.7, aggressive: false, habitat: 'aberto', herd: 2, bite: 18, model: 'dino_amazon', length: 600, rig: 'amazon', grazer: true,
    cor: { costas: '#7c6748', claro: '#a99272', barriga: '#c1ab88', escuro: '#5b4932', destaque: '#6c573b', olho: '#1d1a12' },
  },
};

// ---------- desenho instanciado ----------
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
const BALL = new THREE.SphereGeometry(1, 16, 10);
const CYL_INK = new THREE.CylinderGeometry(1.08, 1.08, 1, 10, 1, true);
const BALL_INK = new THREE.SphereGeometry(1.07, 16, 10);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _up3 = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();
const T3 = (p, v) => v.set(p[0], p[2], p[1]);

class Crew {
  constructor(scene, cap = 1600) {
    const mat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toonRamp() });
    const mk = (geo, ink) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      m.setColorAt(0, _c.set('#fff'));
      scene.add(m);
      const k = new THREE.InstancedMesh(ink, INK_MATERIAL, cap);
      k.instanceMatrix = m.instanceMatrix;
      k.frustumCulled = false;
      scene.add(k);
      return { m, k, n: 0 };
    };
    this.cyl = mk(CYL, CYL_INK);
    this.ball = mk(BALL, BALL_INK);
    this.cap = cap;
  }
  begin() { this.cyl.n = this.ball.n = 0; }
  put(e, color) {
    if (e.n >= this.cap) return;
    e.m.setMatrixAt(e.n, _m);
    e.m.setColorAt(e.n, _c.set(color));
    e.n++;
  }
  // cilindro de a até b
  seg(a, b, r, color) {
    T3(a, _x); T3(b, _y);
    _z.subVectors(_y, _x);
    const l = _z.length() || 0.001;
    _p.addVectors(_x, _y).multiplyScalar(0.5);
    _q.setFromUnitVectors(_up3, _z.multiplyScalar(1 / l));
    _m.compose(_p, _q, _s.set(r, l, r));
    this.put(this.cyl, color);
  }
  // elipsoide: raio rl ao longo de dir, rw para o lado, rh para cima (roll pelo "up" do mundo)
  ell(c, dir, rl, rw, rh, color, roll = 0) {
    T3(dir, _z).normalize();
    _x.crossVectors(_up3, _z);
    if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
    _x.normalize();
    _y.crossVectors(_z, _x);
    if (roll) { _q.setFromAxisAngle(_z, roll); _x.applyQuaternion(_q); _y.applyQuaternion(_q); }
    _m.makeBasis(_x.multiplyScalar(rw), _y.multiplyScalar(rh), _z.multiplyScalar(rl));
    _m.setPosition(T3(c, _p));
    this.put(this.ball, color);
  }
  ball1(c, r, color) {
    _m.makeScale(r, r, r).setPosition(T3(c, _p));
    this.put(this.ball, color);
  }
  end() {
    for (const e of [this.cyl, this.ball]) {
      e.m.count = e.k.count = e.n;
      e.m.instanceMatrix.needsUpdate = true;
      if (e.m.instanceColor) e.m.instanceColor.needsUpdate = true;
    }
  }
}

// ---------- um dinossauro ----------
let NEXT = 1;
export class Dino {
  constructor(kind, x, y, world) {
    this.id = NEXT++;
    this.kind = kind;
    this.sp = SPECIES[kind];
    this.x = x; this.y = y;
    this.z = world.groundZ(x, y);
    this.a = Math.random() * Math.PI * 2; // direção (rad, no plano)
    this.speed = 0;
    this.want = 0;
    this.phase = Math.random();
    this.t = Math.random() * 10;
    this.state = 'idle';
    this.timer = 1 + Math.random() * 3;
    this.home = [x, y];
    this.target = null;
    this.rest = 0; // 0 em pé → 1 deitado
    this.rear = 0; // empinar (saurópode comendo no alto / terópode rugindo)
    this.jaw = 0;
    this.swim = 0;
    this.biteCd = 0;
    this.scale = 0.9 + Math.random() * 0.2;
    this.feet = null;
  }

  // ---------- comportamento ----------
  okGround(world, x, y) {
    const f = world.field, h = f.H(x, y);
    if (h < -6 && !this.sp.swim) return false;
    if (h > 0 && f.slope(x, y) > 1.1) return false;
    return true;
  }

  pickTarget(world) {
    const sp = this.sp;
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2, r = 250 + Math.random() * 900;
      const x = this.home[0] + Math.cos(a) * r, y = this.home[1] + Math.sin(a) * r;
      if (!this.okGround(world, x, y)) continue;
      const h = world.field.H(x, y);
      // o Oxalaia fica no rio ou na margem; os outros em terra
      if (sp.habitat === 'rio' && h > 40) continue;
      if (sp.habitat !== 'rio' && h < 4) continue;
      return [x, y];
    }
    return null;
  }

  setState(s, t) {
    this.state = s;
    this.timer = t;
  }

  think(dt, world, player) {
    const sp = this.sp;
    const dx = player.x - this.x, dy = player.y - this.y, dp = Math.hypot(dx, dy);
    this.timer -= dt;
    this.biteCd -= dt;
    this.angry = Math.max(0, (this.angry || 0) - dt);
    const hostile = sp.aggressive || this.angry > 0;
    const alert = hostile && dp < (this.angry > 0 ? 900 : sp.habitat === 'rio' ? 600 : 520) && !player.dead && this.state !== 'chase';
    switch (this.state) {
      case 'idle':
        this.want = 0;
        if (alert) { this.setState('roar', 1.6); break; }
        if (this.timer <= 0) {
          const r = Math.random();
          if (r < 0.15) this.setState('rest', 8 + Math.random() * 10);
          else if (sp.grazer && r < 0.4) this.setState('eat', 4 + Math.random() * 3);
          else { this.target = this.pickTarget(world); this.setState(this.target ? 'walk' : 'idle', 12); }
        }
        break;
      case 'walk': {
        if (alert) { this.setState('roar', 1.6); break; }
        if (!this.target || this.timer <= 0) { this.setState('idle', 2 + Math.random() * 4); break; }
        const tx = this.target[0] - this.x, ty = this.target[1] - this.y;
        if (Math.hypot(tx, ty) < 80) { this.setState('idle', 2 + Math.random() * 5); break; }
        this.steer(dt, Math.atan2(ty, tx), sp.walk, world);
        // manso: se afasta do jogador que chega perto demais
        if (!hostile && dp < 220) this.setState('flee', 3);
        break;
      }
      case 'flee':
        this.steer(dt, Math.atan2(-dy, -dx), sp.run, world);
        if (this.timer <= 0) this.setState('idle', 2);
        break;
      case 'rest':
        this.want = 0;
        if (this.timer <= 0 || (alert && this.rest < 0.5)) this.setState('idle', 1);
        if (!hostile && dp < 180) this.setState('flee', 3);
        break;
      case 'eat':
        this.want = 0;
        if (this.timer <= 0 || dp < 200) this.setState('idle', 1);
        break;
      case 'roar':
        // vira para o jogador e ruge antes do ataque (aviso justo)
        this.want = 0;
        this.a += clamp(angDiff(this.a, Math.atan2(dy, dx)), -2.5 * dt, 2.5 * dt);
        if (this.timer <= 0) this.setState('chase', 9);
        break;
      case 'chase': {
        // desiste longe de casa, se o jogador some ou se cansa
        const fromHome = Math.hypot(this.x - this.home[0], this.y - this.home[1]);
        if (dp > 1200 || this.timer <= 0 || fromHome > 2200 || player.dead) { this.target = this.home; this.setState('walk', 20); break; }
        this.steer(dt, Math.atan2(dy, dx), dp < 260 ? sp.run * 0.75 : sp.run, world);
        break;
      }
    }
    // poses suaves
    const restT = this.state === 'rest' ? 1 : 0;
    this.rest += (restT - this.rest) * (1 - Math.exp(-dt * 1.2));
    const rearT = this.state === 'eat' ? 1 : this.state === 'roar' && this.timer > 0.3 ? 0.35 : 0;
    this.rear += (rearT - this.rear) * (1 - Math.exp(-dt * 2));
    const jawT = this.state === 'roar' && this.timer > 0.2 && this.timer < 1.4 ? 1 : this.state === 'chase' && dp < 200 ? 0.7 : this.state === 'eat' ? 0.3 * (Math.sin(this.t * 6) > 0 ? 1 : 0) : 0;
    this.jaw += (jawT - this.jaw) * (1 - Math.exp(-dt * 10));
  }

  steer(dt, ang, speed, world) {
    // olha à frente: se for barranco ou água (para quem não nada), contorna
    let best = ang;
    for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4]) {
      const a = ang + off, look = 140 * this.scale;
      if (this.okGround(world, this.x + Math.cos(a) * look, this.y + Math.sin(a) * look)) { best = a; break; }
      best = null;
    }
    if (best === null) { this.want = 0; this.timer = Math.min(this.timer, 0.5); return; }
    const turn = (this.sp.biped ? 2.2 : 1.1) * dt;
    this.a += clamp(angDiff(this.a, best), -turn, turn);
    this.want = speed * this.scale;
  }

  // levou um golpe: fica bravo por um tempo (herbívoros só atacam assim)
  provoke() {
    this.angry = 25;
    if (this.state !== 'chase') this.setState('roar', 1.2);
  }

  update(dt, world, player) {
    this.t += dt;
    this.think(dt, world, player);
    const sp = this.sp;
    const acc = this.want > this.speed ? 260 : 380;
    this.speed += clamp(this.want - this.speed, -acc * dt, acc * dt);
    const fx = Math.cos(this.a), fy = Math.sin(this.a);
    const nx = this.x + fx * this.speed * dt, ny = this.y + fy * this.speed * dt;
    if (this.speed > 1 && this.okGround(world, nx, ny)) { this.x = nx; this.y = ny; }
    else if (this.speed > 1) this.speed *= 0.5;
    // nadando: corpo afunda até as costas ficarem na linha d'água
    const h = world.field.H(this.x, this.y);
    const swimT = sp.swim && h < -30 ? 1 : 0;
    this.swim += (swimT - this.swim) * (1 - Math.exp(-dt * 2));
    const g = Math.max(0, h);
    this.z += (g - this.z) * (1 - Math.exp(-dt * 12));
    // passo: frequência cresce com a raiz da velocidade (passadas mais longas na corrida)
    const v = this.speed / this.scale;
    const freq = sp.freq * Math.sqrt(Math.max(0.05, v / sp.walk));
    if (v > 2) this.phase = (this.phase + dt * freq) % 1;
    // mordida
    if ((sp.aggressive || this.angry > 0) && this.state === 'chase' && this.biteCd <= 0 && this.mouth) {
      // terópode morde (boca perto); saurópode pisoteia/empurra com o peito (cabeça fica no alto)
      const hit = sp.biped
        ? Math.hypot(player.x - this.mouth[0], player.y - this.mouth[1]) < 90 * this.scale && Math.abs((player.z || 0) + 40 - this.mouth[2]) < 200
        : this.chest && Math.hypot(player.x - this.chest[0], player.y - this.chest[1]) < (this.bodyR || 60) + 70;
      if (hit) {
        this.biteCd = 1.6;
        this.bit = true;
      }
    }
  }

  // ---------- esqueleto e desenho ----------
  draw(crew, world) {
    const sp = this.sp, k = this.scale, C = sp.cor;
    const fwd = [Math.cos(this.a), Math.sin(this.a), 0], side = [-fwd[1], fwd[0], 0];
    const v = this.speed / k;
    const run = clamp((v - sp.walk) / (sp.run - sp.walk), 0, 1);
    const stance = lerp(0.62, 0.4, run);
    const stride = (v / (sp.freq * Math.sqrt(Math.max(0.05, v / sp.walk)))) * stance * k;
    const ph = this.phase;
    const bob = Math.abs(Math.sin(ph * Math.PI * (sp.biped ? 2 : 2))) * (4 + run * 10) * k * Math.min(1, v / 20);
    const rest = this.rest, swim = this.swim;
    // quadril: baixa ao deitar e ao nadar; corrida inclina o corpo para frente
    const hipH = sp.hip * k * (1 - rest * 0.72) - bob - swim * sp.hip * k * 0.9;
    const pelvis = [this.x, this.y, this.z + hipH];
    // inclinação do tronco: empinar (saurópode comendo) gira em torno do quadril
    const pitch = (sp.biped ? -0.06 + run * -0.06 + this.rear * 0.45 : (sp.shoulder ? Math.asin(sp.shoulder - 1) : 0) + this.rear * 0.95) * (1 - rest * 0.8);
    const tdir = [fwd[0] * Math.cos(pitch), fwd[1] * Math.cos(pitch), Math.sin(pitch)];
    const chest = add(pelvis, tdir, sp.torso * k);
    const sway = Math.sin(this.t * 1.3) * 0.08 + Math.sin(ph * Math.PI * 2) * 0.05 * Math.min(1, v / 20);

    // ----- pernas traseiras (e dianteiras no quadrúpede) -----
    const legs = [];
    const L = sp.leg.map((x) => x * k);
    const phases = sp.biped ? [0, 0.5] : [0, 0.5, 0.25, 0.75];
    const legAt = (root, Ls, R, phOff, sideSign, front) => {
      let p = (ph + phOff) % 1, off, lift;
      if (p < stance) { off = stride * (0.5 - p / stance); lift = 0; }
      else { const u = (p - stance) / (1 - stance); off = stride * (-0.5 + u); lift = Math.sin(u * Math.PI) * (12 + run * 22) * k * Math.min(1, v / 15); }
      // deitado: pé dobrado embaixo do corpo
      const under = add(add(root, side, sideSign * (sp.biped ? 0.3 : 0.15) * 0), fwd, (sp.biped ? 0.25 : 0.05) * Ls[0] * rest);
      let foot = add([under[0], under[1], 0], fwd, off * (1 - rest));
      const gz = swim > 0.5 ? root[2] - (Ls[0] + Ls[1]) * 0.7 : world.groundZ(foot[0], foot[1]);
      foot[2] = gz + lift;
      if (swim > 0.5) { // remando
        const pa = Math.sin((this.t * 2 + phOff) * Math.PI * 2);
        foot = add(foot, fwd, pa * 30 * k);
      }
      // metatarso (pé digitígrado nos terópodes; curto e em coluna nos saurópodes)
      const ankle = add(add(foot, UPZ, Ls[2] * (sp.biped ? 0.85 : 0.9)), fwd, -Ls[2] * (sp.biped ? 0.45 : 0.1) * (1 - rest));
      const pole = front ? add(fwd, UPZ, -0.2).map((x) => -x) : add(fwd, UPZ, -0.1);
      const [knee, ank] = ik2(root, ankle, Ls[0], Ls[1], nrm(pole));
      legs.push({ root, knee, ank, foot, R, front });
    };
    for (const s of [-1, 1]) {
      const root = add(add(pelvis, side, s * sp.hipW * k), UPZ, -6 * k);
      legAt(root, L, sp.legR * k, phases[s < 0 ? 0 : 1], s, false);
    }
    if (!sp.biped) {
      const LF = sp.front.map((x) => x * k);
      for (const s of [-1, 1]) {
        const root = add(add(add(chest, side, s * sp.hipW * 0.9 * k), UPZ, -10 * k), tdir, -14 * k);
        // empinado: patas da frente penduradas e dobradas
        if (this.rear > 0.3) {
          const foot = add(add(root, UPZ, -(LF[0] + LF[1]) * 0.75), fwd, 30 * k);
          const [knee, ank] = ik2(root, add(foot, UPZ, LF[2]), LF[0], LF[1], nrm(add(fwd, UPZ, -0.3).map((x) => -x)));
          legs.push({ root, knee, ank, foot, R: sp.frontR * k, front: true });
        } else legAt(root, LF, sp.frontR * k, phases[s < 0 ? 2 : 3], s, true);
      }
    }
    for (const g of legs) {
      crew.seg(g.root, g.knee, g.R, C.costas);
      crew.ball1(g.knee, g.R * 0.95, C.costas);
      crew.seg(g.knee, g.ank, g.R * 0.7, C.costas);
      crew.ball1(g.ank, g.R * 0.62, C.escuro);
      crew.seg(g.ank, g.foot, g.R * 0.5, C.escuro);
      // pé: três dedos (terópode) ou pata redonda (saurópode)
      if (sp.biped) crew.ell(add(add(g.foot, fwd, 9 * k), UPZ, 3 * k), fwd, 16 * k, 10 * k, 5 * k, C.escuro);
      else crew.ell(add(g.foot, UPZ, 4 * k), fwd, g.R * 0.95, g.R * 0.95, 7 * k, C.escuro);
      // coxa grossa colada ao quadril
      if (!g.front) crew.ell(add(g.root, sub(g.knee, g.root), 0.35), sub(g.knee, g.root), L[0] * 0.42, g.R * 1.55, g.R * 1.7, C.costas);
    }

    // ----- tronco -----
    const mid = add(pelvis, tdir, sp.torso * k * 0.5);
    crew.ell(mid, tdir, sp.torso * k * 0.72, sp.bodyW * k, sp.bodyH * k, C.costas);
    crew.ell(add(mid, UPZ, -sp.bodyH * k * 0.35), tdir, sp.torso * k * 0.6, sp.bodyW * k * 0.85, sp.bodyH * k * 0.62, C.barriga);
    crew.ell(add(pelvis, tdir, 6 * k), tdir, sp.bodyW * k * 1.05, sp.bodyW * k * 0.95, sp.bodyH * k * 0.9, C.costas);
    crew.ell(chest, tdir, sp.chestR * k, sp.chestR * k * 0.9, sp.chestR * k * 1.05, C.costas);
    // listras escuras atravessando as costas (como nas fichas)
    for (let s = 0; s < 4; s++) crew.ell(add(add(pelvis, tdir, sp.torso * k * (0.2 + s * 0.2)), UPZ, sp.bodyH * k * 0.55), side, sp.bodyW * k * 0.62, 7 * k, sp.bodyH * k * 0.35, s % 2 ? C.escuro : C.claro);
    // vela do espinossaurídeo
    if (sp.sail) {
      const sc = add(add(mid, tdir, -sp.torso * k * 0.05), UPZ, sp.bodyH * k * 0.45 + sp.sail.h * k * 0.3);
      crew.ell(sc, tdir, sp.sail.len * k * 0.5, 3.5 * k, sp.sail.h * k * 0.66, C.escuro);
      crew.ell(add(sc, UPZ, -sp.sail.h * k * 0.12), tdir, sp.sail.len * k * 0.36, 4.6 * k, sp.sail.h * k * 0.34, C.claro);
    }
    // braços (terópodes): curtíssimos no abelissaurídeo, fortes no espinossaurídeo
    if (sp.arm) {
      for (const s of [-1, 1]) {
        const sh = add(add(chest, side, s * sp.chestR * 0.7 * k), UPZ, -sp.chestR * 0.35 * k);
        const el = add(add(sh, UPZ, -sp.arm[0] * k * 0.8), fwd, sp.arm[0] * k * 0.4);
        const hd = add(add(el, fwd, sp.arm[1] * k * 0.8), UPZ, -sp.arm[1] * k * 0.3 + this.rear * 10 * k);
        crew.seg(sh, el, sp.armR * k, C.costas);
        crew.seg(el, hd, sp.armR * k * 0.8, C.costas);
        crew.ball1(hd, sp.armR * k * 0.9, C.escuro);
      }
    }

    // ----- pescoço e cabeça (corrente) -----
    let p = add(chest, tdir, sp.chestR * k * 0.5), dirN = tdir;
    const lookUp = this.rear * (sp.biped ? 0.5 : 0.2) + (this.state === 'roar' ? 0.25 : 0) - rest * 0.6 - swim * 0.2;
    sp.neck.forEach(([l, rise], i) => {
      const yaw = sway * 0.6;
      const pr = rise + lookUp * (i + 1) / sp.neck.length;
      const fa = this.a + yaw;
      const d = [Math.cos(fa) * Math.cos(pr), Math.sin(fa) * Math.cos(pr), Math.sin(pr)];
      const q = add(p, d, l * k);
      const r0 = sp.neckR * k * (1.25 - (i / sp.neck.length) * 0.45);
      crew.seg(p, q, r0, i % 2 && !sp.biped ? C.claro : C.costas);
      crew.ball1(q, r0 * 0.95, C.costas);
      p = q; dirN = d;
    });
    // cabeça: crânio + focinho + mandíbula articulada
    const H = sp.head, hk = k;
    const hdir = nrm([dirN[0], dirN[1], dirN[2] * 0.25 - 0.18 - (sp.biped ? 0 : 0.35) + this.jaw * 0.15]);
    const skull = add(p, hdir, H.len * hk * 0.3);
    crew.ell(skull, hdir, H.len * hk * 0.36, H.w * hk, H.h * hk, C.costas);
    const snout = add(add(skull, hdir, H.len * hk * 0.45), UPZ, -H.h * hk * 0.15);
    crew.ell(snout, hdir, H.len * hk * 0.38 * H.snout * 0.8, H.w * hk * 0.7, H.h * hk * 0.55, C.costas);
    const jawDir = nrm(add(hdir, UPZ, -this.jaw * H.jaw * 1.4));
    const jawC = add(add(skull, UPZ, -H.h * hk * 0.55), jawDir, H.len * hk * 0.3);
    crew.ell(jawC, jawDir, H.len * hk * 0.42 * Math.max(1, H.snout * 0.75), H.w * hk * 0.62, H.h * hk * 0.32, C.barriga);
    if (this.jaw > 0.2) crew.ell(add(snout, UPZ, -H.h * hk * 0.45), hdir, H.len * hk * 0.3, H.w * hk * 0.45, 3 * hk, '#8e3a34');
    // olhos e crista (abelissaurídeo: cabeça curta e alta com crista)
    const hs = [-hdir[1], hdir[0], 0];
    for (const s of [-1, 1]) crew.ball1(add(add(add(skull, hs, s * H.w * hk * 0.8), UPZ, H.h * hk * 0.35), hdir, H.len * hk * 0.08), (this.state === 'rest' && rest > 0.8 ? 0.6 : 3.2) * hk, C.olho);
    if (sp.habitat === 'mata') crew.ell(add(skull, UPZ, H.h * hk * 0.95), hdir, H.len * hk * 0.32, 5 * hk, 8 * hk, C.destaque);
    if (sp.sail) crew.ell(add(snout, UPZ, H.h * hk * 0.45), hdir, H.len * hk * 0.12, 3 * hk, 6 * hk, C.destaque);
    this.mouth = add(snout, hdir, H.len * hk * 0.3);

    // ----- cauda (corrente com onda) -----
    let tp = add(pelvis, tdir, -sp.bodyW * k * 0.6), tAng = this.a + Math.PI;
    const n = sp.tail.n, segL = (sp.tail.len * k) / n;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const wave = Math.sin(this.t * (1.2 + run * 2) - u * 3) * 0.12 * (0.3 + u) + Math.sin(ph * Math.PI * 2 - u * 2) * 0.06 * Math.min(1, v / 20);
      tAng += wave * 0.5 + (rest > 0.5 ? 0.22 * rest : 0);
      // a cauda desce do quadril e segue quase reta; deitado, encosta no chão
      const drop = -0.25 + u * 0.22 + this.rear * (sp.biped ? 0.1 : -0.2);
      const d = [Math.cos(tAng) * Math.cos(drop), Math.sin(tAng) * Math.cos(drop), Math.sin(drop)];
      let q = add(tp, d, segL);
      const gz = world.groundZ(q[0], q[1]) + sp.tail.r * k * (1 - u) * 0.3;
      if (q[2] < gz) q[2] = gz;
      const r0 = sp.tail.r * k * (1 - u * 0.88);
      crew.seg(tp, q, r0, i % 2 ? C.claro : C.costas);
      crew.ball1(q, r0 * 0.92, i % 2 ? C.claro : C.escuro);
      tp = q;
    }
    this.pelvis = pelvis;
    this.chest = chest;
  }
}

// ---------- gerente: mantém alguns dinos em volta do jogador ----------
export class Dinos {
  constructor(scene, world) {
    this.world = world;
    this.crew = new Crew(scene);
    this.scene = scene;
    this.models = null;
    this.rigs = null;
    this.list = [];
    this.enabled = true;
  }

  spotFor(kind, cx, cy, rMin, rMax) {
    const w = this.world, f = w.field;
    for (let k = 0; k < 400; k++) {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      const h = f.H(x, y), s = f.slope(x, y);
      if (s > 0.5) continue;
      if (kind === 'oxalaia') {
        // margem de rio: terra baixa com água funda a poucos passos
        const near = [[200, 0], [-200, 0], [0, 200], [0, -200]].some(([ox, oy]) => f.H(x + ox, y + oy) < -20);
        if (h > 2 && h < 30 && near) return [x, y];
        continue;
      }
      if (h < 10) continue;
      if ((kind === 'pycno' || kind === 'onca') && !f.forest(x, y) && k < 300) continue;
      if (kind === 'amazon' && f.forest(x, y) && k < 300) continue;
      return [x, y];
    }
    return null;
  }

  spawn(kind, x, y) {
    const d = new Dino(kind, x, y, this.world);
    this.list.push(d);
    return d;
  }

  // um de cada perto do começo, para ver logo
  showcase(px, py) {
    const out = [];
    for (const [kind, r0, r1] of [['amazon', 650, 1000], ['pycno', 900, 1300], ['oxalaia', 600, 1800], ['onca', 500, 800]]) {
      const s = this.spotFor(kind, px, py, r0, r1);
      if (!s) continue;
      out.push(this.spawn(kind, s[0], s[1]));
      if (kind === 'amazon') this.spawn('amazon', s[0] + 160, s[1] + 90).home = out[out.length - 1].home;
    }
    return out;
  }

  update(dt, player, events) {
    if (!this.enabled) { this.crew.begin(); this.crew.end(); return; }
    // longe demais: some; população repõe longe da vista
    this.list = this.list.filter((d) => {
      const keep = Math.hypot(d.x - player.x, d.y - player.y) < 6000;
      if (!keep && d.body) d.body.dispose();
      return keep;
    });
    const want = { amazon: 3, pycno: 1, oxalaia: 1, onca: this.rigs && this.rigs.onca ? 1 : 0 };
    for (const d of this.list) want[d.kind]--;
    for (const kind of Object.keys(want)) if (want[kind] > 0 && Math.random() < dt * 0.3) {
      const s = this.spotFor(kind, player.x, player.y, 2600, 4200);
      if (s) this.spawn(kind, s[0], s[1]);
    }
    this.crew.begin();
    for (const d of this.list) {
      const dist = Math.hypot(d.x - player.x, d.y - player.y);
      d.update(dt, this.world, player);
      if (d.bit) { d.bit = false; events.push({ type: 'mordida', dino: d }); }
      // melhor corpo disponível: rigado (ossos) > modelo animado no shader > procedural
      const rig = this.rigs && d.sp.rig && this.rigs[d.sp.rig];
      if (rig && !(d.body instanceof RigBody)) { if (d.body) d.body.dispose(); d.body = new RigBody(this.scene, rig, d.sp); }
      const model = this.models && this.models[d.sp.model];
      if (model && !d.body) d.body = new ModelBody(this.scene, model, d.sp);
      if (d.body) d.body.update(d, this.world, dist < 4200, dt);
      else if (dist < 4200 && !d.sp.rigOnly) d.draw(this.crew, this.world);
      // o corpo empurra o jogador (quadril e peito)
      if (d.pelvis && dist < 600) for (const c of [d.pelvis, d.chest]) {
        const r = (d.bodyR || d.sp.bodyW * d.scale) + 26;
        const dx = player.x - c[0], dy = player.y - c[1], dd = Math.hypot(dx, dy);
        if (dd < r && dd > 0.01 && (player.z || 0) < c[2] + d.sp.bodyH * d.scale) { player.x = c[0] + (dx / dd) * r; player.y = c[1] + (dy / dd) * r; }
      }
    }
    this.crew.end();
    this.separate(dt);
  }

  // ninguém atravessa ninguém: animais entre si (círculos no quadril e no peito) e contra
  // troncos de árvore e penhascos (círculos do mundo)
  separate() {
    const L = this.list, w = this.world;
    const pts = (d) => {
      const r = (d.bodyR || 30) * 1.15;
      return d.pelvis && d.chest ? [[d.pelvis[0], d.pelvis[1], r], [d.chest[0], d.chest[1], r]] : [[d.x, d.y, r]];
    };
    for (let i = 0; i < L.length; i++)
      for (let j = i + 1; j < L.length; j++) {
        const a = L[i], b = L[j];
        if (Math.abs(a.x - b.x) > 900 || Math.abs(a.y - b.y) > 900) continue;
        for (const [ax, ay, ar] of pts(a)) for (const [bx, by, br] of pts(b)) {
          const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), m = ar + br;
          if (d >= m || d < 0.01) continue;
          // o maior empurra mais: cada um anda a sua parte proporcional
          const push = (m - d) / d, wa = br / m, wb = ar / m;
          a.x -= dx * push * wa; a.y -= dy * push * wa;
          b.x += dx * push * wb; b.y += dy * push * wb;
        }
      }
    for (const d of L) {
      const r0 = (d.bodyR || 30);
      for (const p of w.streamer.propsNear(d.x, d.y, r0 + 400)) {
        const cr = p.kind === 'cliff' ? p.foot * 0.8 : p.collider;
        if (!cr) continue;
        for (const [cx, cy, r] of pts(d)) {
          const dx = cx - p.x, dy = cy - p.y, dd = Math.hypot(dx, dy), m = cr + r * 0.7;
          if (dd >= m || dd < 0.01) continue;
          d.x += (dx / dd) * (m - dd); d.y += (dy / dd) * (m - dd);
        }
      }
    }
  }

  nearest(x, y, r) {
    let best = null, bd = r;
    for (const d of this.list) { const dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = d; } }
    return best;
  }
}

// ---------- modelo da Tripo animado no shader ----------
// O modelo vem parado e sem esqueleto. Medimos nele onde ficam os pés, o quadril, a cauda e o
// pescoço, e o shader de vértice dobra as regiões: cada perna gira em volta do quadril (primeiro
// volta para a vertical, depois balança com o passo e levanta o pé), a cauda ondula, o pescoço
// olha e ergue a cabeça, e deitado as pernas encolhem. Modelo: cabeça em +X, altura em +Y.
const DEFORM_PARS = /* glsl */ `
uniform vec4 uLeg[4];
uniform float uLegN, uPivotY, uHalfW, uPhase, uAmp, uLift, uRest, uTime, uLegBias;
uniform float uTailX, uTailLen, uWag, uTurn, uNeckX, uNeckY, uHeadLen, uLookYaw, uLookPitch, uShake;
`;
const DEFORM = /* glsl */ `
{
  vec3 p = transformed;
  for (int k = 0; k < 4; k++) {
    if (float(k) >= uLegN) break;
    vec4 L = uLeg[k];
    float wx = 1.0 - smoothstep(uHalfW * 0.6, uHalfW, abs(p.x - L.x));
    float ws = smoothstep(-0.01, 0.01, p.z * L.y);
    float wy = 1.0 - smoothstep(uPivotY * 0.6, uPivotY * 1.15, p.y);
    float w = wx * ws * wy;
    if (w <= 0.0) continue;
    float ph = 6.2831853 * (uPhase + L.w);
    float ang = (-L.z + uLegBias + uAmp * sin(ph)) * w;
    vec2 d = vec2(p.x - L.x, p.y - uPivotY);
    float c = cos(ang), sn = sin(ang);
    d = vec2(d.x * c - d.y * sn, d.x * sn + d.y * c);
    float lift = max(0.0, cos(ph)) * uLift * wx * ws * (1.0 - smoothstep(0.0, uPivotY * 0.7, p.y));
    p.x = L.x + d.x;
    p.y = uPivotY + d.y + lift;
    p.y = mix(p.y, uPivotY + (p.y - uPivotY) * 0.25, uRest * w);
  }
  // cauda: onda que corre para a ponta + curva para o lado quando vira
  float tt = clamp((uTailX - p.x) / uTailLen, 0.0, 1.0);
  p.z += (sin(uTime * uWag - tt * 3.0) * 0.07 + uTurn * 0.3) * tt * tt * uTailLen;
  p.y -= uRest * tt * uPivotY * 0.25;
  // pescoço e cabeça: ergue/abaixa em volta da base do pescoço, olha para o lado
  float nt = clamp((p.x - uNeckX) / uHeadLen, 0.0, 1.0);
  nt = nt * nt * (3.0 - 2.0 * nt);
  if (nt > 0.0) {
    vec2 q = vec2(p.x - uNeckX, p.y - uNeckY);
    float pa = uLookPitch * nt, c = cos(pa), sn = sin(pa);
    q = vec2(q.x * c - q.y * sn, q.x * sn + q.y * c);
    p.x = uNeckX + q.x; p.y = uNeckY + q.y;
    p.z += (uLookYaw + uShake * sin(uTime * 34.0) * 0.15) * nt * (p.x - uNeckX);
  }
  p.y -= uRest * uPivotY * 0.75;
  transformed = p;
}
`;

// mede o modelo: pés (agrupados por lado e, no quadrúpede, frente/trás), barriga, cauda, pescoço
function measure(geo, biped) {
  const P = geo.attributes.position;
  let H = 0, x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < P.count; i++) { H = Math.max(H, P.getY(i)); x0 = Math.min(x0, P.getX(i)); x1 = Math.max(x1, P.getX(i)); }
  const L = x1 - x0;
  const feet = [];
  for (let i = 0; i < P.count; i++) if (P.getY(i) < H * 0.06) feet.push([P.getX(i), P.getZ(i)]);
  const groups = [];
  for (const side of [1, -1]) {
    const f = feet.filter((q) => q[1] * side > 0).sort((a, b) => a[0] - b[0]);
    if (!f.length) continue;
    if (biped) groups.push({ side, pts: f });
    else { const m = Math.floor(f.length / 2); groups.push({ side, pts: f.slice(0, m), back: true }, { side, pts: f.slice(m) }); }
  }
  const mean = (a) => a.reduce((s, q) => s + q[0], 0) / Math.max(1, a.length);
  for (const g of groups) g.x = mean(g.pts);
  // quadris: biped = meio entre os dois pés; quadrúpede = meio dos pés de trás e dos da frente
  const hipOf = (gs) => gs.reduce((s, g) => s + g.x, 0) / gs.length;
  const hind = biped ? groups : groups.filter((g) => g.back), front = biped ? [] : groups.filter((g) => !g.back);
  const hindX = hipOf(hind), frontX = front.length ? hipOf(front) : null;
  // barriga: menor altura do corpo perto do quadril, longe das pernas (|z| pequeno)
  let belly = Infinity;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i);
    if (Math.abs(P.getZ(i)) < L * 0.02 && y > H * 0.12 && Math.abs(x - (frontX !== null ? (hindX + frontX) / 2 : hindX)) < L * 0.12) belly = Math.min(belly, y);
  }
  if (!isFinite(belly)) belly = H * 0.33;
  const pivotY = belly * 1.1;
  const legs = groups.map((g, k) => {
    const hx = biped ? hindX : g.back ? hindX : frontX;
    // quadrúpede: o modelo já vem com a passada aberta; endireita só um pouco (senão a coxa entorta)
    return { x: hx, side: g.side, neutral: Math.atan2(g.x - hx, pivotY) * (biped ? 1 : 0.35), off: biped ? (g.side > 0 ? 0 : 0.5) : (g.back ? 0 : 0.25) + (g.side > 0 ? 0 : 0.5) };
  });
  // pescoço: começa um pouco à frente do peito; altura média do corpo ali
  const neckX = biped ? x1 - L * 0.3 : x1 - L * 0.4;
  let ny = 0, nn = 0, hy = 0, hn = 0, ty = 0, tn = 0;
  const tailBase = hindX - L * 0.15;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i);
    if (Math.abs(x - neckX) < L * 0.02) { ny += P.getY(i); nn++; }
    if (Math.abs(x - tailBase) < L * 0.02) { ty += P.getY(i); tn++; }
    if (x > x1 - L * 0.05) { hy += P.getY(i); hn++; }
  }
  return {
    H, L, x0, x1, legs, pivotY, halfW: L * (biped ? 0.14 : 0.1),
    tailX: hindX - L * 0.1, tailLen: hindX - L * 0.1 - x0,
    neckX, neckY: nn ? ny / nn : H * 0.5, headLen: x1 - neckX,
    head: [x1, hn ? hy / hn : H * 0.8], hindX, frontX: frontX ?? x1 - L * 0.35,
    // tronco inclinado na pose do modelo (base da cauda → base do pescoço). Terópode de
    // verdade anda com o corpo quase na horizontal: o excesso é desfeito no jogo.
    tilt: nn && tn ? Math.atan2(ny / nn - ty / tn, neckX - tailBase) : 0,
  };
}

const metaCache = new Map();
class ModelBody {
  constructor(scene, model, sp) {
    this.scene = scene;
    if (!metaCache.has(model)) metaCache.set(model, measure(model.geometry, sp.biped));
    const M = (this.meta = metaCache.get(model));
    this.scale = sp.length / M.L;
    const legs = M.legs.slice(0, 4);
    this.u = {
      uLeg: { value: [0, 1, 2, 3].map((k) => (legs[k] ? new THREE.Vector4(legs[k].x, legs[k].side, legs[k].neutral, legs[k].off) : new THREE.Vector4())) },
      uLegN: { value: legs.length }, uPivotY: { value: M.pivotY }, uHalfW: { value: M.halfW },
      uLegBias: { value: 0 },
      uPhase: { value: 0 }, uAmp: { value: 0 }, uLift: { value: 0 }, uRest: { value: 0 }, uTime: { value: 0 },
      uTailX: { value: M.tailX }, uTailLen: { value: Math.max(0.01, M.tailLen) }, uWag: { value: 1.4 }, uTurn: { value: 0 },
      uNeckX: { value: M.neckX }, uNeckY: { value: M.neckY }, uHeadLen: { value: M.headLen },
      uLookYaw: { value: 0 }, uLookPitch: { value: 0 }, uShake: { value: 0 },
    };
    const patch = (mat) => {
      const m = mat.clone();
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, this.u);
        sh.vertexShader = DEFORM_PARS + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + DEFORM);
      };
      m.customProgramCacheKey = () => 'dino-deform';
      return m;
    };
    this.group = new THREE.Group();
    this.group.rotation.order = 'YZX';
    this.mesh = new THREE.Mesh(model.geometry, patch(model.material));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false; // o shader move vértices para fora da caixa original
    if (!model.inkGeo) model.inkGeo = inkOf(model.geometry, 1.8 / this.scale);
    this.ink = new THREE.Mesh(model.inkGeo, patch(INK_MATERIAL));
    this.ink.frustumCulled = false;
    this.group.add(this.mesh, this.ink);
    this.group.scale.setScalar(this.scale);
    scene.add(this.group);
    this.prevA = null;
  }

  dispose() {
    this.scene.remove(this.group);
  }

  // posiciona o modelo e alimenta o shader com o estado do bicho
  update(d, world, visible) {
    this.group.visible = visible;
    const M = this.meta, sp = d.sp, k = this.scale * d.scale;
    this.group.scale.setScalar(k);
    const fx = Math.cos(d.a), fy = Math.sin(d.a);
    const v = d.speed / d.scale;
    const run = clamp((v - sp.walk) / (sp.run - sp.walk), 0, 1);
    const moving = Math.min(1, v / 18);
    // inclina o corpo com o terreno (frente e trás)
    // medido num trecho longo (do quadril até perto da cabeça) e limitado: terreno irregular não o deixa em pé
    const hb = (M.hindX - M.L * 0.12) * k, hf = (M.hindX + M.L * 0.3) * k;
    const gB = world.groundZ(d.x + fx * hb, d.y + fy * hb), gF = world.groundZ(d.x + fx * hf, d.y + fy * hf);
    // bípedes mantêm o corpo quase nivelado na encosta; quadrúpedes acompanham mais o chão
    const lim = sp.biped ? 0.12 : 0.25;
    const slopeT = clamp(Math.atan2(gF - gB, hf - hb), -lim, lim) * (1 - d.swim);
    this.pitch = this.pitch === undefined ? slopeT : this.pitch + (slopeT - this.pitch) * 0.1;
    const pitch = this.pitch;
    const gC = world.groundZ(d.x + fx * M.hindX * k, d.y + fy * M.hindX * k);
    const bob = Math.abs(Math.sin(d.phase * Math.PI * 2)) * (2 + run * 8) * moving * k / this.scale;
    // pés um pouco enterrados (não flutuam); nadando, só as costas ficam fora d'água
    this.group.position.set(d.x, Math.min(gC, (gB + gF) / 2) - 4 - d.swim * M.pivotY * k * 0.95 - bob, d.y);
    const fix = sp.biped ? Math.max(0, M.tilt - 0.12) : 0;
    this.u.uLegBias.value = fix;
    this.group.rotation.set(0, -d.a, pitch - fix);
    // shader
    const u = this.u;
    u.uTime.value = d.t;
    u.uPhase.value = d.phase;
    u.uAmp.value = (sp.biped ? 0.32 + run * 0.22 : 0.16 + run * 0.12) * moving * (1 - d.rest);
    u.uLift.value = (0.05 + run * 0.06) * M.H * moving * (1 - d.rest);
    u.uRest.value = d.rest;
    u.uWag.value = 1.2 + run * 3;
    const turn = this.prevA === null ? 0 : angDiff(this.prevA, d.a);
    this.prevA = d.a;
    u.uTurn.value += (clamp(-turn * 18, -0.6, 0.6) - u.uTurn.value) * 0.1;
    // pescoço: ruge erguendo a cabeça; saurópode pasta abaixando; deitado, cabeça no chão
    const roar = d.state === 'roar' ? 1 : 0;
    const eat = d.state === 'eat' ? 1 : 0;
    const pitchT = roar * 0.22 - eat * (sp.biped ? 0.3 : 0.7) - d.rest * 0.35 + Math.sin(d.t * 0.7) * 0.04;
    u.uLookPitch.value += (pitchT - u.uLookPitch.value) * 0.08;
    u.uLookYaw.value += (Math.sin(d.t * 0.4 + d.id) * 0.18 * (1 - moving) - u.uLookYaw.value) * 0.05;
    u.uShake.value = roar * (d.timer < 1.3 && d.timer > 0.2 ? 1 : 0);
    // pontos do corpo no mundo (boca para a mordida, quadril e peito para empurrar o jogador)
    const toWorld = (mx, my) => [d.x + fx * mx * k, d.y + fy * mx * k, this.group.position.y + my * k];
    d.mouth = toWorld(M.head[0], M.head[1]);
    d.pelvis = toWorld(M.hindX, M.pivotY);
    d.chest = toWorld(M.frontX, M.pivotY);
    d.bodyR = M.H * 0.3 * k;
  }
}

// contorno de tinta: cópia inflada pela normal
function inkOf(geometry, t) {
  const g = geometry.clone();
  const pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + nor.getX(i) * t, pos.getY(i) + nor.getY(i) * t, pos.getZ(i) + nor.getZ(i) * t);
  return g;
}
