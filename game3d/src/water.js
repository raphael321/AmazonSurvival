import * as THREE from 'three';
import { windUniforms, WIND_GLSL } from './wind.js';

// Água azul com rio correndo. Um mapa (textura) em volta do jogador guarda, por ponto:
// R = profundidade, G/B = direção do fluxo do rio (tangente ao traçado do ruído de rio).
// O shader usa "flowmap" (duas fases de rolagem misturadas) para as ondinhas correrem rio
// abaixo, clareia no raso, faz espuma branca na margem e brilhos do sol.
// O mapa é refeito aos poucos (fatias por quadro) quando o jogador se afasta.

const N = 128; // texels de lado
const SIZE = 4096; // unidades do mundo cobertas

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec2 vXZ;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vXZ = wp.xz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
${WIND_GLSL}
uniform sampler2D uMap;
uniform vec3 uOrigin; // x, z do canto e tamanho
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
varying vec2 vXZ;
float ripples(vec2 p) {
  return wNoise(p * 0.012) * 0.6 + wNoise(p * 0.031 + 7.0) * 0.4;
}
void main() {
  vec2 uv = (vXZ - uOrigin.xy) / uOrigin.z;
  vec4 m = texture2D(uMap, uv);
  bool inside = uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0;
  float depth = inside ? m.r : 1.0;
  vec2 flow = inside ? (m.gb * 2.0 - 1.0) : vec2(0.0);
  // flowmap: duas fases defasadas, misturadas em triângulo (sem "pulo" na volta)
  float spd = 70.0;
  float ph0 = fract(uTime * 0.18), ph1 = fract(uTime * 0.18 + 0.5);
  float mixk = abs(ph0 * 2.0 - 1.0);
  // o vento também arrasta a superfície um pouco
  vec2 drift = uWindDir * uWindStr * uTime * 6.0;
  float r0 = ripples(vXZ - flow * spd * ph0 * 6.0 - drift);
  float r1 = ripples(vXZ - flow * spd * ph1 * 6.0 - drift + 31.0);
  float r = mix(r0, r1, mixk);
  vec3 col = mix(uShallow, uDeep, smoothstep(0.02, 0.75, depth));
  // faixas de luz chapadas (toon) nas cristas das ondinhas
  col += vec3(0.07, 0.09, 0.1) * step(0.35, r);
  col -= vec3(0.03, 0.04, 0.04) * step(r, -0.4);
  // brilho do sol: pontos que correm com o fluxo
  float glint = wNoise(vXZ * 0.08 - flow * uTime * 9.0 + vec2(uTime * 0.7, 0.0));
  col = mix(col, vec3(1.0), step(0.78, glint) * 0.75 * smoothstep(0.1, 0.4, depth));
  // espuma branca na margem, recortada por ruído que se move
  float shore = 1.0 - smoothstep(0.0, 0.14, depth);
  float fn = wNoise(vXZ * 0.035 + vec2(uTime * 0.35, -uTime * 0.2));
  float foam = step(0.62, shore + 0.28 * fn);
  col = mix(col, uFoam, foam * 0.9);
  gl_FragColor = vec4(col, mix(0.78, 0.94, smoothstep(0.0, 0.5, depth)));
  #include <fog_fragment>
}`;

export class Water {
  constructor(scene, world) {
    this.world = world;
    this.data = new Uint8Array(N * N * 4);
    this.stage = new Uint8Array(N * N * 4);
    this.tex = new THREE.DataTexture(this.data, N, N, THREE.RGBAFormat);
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    this.uniforms = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...windUniforms,
      uMap: { value: this.tex },
      uOrigin: { value: new THREE.Vector3(-1e6, -1e6, SIZE) },
      uShallow: { value: new THREE.Color('#5fb7c9') },
      uDeep: { value: new THREE.Color('#1d5f8e') },
      uFoam: { value: new THREE.Color('#eef8f4') },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, fog: true, transparent: true, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2), mat);
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.job = null;
    this.center = null;
  }

  reset() {
    this.center = null;
    this.job = null;
  }

  // um texel: profundidade + direção do rio
  sample(x, y, o) {
    const f = this.world.field, g = f.gen, p = f.p;
    const h = f.H(x, y);
    const d = this.stage;
    d[o] = Math.max(0, Math.min(255, (-h / 45) * 255));
    let fx = 0, fy = 0;
    if (h < 2 && p.riverWidth > 0) {
      // tangente ao traçado: o rio corre ao longo da linha onde o ruído cruza zero
      const i = x / 64, j = y / 64, e = 0.4, sc = p.riverScale;
      const F = (a, b) => g.river.fbm(a / sc, b / sc, 3, 0.45);
      const v = F(i, j), gx = F(i + e, j) - F(i - e, j), gy = F(i, j + e) - F(i, j - e);
      const l = Math.hypot(gx, gy) || 1;
      const inRiver = 1 - Math.min(1, Math.max(0, (Math.abs(v) - p.riverWidth * 0.5) / (p.riverWidth * 2)));
      const k = 0.15 + 0.85 * inRiver; // lagoas: quase paradas
      fx = (-gy / l) * k;
      fy = (gx / l) * k;
    }
    d[o + 1] = (fx * 0.5 + 0.5) * 255;
    d[o + 2] = (fy * 0.5 + 0.5) * 255;
    d[o + 3] = 255;
  }

  update(px, py, budgetMs = 2) {
    this.mesh.position.set(Math.round(px / 500) * 500, 0, Math.round(py / 500) * 500);
    // novo mapa quando o jogador se afasta de 1/4 do lado
    if (!this.job && (!this.center || Math.hypot(px - this.center[0], py - this.center[1]) > SIZE / 4)) {
      const cx = Math.round(px / 256) * 256, cy = Math.round(py / 256) * 256;
      this.job = { cx, cy, x0: cx - SIZE / 2, y0: cy - SIZE / 2, row: 0, first: !this.center };
    }
    if (!this.job) return;
    const j = this.job, step = SIZE / N, t0 = performance.now();
    // o primeiro mapa sai inteiro (sem rio "sem água"); os seguintes vêm em fatias
    while (j.row < N && (j.first || performance.now() - t0 < budgetMs)) {
      for (let i = 0; i < N; i++) this.sample(j.x0 + (i + 0.5) * step, j.y0 + (j.row + 0.5) * step, (j.row * N + i) * 4);
      j.row++;
    }
    if (j.row >= N) {
      this.data.set(this.stage);
      this.tex.needsUpdate = true;
      this.uniforms.uOrigin.value.set(j.x0, j.y0, SIZE);
      this.center = [j.cx, j.cy];
      this.job = null;
    }
  }
}
