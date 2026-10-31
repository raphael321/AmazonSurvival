import * as THREE from 'three';
import { makePerlin } from '../../game/src/engine/perlin.js';

// Vento global: UM campo (ruído Perlin) compartilhado entre GPU e CPU.
// Direção muda devagar; rajadas são faixas de ruído que viajam no sentido do vento.
// Grama, árvores, traços brancos e fumaça leem o mesmo campo, então se movem juntos.
// Coordenadas: plano xz do three = (x, y) do jogo.

export const windUniforms = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6) },
  uWindStr: { value: 1 },
};

export const windSettings = { strength: 1, direction: 35, gust: 0.45 };

// Perlin 2D clássico (Stefan Gustavson) em GLSL, com nomes prefixados para não colidir.
export const WIND_GLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStr;
vec4 wPermute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec2 wFade(vec2 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float wNoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
  Pi = mod(Pi, 289.0);
  vec4 ix = Pi.xzxz, iy = Pi.yyww, fx = Pf.xzxz, fy = Pf.yyww;
  vec4 i = wPermute(wPermute(ix) + iy);
  vec4 gx = 2.0 * fract(i * 0.0243902439) - 1.0;
  vec4 gy = abs(gx) - 0.5;
  gx = gx - floor(gx + 0.5);
  vec2 g00 = vec2(gx.x, gy.x), g10 = vec2(gx.y, gy.y), g01 = vec2(gx.z, gy.z), g11 = vec2(gx.w, gy.w);
  vec4 norm = 1.79284291400159 - 0.85373472095314 * vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x)), n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z)), n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 f = wFade(Pf.xy);
  vec2 nx = mix(vec2(n00, n01), vec2(n10, n11), f.x);
  return 2.3 * mix(nx.x, nx.y, f.y);
}
// vento no ponto (vetor no plano xz): direção global × força com rajadas que viajam
vec2 windAt(vec2 p) {
  float g = wNoise(p * 0.0016 - uWindDir * uTime * 0.32);
  return uWindDir * uWindStr * (0.62 + 0.55 * g);
}
`;

// Patch de shader: copas e folhas balançam (altura ao quadrado = topo mexe mais), com tremor.
const SWAY_GLSL = /* glsl */ `
vec4 wpos = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  wpos = instanceMatrix * wpos;
  vec4 worg = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
#else
  vec4 worg = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
#endif
wpos = modelMatrix * wpos;
float swH = max(0.0, wpos.y - worg.y);
vec2 swW = windAt(worg.xz);
float swF = wNoise(worg.xz * 0.013 + vec2(uTime * 1.9, uTime * 1.3));
wpos.xz += swW * (16.0 * pow(swH / 300.0, 2.0) + 0.06 * swH) * (1.0 + 0.35 * swF);
vec4 mvPosition = viewMatrix * wpos;
gl_Position = projectionMatrix * mvPosition;
`;

// devolve uma cópia do material que balança com o vento
const swayCache = new Map();
export function swaying(material) {
  if (swayCache.has(material)) return swayCache.get(material);
  const m = material.clone();
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + WIND_GLSL)
      .replace('#include <project_vertex>', SWAY_GLSL);
  };
  m.customProgramCacheKey = () => 'sway:' + material.type;
  swayCache.set(material, m);
  return m;
}

// lado CPU (partículas): mesmo comportamento, ruído Perlin do jogo
const perlin = makePerlin(4242);
export function windAt(x, y, t) {
  const d = windUniforms.uWindDir.value, s = windUniforms.uWindStr.value;
  const g = perlin.noise(x * 0.0016 - d.x * t * 0.32, y * 0.0016 - d.y * t * 0.32);
  const k = s * (0.62 + 0.55 * g);
  return [d.x * k, d.y * k];
}

// atualiza direção (muda devagar) e força (rajadas no tempo)
export function updateWind(t) {
  windUniforms.uTime.value = t;
  const base = THREE.MathUtils.degToRad(windSettings.direction);
  const a = base + perlin.noise(t * 0.03, 7.3) * 0.6;
  windUniforms.uWindDir.value.set(Math.cos(a), Math.sin(a));
  windUniforms.uWindStr.value = windSettings.strength * (1 - windSettings.gust * 0.5 + windSettings.gust * 0.5 * (perlin.noise(t * 0.17, 3.1) + 1));
}
