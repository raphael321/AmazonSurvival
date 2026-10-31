import * as THREE from 'three';
import { windAt, windUniforms } from './wind.js';
import { makePerlin } from '../../game/src/engine/perlin.js';
import { toon } from './toon.js';

// Efeitos que o vento carrega: traços brancos estilizados no ar e a fumaça da fogueira.
// Ambos leem o mesmo campo de vento (Perlin) que a grama e as árvores.

const noise = makePerlin(911);
const toThree = (x, y, z) => new THREE.Vector3(x, z, y);

// ---------- traços brancos do vento ----------
const TRAILS = 22, SEG = 26;

export class WindTrails {
  constructor(scene, world) {
    this.world = world;
    this.trails = [];
    const nv = TRAILS * (SEG - 1) * 6;
    this.pos = new Float32Array(nv * 3);
    this.alpha = new Float32Array(nv);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(1.0, 1.0, 0.98, vA); }',
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  spawn(px, py, t) {
    const a = Math.random() * Math.PI * 2, r = 150 + Math.random() * 650;
    const x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
    return { x, y, z: this.world.groundZ(x, y) + 60 + Math.random() * 120, age: 0, life: 2.2 + Math.random() * 2, hist: [], seed: Math.random() * 100, t0: t };
  }

  update(dt, t, px, py) {
    const str = windUniforms.uWindStr.value;
    const want = Math.round(TRAILS * Math.min(1, str * 0.8));
    while (this.trails.length < want) this.trails.push(this.spawn(px, py, t));
    let v = 0;
    for (let k = this.trails.length - 1; k >= 0; k--) {
      const tr = this.trails[k];
      tr.age += dt;
      if (tr.age > tr.life || Math.hypot(tr.x - px, tr.y - py) > 1100) { this.trails.splice(k, 1); continue; }
      // segue o vento + volteios de ruído (dá o caracol estilizado)
      const [wx, wy] = windAt(tr.x, tr.y, t);
      const curl = noise.noise(tr.seed + tr.age * 1.3, 2.7) * 2.2;
      const sp = 190;
      const dx = wx * Math.cos(curl) - wy * Math.sin(curl), dy = wx * Math.sin(curl) + wy * Math.cos(curl);
      tr.x += dx * sp * dt;
      tr.y += dy * sp * dt;
      tr.z += Math.sin(tr.age * 4 + tr.seed) * 14 * dt;
      tr.hist.unshift([tr.x, tr.y, tr.z]);
      if (tr.hist.length > SEG) tr.hist.pop();
    }
    for (const tr of this.trails) {
      const h = tr.hist;
      const life = Math.min(1, tr.age / 0.4, (tr.life - tr.age) / 0.6);
      for (let s = 0; s < h.length - 1 && s < SEG - 1; s++) {
        const a = h[s], b = h[s + 1];
        let ux = b[0] - a[0], uy = b[1] - a[1];
        const l = Math.hypot(ux, uy) || 1;
        // fita horizontal, mais grossa no meio
        const w = 2.6 * Math.sin(Math.PI * (s / (SEG - 1)));
        const nx = (-uy / l) * w, ny = (ux / l) * w;
        const al = life * 0.75 * Math.sin(Math.PI * (s / (SEG - 1)));
        const quad = [[a, 1], [b, 1], [b, -1], [a, 1], [b, -1], [a, -1]];
        for (const [q, side] of quad) {
          this.pos[v * 3] = q[0] + nx * side;
          this.pos[v * 3 + 1] = q[2];
          this.pos[v * 3 + 2] = q[1] + ny * side;
          this.alpha[v] = al;
          v++;
        }
      }
    }
    const g = this.mesh.geometry;
    g.setDrawRange(0, v);
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }
}

// ---------- fogueira com fumaça ----------
const PUFFS = 46;

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Campfire {
  constructor(scene, world, x, y) {
    this.world = world;
    this.x = x;
    this.y = y;
    const z = world.groundZ(x, y);
    this.z = z;
    this.group = new THREE.Group();
    this.group.position.copy(toThree(x, y, z));
    // pedras em volta e lenha cruzada
    const stone = toon('#8a8470'), wood = toon('#6b4a2e');
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(7, 0), stone);
      m.position.set(Math.cos(a) * 22, 3, Math.sin(a) * 22);
      m.scale.set(1, 0.7, 1);
      m.castShadow = true;
      this.group.add(m);
    }
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 34, 6), wood);
      m.rotation.set(0.9, (k / 4) * Math.PI * 2, 0);
      m.position.set(0, 9, 0);
      this.group.add(m);
    }
    // chamas: cones que tremulam
    this.flames = ['#f29a4b', '#e3743b', '#f7dc9a'].map((c, k) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(9 - k * 2.5, 30 - k * 6, 7), new THREE.MeshBasicMaterial({ color: c }));
      m.position.y = 18 - k * 2;
      this.group.add(m);
      return m;
    });
    this.light = new THREE.PointLight('#ffb070', 2.2, 420, 1.6);
    this.light.position.set(0, 40, 0);
    this.group.add(this.light);
    scene.add(this.group);
    // fumaça: pontos com textura macia, um só desenho
    this.puffs = [];
    this.ppos = new Float32Array(PUFFS * 3);
    this.psize = new Float32Array(PUFFS);
    this.palpha = new Float32Array(PUFFS);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.ppos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.psize, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.palpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTex: { value: puffTexture() }, uScale: { value: 600 } },
      vertexShader: 'attribute float aSize; attribute float aAlpha; uniform float uScale; varying float vA; void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D uTex; varying float vA; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.82, 0.83, 0.8), t.a * vA); }',
    });
    this.smoke = new THREE.Points(g, mat);
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 2;
    scene.add(this.smoke);
    this.acc = 0;
  }

  update(dt, t, camera, sh) {
    // chama tremulando (ruído) e luz acompanhando
    this.flames.forEach((m, k) => {
      const n = noise.noise(t * 6 + k * 3, 1.3);
      m.scale.set(1 + n * 0.15, 1 + n * 0.35, 1 + n * 0.15);
      const [wx, wy] = windAt(this.x, this.y, t);
      m.rotation.set(wy * 0.25, 0, -wx * 0.25); // chama deita no vento
    });
    this.light.intensity = 2 + noise.noise(t * 9, 4.2) * 0.6;
    this.smoke.material.uniforms.uScale.value = sh / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    // emite e move a fumaça: sobe, cresce, esmaece e é levada pelo vento
    this.acc += dt;
    while (this.acc > 0.11 && this.puffs.length < PUFFS) {
      this.acc -= 0.11;
      this.puffs.push({ x: this.x + (Math.random() - 0.5) * 8, y: this.y + (Math.random() - 0.5) * 8, z: this.z + 30, age: 0, life: 4 + Math.random() * 2, s: Math.random() * 10 });
    }
    let n = 0;
    for (let k = this.puffs.length - 1; k >= 0; k--) {
      const p = this.puffs[k];
      p.age += dt;
      if (p.age > p.life) { this.puffs.splice(k, 1); continue; }
      const [wx, wy] = windAt(p.x, p.y, t);
      const turb = noise.noise(p.s + p.age * 0.8, t * 0.3);
      const push = Math.min(1, p.age / 1.2); // perto da chama sobe reto, depois o vento leva
      p.x += (wx * 110 * push + turb * 18) * dt;
      p.y += (wy * 110 * push + noise.noise(p.s + 5, p.age) * 18) * dt;
      p.z += (55 - 18 * push) * dt;
    }
    for (const p of this.puffs) {
      const k = p.age / p.life;
      this.ppos[n * 3] = p.x;
      this.ppos[n * 3 + 1] = p.z;
      this.ppos[n * 3 + 2] = p.y;
      this.psize[n] = 18 + k * 90;
      this.palpha[n] = Math.min(1, p.age / 0.4) * (1 - k) * 0.3;
      n++;
    }
    const g = this.smoke.geometry;
    g.setDrawRange(0, n);
    for (const a of ['position', 'aSize', 'aAlpha']) g.attributes[a].needsUpdate = true;
  }
}
