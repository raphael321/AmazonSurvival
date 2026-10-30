import { Rig } from '../skeleton/rig.js';
import { solveTwoBone } from '../skeleton/ik.js';
import { v3, angleLerp, clamp, lerp, easeInOut, easeOut } from '../engine/math.js';
import { screenDirToWorld } from '../engine/projection.js';

const PELVIS = 34;
const ARM = [14, 14];

// Golpe de facão: antecipação -> golpe -> pausa -> recuperação (segundos)
const T_ANTIC = 0.17, T_STRIKE = 0.08, T_HOLD = 0.07, T_RECOVER = 0.24;
const T_TOTAL = T_ANTIC + T_STRIKE + T_HOLD + T_RECOVER;

// Poses-chave da mão direita no referencial do corpo: mão [f,s,z], lâmina [f,s,z], giro do tronco, inclinação, pole do cotovelo
const K_WIND = { hand: [-9, 16, 70], blade: [-0.25, 0.3, 0.92], yaw: 0.7, lean: -3, pole: [-0.3, 1, -0.5] };
const K_HIT = { hand: [25, -12, 40], blade: [0.5, -0.82, -0.2], yaw: -0.6, lean: 6, pole: [-0.4, 0.6, -1] };

const mixKey = (a, b, t) => ({
  hand: v3.lerp(a.hand, b.hand, t),
  blade: v3.lerp(a.blade, b.blade, t),
  yaw: lerp(a.yaw, b.yaw, t),
  lean: lerp(a.lean, b.lean, t),
  pole: v3.lerp(a.pole, b.pole, t),
});

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = Math.PI / 4; // virado para a câmera
    this.running = false;
    this.hp = 100;
    this.maxHp = 100;
    this.fruits = 1;
    this.time = 0;
    this.lastRun = -10;
    this.attack = null;
    this.bobZ = 0;
    this.trail = [];
    this.rig = new Rig({
      legs: [
        { root: [0, -5.5, PELVIS], home: [0, -6], l1: 18, l2: 18, pole: [1, 0, 0.1] },
        { root: [0, 5.5, PELVIS], home: [0, 6], l1: 18, l2: 18, pole: [1, 0, 0.1] },
      ],
      groups: [[0], [1]],
      stepDur: 0.28,
      lift: 7,
      lead: 0.5,
    });
    this.pose = null;
  }

  // andou devagar no último instante? (necessário para domar)
  get calm() {
    return this.time - this.lastRun > 0.8;
  }

  update(dt, input, world, aim, onStrike) {
    this.time += dt;
    const [ax, ay] = screenDirToWorld(...input.axis());
    const moving = ax !== 0 || ay !== 0;
    this.running = moving && input.down('ShiftLeft', 'ShiftRight') && !this.attack;
    if (this.running) this.lastRun = this.time;

    let speed = this.running ? 230 : 115;
    if (this.attack) speed *= 0.3;
    const k = 1 - Math.exp(-dt * 14);
    this.vx += (ax * speed - this.vx) * k;
    this.vy += (ay * speed - this.vy) * k;

    if (input.clicked && (!this.attack || this.attack.t > T_ANTIC + T_STRIKE + T_HOLD)) {
      this.attack = { t: 0, hit: false, aim: Math.atan2(aim[1] - this.y, aim[0] - this.x) };
    }

    if (this.attack) {
      const a = this.attack;
      this.angle = angleLerp(this.angle, a.aim, 1 - Math.exp(-dt * 30));
      a.t += dt;
      if (!a.hit && a.t >= T_ANTIC) {
        a.hit = true;
        // pequeno avanço no golpe
        this.vx += Math.cos(a.aim) * 170;
        this.vy += Math.sin(a.aim) * 170;
        onStrike && onStrike(this);
      }
      if (a.t >= T_TOTAL) this.attack = null;
    } else if (Math.hypot(this.vx, this.vy) > 10) {
      this.angle = angleLerp(this.angle, Math.atan2(this.vy, this.vx), 1 - Math.exp(-dt * 12));
    }

    const px = this.x, py = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    world.resolve(this, 12, px, py);

    this.rig.update(dt, this.x, this.y, this.angle, this.vx, this.vy, {
      rootZ: this.bobZ,
      stepDur: this.running ? 0.2 : 0.28,
    });
    this.bobZ = this.rig.bob * 1.8 - (this.running ? 2.5 : 0);
    this.computePose(dt);
  }

  attackKey() {
    const a = this.attack;
    if (!a) return null;
    const t = a.t;
    if (t < T_ANTIC) return { from: 'rest', to: K_WIND, k: easeInOut(t / T_ANTIC) };
    if (t < T_ANTIC + T_STRIKE) return { from: K_WIND, to: K_HIT, k: easeOut((t - T_ANTIC) / T_STRIKE) };
    if (t < T_ANTIC + T_STRIKE + T_HOLD) return { from: K_HIT, to: K_HIT, k: 1 };
    return { from: K_HIT, to: 'rest', k: easeInOut((t - T_ANTIC - T_STRIKE - T_HOLD) / T_RECOVER) };
  }

  computePose(dt) {
    const rig = this.rig;
    const f = rig.frame;
    const run = this.running;
    const pz = PELVIS + this.bobZ;

    // braços balançam ao contrário das pernas
    const swingL = clamp(rig.footLead(1) * (run ? 1.3 : 0.9), -15, 15);
    const swingR = clamp(rig.footLead(0) * (run ? 1.3 : 0.9), -15, 15);
    const baseLean = run ? 5 : 1;
    const rest = {
      hand: [baseLean + swingR, 13, pz + (run ? 6 : -1)],
      blade: [0.55, 0.15, -0.8],
      yaw: 0,
      lean: 0,
      pole: [-1, 0.5, -0.3],
    };
    let key = rest;
    const ak = this.attackKey();
    if (ak) key = mixKey(ak.from === 'rest' ? rest : ak.from, ak.to === 'rest' ? rest : ak.to, ak.k);

    const lean = baseLean + key.lean;
    const yaw = key.yaw;
    const pelvis = f.w(0, 0, pz);
    const chest = f.w(lean, 0, pz + 23, yaw);
    const neck = f.w(lean * 1.15, 0, pz + 30, yaw * 0.5);
    const head = f.w(lean * 1.25 + 0.5, 0, pz + 39, yaw * 0.35);
    const shL = f.w(lean, -10, pz + 21, yaw);
    const shR = f.w(lean, 10, pz + 21, yaw);

    const handL = f.w(baseLean + swingL, -13, pz + (run ? 6 : -1));
    const armL = solveTwoBone(shL, handL, ARM[0], ARM[1], f.dir(-1, -0.5, -0.3));
    const armR = solveTwoBone(shR, f.w(...key.hand), ARM[0], ARM[1], f.dir(...key.pole));

    const bd = v3.norm(f.dir(...key.blade));
    const bladeBase = armR.end;
    const bladeTip = v3.add(bladeBase, v3.scale(bd, 27));

    const [l0, l1] = rig.legs;
    const headFwd = f.dir(1, 0, 0, yaw * 0.35);
    const headRight = f.dir(0, 1, 0, yaw * 0.35);
    this.pose = {
      pelvis, chest, neck, head, shL, shR,
      elL: armL.joint, hL: armL.end, elR: armR.joint, hR: armR.end,
      hipL: l0.hip, knL: l0.knee, ftL: l0.foot,
      hipR: l1.hip, knR: l1.knee, ftR: l1.foot,
      bladeBase, bladeTip, bladeDir: bd,
      fwd: f.fwd, right: f.right, headFwd, headRight,
    };

    // rastro do facão (posições no mundo)
    for (const p of this.trail) p.age += dt;
    this.trail = this.trail.filter((p) => p.age < 0.16);
    const t = this.attack ? this.attack.t : -1;
    if (t >= T_ANTIC && t < T_ANTIC + T_STRIKE + T_HOLD) {
      this.trail.unshift({ tip: bladeTip, base: v3.add(bladeBase, v3.scale(bd, 9)), age: 0 });
    }
  }
}
