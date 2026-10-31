import * as THREE from 'three';
import { windUniforms, WIND_GLSL } from './wind.js';
import { rng } from '../../game/src/engine/math.js';

// Gramado em volta do personagem (como na referência): folhas presas ao mundo em células;
// só as células dentro do raio existem, e no shader a folha encolhe perto da borda do
// círculo, sumindo suave. Dobra com o vento (mesmo campo Perlin) e abre quando o
// personagem passa. Um único InstancedBufferGeometry com "vagas" por célula.

const CELL = 128;
const PER_CELL = 260; // folhas por célula (densidade 1)

export const grassSettings = { radius: 1150, density: 1, height: 1 };

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
${WIND_GLSL}
uniform vec3 uPlayer;
uniform float uRadius;
uniform float uHeight;
attribute vec3 aOffset;
attribute vec3 aParams; // giro, altura, variação de cor
varying float vH;
varying float vVar;
void main() {
  float c = cos(aParams.x), s = sin(aParams.x);
  float t = position.y;
  // some suave na borda do círculo em volta do personagem
  float d = length(aOffset.xz - uPlayer.xz);
  float edge = 1.0 - smoothstep(uRadius * 0.8, uRadius, d);
  // densidade cai com a distância: longe, metade das folhas some (custo menor, mesmo tapete)
  float thin = step(fract(aParams.z * 7.31), 1.0 - 0.55 * smoothstep(uRadius * 0.35, uRadius * 0.8, d));
  float h = aParams.y * uHeight * edge * thin;
  vec3 p = vec3(position.x * c, t * h, position.x * s);
  // vento: dobra mais na ponta (t²), com tremor rápido
  // vento calmo: ondas largas que passam pelo campo + tremor leve
  vec2 w = windAt(aOffset.xz);
  float wave = wNoise(aOffset.xz * 0.0035 - uWindDir * uTime * 0.6);
  float flutter = wNoise(aOffset.xz * 0.02 + vec2(uTime * 0.9, uTime * 0.7)) * 0.12;
  vec2 bend = w * (0.55 + 0.45 * wave + flutter) * t * t * h * 0.38;
  // o personagem abre caminho
  vec2 away = aOffset.xz - uPlayer.xz;
  bend += normalize(away + 0.001) * smoothstep(55.0, 0.0, length(away)) * 22.0 * t;
  p.xz += bend;
  p.y -= length(bend) * 0.4 * t;
  vec4 mvPosition = viewMatrix * vec4(aOffset + p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vH = t;
  vVar = aParams.z;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uBase;
uniform vec3 uTip;
uniform vec3 uTip2;
varying float vH;
varying float vVar;
void main() {
  vec3 tip = mix(uTip, uTip2, vVar);
  vec3 col = mix(uBase, tip, smoothstep(0.05, 1.0, vH));
  // faixa de luz chapada perto da ponta (mesmo estilo toon)
  col *= 0.86 + 0.18 * step(0.62, vH);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`;

function bladeGeometry() {
  // folha afinando em 2 segmentos (5 vértices, 3 triângulos); y vai de 0 a 1
  const w = 3.2;
  const pos = new Float32Array([-w, 0, 0, w, 0, 0, -w * 0.6, 0.55, 0, w * 0.6, 0.55, 0, 0, 1, 0]);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
  return g;
}

export class Grass {
  constructor(scene, world) {
    this.world = world;
    // vagas suficientes para o raio máximo do painel (1200)
    const maxCells = Math.ceil(((1600 + CELL) * 2 / CELL + 1) ** 2);
    this.slots = maxCells;
    this.cap = maxCells * PER_CELL * 2; // até densidade 2
    this.perSlot = PER_CELL * 2;
    const g = bladeGeometry();
    this.offset = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
    this.params = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
    this.offset.setUsage(THREE.DynamicDrawUsage);
    this.params.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aOffset', this.offset);
    g.setAttribute('aParams', this.params);
    g.instanceCount = this.cap;
    this.uniforms = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...windUniforms, // mesmas referências: o vento atualiza tudo junto
      uPlayer: { value: new THREE.Vector3() },
      uRadius: { value: grassSettings.radius },
      uHeight: { value: grassSettings.height },
      uBase: { value: new THREE.Color('#2c4a24') },
      uTip: { value: new THREE.Color('#86b04a') },
      uTip2: { value: new THREE.Color('#b7c25a') },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, fog: true, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.cells = new Map(); // "ci,cj" -> vaga
    this.free = [...Array(this.slots).keys()].reverse(); // pop() devolve a menor vaga livre
    this.queue = [];
  }

  reset() {
    for (const slot of this.cells.values()) this.clearSlot(slot);
    this.free = [...Array(this.slots).keys()].reverse();
    this.cells.clear();
  }

  clearSlot(slot) {
    const a = this.params.array;
    for (let k = slot * this.perSlot; k < (slot + 1) * this.perSlot; k++) a[k * 3 + 1] = 0;
    this.params.addUpdateRange(slot * this.perSlot * 3, this.perSlot * 3);
    this.params.needsUpdate = true;
  }

  // preenche as folhas de uma célula (posições fixas no mundo, altura exata do terreno)
  fillCell(ci, cj, slot) {
    const f = this.world.field, n = Math.min(this.perSlot, Math.round(PER_CELL * grassSettings.density));
    const off = this.offset.array, par = this.params.array, rockH = f.rockH;
    const base = slot * this.perSlot;
    // gerador por célula (seed = célula): posições espalhadas de verdade, iguais toda vez
    const r = rng(Math.imul(ci, 73856093) ^ Math.imul(cj, 19349663) ^ 0x5bd1e995);
    for (let k = 0; k < this.perSlot; k++) {
      const idx = base + k;
      par[idx * 3 + 1] = 0;
      const x = (ci + r()) * CELL, y = (cj + r()) * CELL;
      const rot = r() * Math.PI, hgt = 20 + r() * 22, tint = r(), keep = r();
      if (k >= n) continue;
      const h = f.H(x, y);
      if (h < 4 || h > rockH) continue; // nada de grama na água, na lama da margem nem na rocha
      // sub-bosque da terra firme tem só 2–15% da luz: quase nada de capim, chão de folhas
      if (f.forest(x, y) && keep > 0.08) continue;
      if (f.slope(x, y) > 0.95) continue;
      // várzea: capim alto da beira (canarana)
      const bank = h < 22 ? 1.6 : 1;
      off[idx * 3] = x;
      off[idx * 3 + 1] = h - 1;
      off[idx * 3 + 2] = y;
      par[idx * 3] = rot;
      par[idx * 3 + 1] = hgt * bank;
      par[idx * 3 + 2] = tint;
    }
    this.offset.addUpdateRange(base * 3, this.perSlot * 3);
    this.params.addUpdateRange(base * 3, this.perSlot * 3);
    this.offset.needsUpdate = true;
    this.params.needsUpdate = true;
  }

  update(px, py, pz, budgetMs = 2) {
    this.uniforms.uPlayer.value.set(px, pz, py);
    this.uniforms.uRadius.value = grassSettings.radius;
    this.uniforms.uHeight.value = grassSettings.height;
    const R = grassSettings.radius + CELL;
    const ci0 = Math.floor((px - R) / CELL), ci1 = Math.floor((px + R) / CELL);
    const cj0 = Math.floor((py - R) / CELL), cj1 = Math.floor((py + R) / CELL);
    const inside = (i, j) => Math.hypot((i + 0.5) * CELL - px, (j + 0.5) * CELL - py) < R;
    // libera células que saíram do círculo
    for (const [k, slot] of this.cells) {
      const [i, j] = k.split(',').map(Number);
      if (!inside(i, j)) { this.clearSlot(slot); this.free.push(slot); this.cells.delete(k); }
    }
    this.free.sort((a, b) => b - a);
    // pede as que entraram, mais perto primeiro
    const want = [];
    for (let j = cj0; j <= cj1; j++)
      for (let i = ci0; i <= ci1; i++) if (inside(i, j) && !this.cells.has(i + ',' + j)) want.push([i, j, Math.hypot((i + 0.5) * CELL - px, (j + 0.5) * CELL - py)]);
    want.sort((a, b) => a[2] - b[2]);
    const t0 = performance.now();
    for (const [i, j] of want) {
      if (!this.free.length || performance.now() - t0 > budgetMs) break;
      const slot = this.free.pop();
      this.cells.set(i + ',' + j, slot);
      this.fillCell(i, j, slot);
    }
    // só desenha até a maior vaga em uso (o resto nem passa pelo shader)
    let maxSlot = -1;
    for (const s of this.cells.values()) maxSlot = Math.max(maxSlot, s);
    this.mesh.geometry.instanceCount = (maxSlot + 1) * this.perSlot;
  }
}
