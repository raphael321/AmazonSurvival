import * as THREE from 'three';

// Cachoeira: procura no relevo um barranco alto colado na água (lago ou rio) e desce uma
// "cortina" d'água acompanhando a encosta, com espuma no pé, névoa subindo e pedras na borda.
// Tudo gerado por código; o jogador começa de frente para ela.

const VERT = /* glsl */ `
varying vec2 vUv;
varying float vFoam;
attribute float foam;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vFoam = foam;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform vec3 uWater, uLight;
varying vec2 vUv;
varying float vFoam;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  // faixas que descem (a água acelera para baixo: v cresce mais rápido no fim)
  float v = vUv.y * 6.0 - uTime * 2.6;
  float streak = n(vec2(vUv.x * 18.0, v)) * 0.6 + n(vec2(vUv.x * 40.0, v * 2.0)) * 0.4;
  vec3 col = mix(uWater, uLight, smoothstep(0.35, 0.8, streak));
  // espuma branca: no pé da queda e onde a água bate nas pedras
  col = mix(col, vec3(1.0), clamp(vFoam + step(0.78, streak) * 0.6, 0.0, 1.0));
  // bordas desfiadas
  float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  float a = edge * (0.78 + 0.2 * streak);
  if (a < 0.05) discard;
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`;

export class Waterfall {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.site = null;
    this.t = 0;
  }

  // barranco alto (B) a poucos passos de água funda (A); o melhor perto de (cx, cy)
  find(cx, cy) {
    const f = this.world.field;
    let best = null;
    for (let r = 300; r < 7000 && !best; r += 400)
      for (let y = cy - r; y <= cy + r; y += 160)
        for (let x = cx - r; x <= cx + r; x += 160) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) < r - 400) continue; // só o anel novo
          if (f.H(x, y) > -14) continue;
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
            for (let d = 140; d <= 420; d += 70) {
              const bx = x + dx * d, by = y + dy * d, hb = f.H(bx, by);
              if (hb < 170) continue; // queda alta (≥ 3,5 m)
              // a encosta precisa descer de forma contínua (sem vale no meio)
              let ok = true, prev = hb;
              for (let s = 1; s <= 6 && ok; s++) {
                const hh = f.H(bx - dx * d * (s / 6), by - dy * d * (s / 6));
                if (hh > prev + 6) ok = false;
                prev = hh;
              }
              // em cima precisa ter chão firme para a água "vir" de algum lugar
              if (!ok || f.H(bx + dx * 120, by + dy * 120) < hb - 30) continue;
              const score = hb / d - Math.hypot(x - cx, y - cy) * 0.0002;
              if (!best || score > best.score) best = { score, ax: x, ay: y, bx, by, dx, dy, d, hb };
              break;
            }
          }
        }
    return best;
  }

  build(site) {
    this.site = site;
    const f = this.world.field, { ax, ay, bx, by, dx, dy } = site;
    // caminho do topo até a água, alguns passos além da margem
    const N = 40, pts = [];
    const total = Math.hypot(ax - bx, ay - by) * 0.85;
    for (let i = 0; i <= N; i++) {
      const t = i / N, x = bx - dx * total * t, y = by - dy * total * t;
      // a água sai do topo e cai em arco (parábola): fica acima da encosta e despenca no fim
      const arc = site.hb * (1 - t * t) + 8;
      const z = Math.max(arc, Math.max(f.H(x, y), 0) + 6);
      pts.push([x, y, z]);
    }
    // a água do topo sai um pouco para frente (lábio da queda)
    const side = [-dy, dx];
    const pos = [], uv = [], foam = [], idx = [];
    let along = 0;
    for (let i = 0; i <= N; i++) {
      const t = i / N, [x, y, z] = pts[i];
      if (i > 0) along += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1], z - pts[i - 1][2]);
      const w = 80 + t * 80; // alarga ao cair
      for (const s of [-1, 1]) {
        pos.push(x + side[0] * w * s, z, y + side[1] * w * s);
        uv.push(s < 0 ? 0 : 1, along / 120);
        foam.push(t > 0.85 ? (t - 0.85) / 0.15 : 0);
      }
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('foam', new THREE.Float32BufferAttribute(foam, 1));
    g.setIndex(idx);
    this.uniforms = {
      uTime: { value: 0 },
      uWater: { value: new THREE.Color('#5aa8c4') },
      uLight: { value: new THREE.Color('#d9f1f4') },
      ...THREE.UniformsLib.fog,
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: true });
    this.sheet = new THREE.Mesh(g, mat);
    this.sheet.frustumCulled = false;
    this.scene.add(this.sheet);
    // espuma no pé: anel branco que pulsa
    const end = pts[N];
    this.base = [end[0], end[1]];
    const foamMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.CircleGeometry(1, 28), foamMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(end[0], 1.5, end[1]);
    this.scene.add(this.ring);
    // névoa: partículas que sobem do pé e se espalham
    const M = 90;
    this.mist = { n: M, p: new Float32Array(M * 3), life: new Float32Array(M), v: new Float32Array(M * 3) };
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(this.mist.p, 3));
    this.mistPts = new THREE.Points(mg, new THREE.PointsMaterial({ color: '#f4fbfb', size: 46, transparent: true, opacity: 0.35, depthWrite: false, sizeAttenuation: true }));
    this.mistPts.frustumCulled = false;
    this.scene.add(this.mistPts);
    for (let i = 0; i < M; i++) this.respawn(i, Math.random());
    // zona livre: sem árvores sobre a água que cai; pedras emoldurando o lábio e o pé
    const zone = [];
    for (let i = 0; i <= N; i += 4) zone.push({ x: pts[i][0], y: pts[i][1], r: 110 + (i / N) * 70 });
    this.clearZones = zone;
    const props = [];
    const rock = (x, y, variant, size) => props.push({ id: 'cachoeira' + props.length, kind: 'cliff', x, y, z: f.H(x, y) - 8, variant, size, foot: 120 * size, shadow: 0 });
    rock(bx + side[0] * 150, by + side[1] * 150, 2, 1.2);
    rock(bx - side[0] * 150, by - side[1] * 150, 2, 1.1);
    rock(end[0] + side[0] * 190, end[1] + side[1] * 190, 2, 0.9);
    rock(end[0] - side[0] * 200, end[1] - side[1] * 200, 1, 0.55);
    this.props = props;
    this.top = pts[0];
    return pts;
  }

  respawn(i, age = 0) {
    const m = this.mist, a = Math.random() * Math.PI * 2, r = Math.random() * 70;
    m.p[i * 3] = this.base[0] + Math.cos(a) * r;
    m.p[i * 3 + 1] = 2 + Math.random() * 10;
    m.p[i * 3 + 2] = this.base[1] + Math.sin(a) * r;
    m.v[i * 3] = Math.cos(a) * (20 + Math.random() * 30);
    m.v[i * 3 + 1] = 30 + Math.random() * 40;
    m.v[i * 3 + 2] = Math.sin(a) * (20 + Math.random() * 30);
    m.life[i] = age * 3;
  }

  update(dt) {
    if (!this.sheet) return;
    this.t += dt;
    this.uniforms.uTime.value = this.t;
    const s = 120 + Math.sin(this.t * 3) * 12;
    this.ring.scale.set(s, s, 1);
    const m = this.mist;
    for (let i = 0; i < m.n; i++) {
      m.life[i] += dt;
      if (m.life[i] > 3) { this.respawn(i); continue; }
      m.p[i * 3] += m.v[i * 3] * dt;
      m.p[i * 3 + 1] += m.v[i * 3 + 1] * dt;
      m.p[i * 3 + 2] += m.v[i * 3 + 2] * dt;
      m.v[i * 3 + 1] *= 1 - dt * 0.6;
    }
    this.mistPts.geometry.attributes.position.needsUpdate = true;
  }

  // ponto de vista para começar o jogo: em terra, de frente para a queda
  viewpoint() {
    const f = this.world.field, s = this.site, side = [-s.dy, s.dx];
    for (const d of [380, 460, 540, 300, 620]) for (const sgn of [1, -1]) for (const lat of [0, 0.5, 1]) {
      const x = this.base[0] - s.dx * d * 0 + side[0] * d * sgn * (0.6 + lat * 0.3) - s.dx * d * 0.5, y = this.base[1] + side[1] * d * sgn * (0.6 + lat * 0.3) - s.dy * d * 0.5;
      if (f.H(x, y) > 6 && f.slope(x, y) < 0.5) return [x, y];
    }
    return null;
  }
}
