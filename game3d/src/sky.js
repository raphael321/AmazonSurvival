import * as THREE from 'three';

// Céu: cúpula com gradiente (horizonte com névoa → azul no alto), disco do sol com halo
// e nuvens de ruído que passam devagar. A neblina do mundo usa a cor do horizonte,
// então o terreno distante se funde no céu (perspectiva atmosférica).

export const SKY = {
  zenith: new THREE.Color('#5d9bd1'),
  horizon: new THREE.Color('#cfe0d6'),
  sun: new THREE.Color('#fff2c8'),
};

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // sempre no fundo
}`;

const FRAG = /* glsl */ `
uniform vec3 uZenith, uHorizon, uSun, uSunDir;
uniform float uTime;
varying vec3 vDir;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.55, up), 0.8));
  // sol e halo
  float s = max(dot(d, uSunDir), 0.0);
  col += uSun * (pow(s, 900.0) * 1.2 + pow(s, 18.0) * 0.28);
  // nuvens: ruído projetado no alto, faixas chapadas (estilo toon)
  if (d.y > 0.02) {
    vec2 uv = d.xz / (d.y + 0.15) * 1.6 + vec2(uTime * 0.008, uTime * 0.003);
    float n = vnoise(uv) * 0.6 + vnoise(uv * 2.3) * 0.3 + vnoise(uv * 5.1) * 0.1;
    float c = smoothstep(0.55, 0.62, n) * smoothstep(0.02, 0.2, d.y);
    col = mix(col, vec3(0.98, 0.97, 0.94), c * 0.85);
    col = mix(col, vec3(0.86, 0.88, 0.9), smoothstep(0.62, 0.75, n) * c * 0.4);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor(scene, sunDir) {
    this.uniforms = {
      uZenith: { value: SKY.zenith },
      uHorizon: { value: SKY.horizon },
      uSun: { value: SKY.sun },
      uSunDir: { value: sunDir.clone().normalize() },
      uTime: { value: 0 },
    };
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.mesh.scale.setScalar(12000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
  }

  update(t, camera) {
    this.uniforms.uTime.value = t;
    this.mesh.position.copy(camera.position);
  }
}
