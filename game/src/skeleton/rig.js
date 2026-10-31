import { Frame } from './frame.js';
import { solveTwoBone } from './ik.js';

// Esqueleto genérico de pernas com marcha procedural.
// Serve para bípede e quadrúpede: só muda a lista de pernas e os grupos que pisam juntos.
//
// leg = { root:[f,s,z], home:[f,s], l1, l2, pole:[f,s,z] }
// groups = [[0],[1]] (bípede) ou [[0,3],[1,2]] (quadrúpede em diagonal)
export class Rig {
  constructor({ legs, groups, stepDur = 0.3, lift = 6, lead = 0.55 }) {
    this.def = legs;
    this.groups = groups;
    this.stepDur = stepDur;
    this.lift = lift;
    this.lead = lead;
    this.frame = new Frame();
    this.feet = legs.map(() => ({ pos: null, from: null, to: null, t: 1 }));
    this.legs = legs.map(() => ({ hip: [0, 0, 0], knee: [0, 0, 0], foot: [0, 0, 0] }));
    this.bob = 0;
    // opcional: altura do chão sob um ponto, relativa à base do corpo (terreno 3D contínuo).
    // Sem ela os pés pisam em z = 0 (chão plano, como no 2D).
    this.groundRel = null;
  }

  homeOf(i) {
    const h = this.def[i].home;
    return this.frame.w(h[0], h[1], 0);
  }

  // speed: velocidade atual; stepScale encurta o passo ao correr
  update(dt, x, y, angle, vx, vy, { rootZ = 0, stepDur = this.stepDur } = {}) {
    this.frame.set(x, y, angle);
    const speed = Math.hypot(vx, vy);

    // pés recém-criados nascem plantados na posição de descanso
    this.feet.forEach((ft, i) => {
      if (!ft.pos) ft.pos = this.homeOf(i);
    });

    // avança passos em andamento
    let stepping = false;
    this.bob = 0;
    for (const ft of this.feet) {
      if (ft.t < 1) {
        ft.t = Math.min(1, ft.t + dt / ft.dur);
        const e = ft.t < 0.5 ? 2 * ft.t * ft.t : 1 - Math.pow(-2 * ft.t + 2, 2) / 2;
        ft.pos = [
          ft.from[0] + (ft.to[0] - ft.from[0]) * e,
          ft.from[1] + (ft.to[1] - ft.from[1]) * e,
          Math.sin(Math.PI * ft.t) * ft.lift,
        ];
        this.bob = Math.max(this.bob, Math.sin(Math.PI * ft.t));
        if (ft.t < 1) stepping = true;
      }
    }

    // se ninguém está no ar, o grupo mais "atrasado" dá o próximo passo
    if (!stepping) {
      const moving = speed > 8;
      const threshold = moving ? Math.max(4, speed * stepDur * 0.42) : 3;
      let best = -1, bestErr = threshold;
      this.groups.forEach((g, gi) => {
        const err = Math.max(...g.map((i) => {
          const h = this.homeOf(i);
          return Math.hypot(this.feet[i].pos[0] - h[0], this.feet[i].pos[1] - h[1]);
        }));
        if (err > bestErr) { bestErr = err; best = gi; }
      });
      if (best >= 0) {
        const dur = moving ? stepDur : stepDur * 1.2;
        for (const i of this.groups[best]) {
          const h = this.homeOf(i);
          const ft = this.feet[i];
          ft.from = [ft.pos[0], ft.pos[1], 0];
          ft.to = [h[0] + vx * dur * this.lead, h[1] + vy * dur * this.lead, 0];
          ft.t = 0;
          ft.dur = dur;
          ft.lift = moving ? this.lift : this.lift * 0.5;
        }
      }
    }

    // IK de cada perna
    this.def.forEach((d, i) => {
      const hip = this.frame.w(d.root[0], d.root[1], d.root[2] + rootZ);
      const pole = this.frame.dir(d.pole[0], d.pole[1], d.pole[2]);
      let target = this.feet[i].pos;
      if (this.groundRel) {
        // pé apoiado no relevo; limitado ao que a perna alcança
        const g = Math.max(-14, Math.min(14, this.groundRel(target[0], target[1])));
        target = [target[0], target[1], target[2] + g];
      }
      const ik = solveTwoBone(hip, target, d.l1, d.l2, pole);
      const leg = this.legs[i];
      leg.hip = hip;
      leg.knee = ik.joint;
      leg.foot = ik.end;
    });
  }

  // quanto o pé i está à frente do seu quadril (para balanço dos braços)
  footLead(i) {
    const h = this.homeOf(i);
    const p = this.feet[i].pos;
    return (p[0] - h[0]) * this.frame.fwd[0] + (p[1] - h[1]) * this.frame.fwd[1];
  }
}
