import { Rig } from '../skeleton/rig.js';
import { angleLerp, lerp, rng } from '../engine/math.js';

export const TRUST_NEEDED = 3;

// Capivara: quadrúpede no mesmo Rig genérico, pares diagonais de patas.
export class Capybara {
  constructor(x, y, seed = 5) {
    this.x = x;
    this.y = y;
    this.home = [x, y];
    this.vx = 0;
    this.vy = 0;
    this.angle = Math.PI;
    this.state = 'idle';
    this.timer = 1.5;
    this.target = null;
    this.trust = 0;
    this.tamed = false;
    this.graze = 0; // 0 cabeça erguida, 1 pastando
    this.chew = 0;
    this.time = 0;
    this.z = 0;
    this.r = rng(seed);
    this.rig = new Rig({
      legs: [
        { root: [12, -6.5, 17], home: [13, -7.5], l1: 8.5, l2: 9.5, pole: [-1, 0, 0] },
        { root: [12, 6.5, 17], home: [13, 7.5], l1: 8.5, l2: 9.5, pole: [-1, 0, 0] },
        { root: [-12, -7.5, 18], home: [-12, -8], l1: 8.5, l2: 9.5, pole: [1, 0, 0] },
        { root: [-12, 7.5, 18], home: [-12, 8], l1: 8.5, l2: 9.5, pole: [1, 0, 0] },
      ],
      groups: [[0, 3], [1, 2]],
      stepDur: 0.26,
      lift: 4,
      lead: 0.5,
    });
    this.pose = null;
  }

  scare(px, py, time = 2.2) {
    this.state = 'flee';
    this.timer = time;
    this.fleeFrom = [px, py];
  }

  // devolve o resultado para o jogo mostrar mensagens
  offer(player) {
    if (this.state === 'flee') return 'fugindo';
    if (!player.calm) {
      this.scare(player.x, player.y, 1.6);
      return 'assustou';
    }
    if (player.fruits <= 0) return 'sem-fruta';
    player.fruits--;
    this.trust++;
    this.state = 'eat';
    this.timer = 1.3;
    this.angle = Math.atan2(player.y - this.y, player.x - this.x);
    if (this.trust >= TRUST_NEEDED) this.tamed = true;
    return this.tamed ? 'domada' : 'comeu';
  }

  hitBy(player) {
    if (this.tamed) {
      this.scare(player.x, player.y, 0.8);
      return;
    }
    this.trust = 0;
    this.scare(player.x, player.y, 3);
  }

  update(dt, world, player) {
    this.time += dt;
    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (!this.tamed && player.running && dist < 170 && this.state !== 'flee') this.scare(player.x, player.y);

    let tvx = 0, tvy = 0, wantGraze = 0;
    this.timer -= dt;
    switch (this.state) {
      case 'idle':
        wantGraze = 1;
        if (this.tamed && dist > 110) this.state = 'follow';
        else if (this.timer <= 0) {
          if (this.tamed) { this.timer = 2; break; }
          for (let i = 0; i < 10; i++) {
            const a = this.r() * Math.PI * 2, d = 60 + this.r() * 180;
            const tx = this.home[0] + Math.cos(a) * d, ty = this.home[1] + Math.sin(a) * d;
            if (world.isFree(tx, ty, 22)) { this.target = [tx, ty]; this.state = 'wander'; break; }
          }
          this.timer = 2 + this.r() * 3;
        }
        break;
      case 'wander': {
        const ex = this.target[0] - this.x, ey = this.target[1] - this.y, d = Math.hypot(ex, ey);
        if (d < 8 || this.timer <= -6) { this.state = 'idle'; this.timer = 2 + this.r() * 3; break; }
        tvx = (ex / d) * 38;
        tvy = (ey / d) * 38;
        break;
      }
      case 'flee': {
        const fx = this.x - this.fleeFrom[0], fy = this.y - this.fleeFrom[1], d = Math.hypot(fx, fy) || 1;
        tvx = (fx / d) * 200;
        tvy = (fy / d) * 200;
        if (this.timer <= 0) { this.state = 'idle'; this.timer = 1.5; this.home = [this.x, this.y]; }
        break;
      }
      case 'eat':
        this.chew += dt;
        if (this.timer <= 0) { this.state = this.tamed ? 'follow' : 'idle'; this.timer = 2; }
        break;
      case 'follow': {
        // segue atrás do jogador, sem colar
        const back = [player.x - Math.cos(player.angle) * 55, player.y - Math.sin(player.angle) * 55];
        const ex = back[0] - this.x, ey = back[1] - this.y, d = Math.hypot(ex, ey);
        if (dist < 75 && Math.hypot(player.vx, player.vy) < 10) { this.state = 'idle'; this.timer = 1; break; }
        const sp = Math.min(Math.max(player.running ? 240 : 125, d * 1.5), d * 4);
        tvx = (ex / (d || 1)) * sp;
        tvy = (ey / (d || 1)) * sp;
        break;
      }
    }

    const k = 1 - Math.exp(-dt * (this.state === 'flee' ? 8 : 5));
    this.vx += (tvx - this.vx) * k;
    this.vy += (tvy - this.vy) * k;
    const px = this.x, py = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const bx = this.x, by = this.y;
    world.resolve(this, 20, px, py);
    if (world.stepZ) this.z = world.stepZ(this, dt);
    else this.z += (world.groundZ(this.x, this.y) - this.z) * (1 - Math.exp(-dt * 12));
    // se bateu em algo ao vagar, desiste do alvo
    if (this.state === 'wander' && Math.hypot(bx - this.x, by - this.y) > 1) this.timer = Math.min(this.timer, -5.5);

    const speed = Math.hypot(this.vx, this.vy);
    if (this.state === 'eat') {
      // continua virada para quem deu a fruta
    } else if (speed > 6) this.angle = angleLerp(this.angle, Math.atan2(this.vy, this.vx), 1 - Math.exp(-dt * 7));
    else if (this.tamed || dist < 140) this.angle = angleLerp(this.angle, Math.atan2(dy, dx), 1 - Math.exp(-dt * 2));

    if (speed > 15 || this.state === 'eat') wantGraze = 0;
    this.graze = lerp(this.graze, wantGraze, 1 - Math.exp(-dt * 2.5));

    this.rig.update(dt, this.x, this.y, this.angle, this.vx, this.vy, {
      rootZ: this.rig.bob * 1.2,
      stepDur: speed > 15 ? Math.min(0.26, Math.max(0.09, 20 / speed)) : 0.26,
    });
    this.computePose();
  }

  computePose() {
    const f = this.rig.frame;
    const bob = this.rig.bob * 1.2;
    const g = this.graze;
    const chewing = this.state === 'eat' ? Math.sin(this.chew * 18) * 1.2 : 0;
    const look = this.state === 'eat' ? 3 : 0;
    this.pose = {
      center: f.w(0, 0, 0),
      rump: f.w(-11, 0, 25 + bob),
      chest: f.w(10, 0, 24 + bob - g * 2),
      cranium: f.w(24 + g * 2, 0, 31 + bob - g * 13 + look),
      muzzle: f.w(34 + g * 1, 0, 27 + bob - g * 17 + chewing + look),
      legs: this.rig.legs,
      fwd: f.fwd,
      right: f.right,
      blink: (this.time % 4.3) < 0.12,
    };
  }
}
