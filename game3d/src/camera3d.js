import * as THREE from 'three';

// Câmera do jogo com dois modos:
// - 'terceira': atrás do personagem, baixa, girada pelo mouse (clique trava o mouse; Esc solta;
//   sem trava, arrastar com o botão direito também gira). Roda = distância.
// - 'tatica': vista de cima 3/4, fixa a 45° (a visão anterior).
// Coordenadas do jogo: x leste, y sul, z cima; three = (x, z, y).

export class GameCamera {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.mode = 'terceira';
    this.yaw = -Math.PI * 0.75; // olhando para noroeste (mesmo lado da visão tática)
    this.pitch = 0.3; // radianos acima do horizonte
    this.dist = 470;
    this.tactical = { dist: 1150, pitch: 38 };
    this.target = new THREE.Vector3();
    this.locked = false;
    this.dragging = false;
    this.sens = 0.0026;
    this.idle = 9; // segundos sem mexer o mouse (a câmera volta para trás do personagem)
    dom.addEventListener('mousedown', (e) => {
      if (this.mode !== 'terceira') return;
      if (e.button === 2) this.dragging = true;
      // trava o mouse ao clicar (opcional: alguns ambientes recusam)
      if (e.button === 0 && !this.locked && dom.requestPointerLock) {
        try { const p = dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* sem trava: usa arrastar */ }
      }
    });
    addEventListener('mouseup', (e) => { if (e.button === 2) this.dragging = false; });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; });
    addEventListener('mousemove', (e) => {
      if (this.mode !== 'terceira' || !(this.locked || this.dragging)) return;
      this.yaw += e.movementX * this.sens;
      this.idle = 0;
      this.pitch = THREE.MathUtils.clamp(this.pitch + e.movementY * this.sens, -0.35, 1.25);
    });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = 1 + Math.sign(e.deltaY) * 0.1;
      if (this.mode === 'terceira') this.dist = THREE.MathUtils.clamp(this.dist * k, 160, 1200);
      else this.tactical.dist = THREE.MathUtils.clamp(this.tactical.dist * k, 400, 4000);
    }, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // andando para frente, sem mexer o mouse: a câmera volta devagar para trás do personagem
  follow(dt, heading, moving) {
    this.idle += dt;
    if (this.mode !== 'terceira' || !moving || this.idle < 0.8) return;
    const d = Math.atan2(Math.sin(heading - this.yaw), Math.cos(heading - this.yaw));
    if (Math.abs(d) > 1.9) return; // andando de costas/de lado: não gira (evita rodar sem parar)
    this.yaw += d * (1 - Math.exp(-dt * 1.6));
  }

  toggle() {
    this.mode = this.mode === 'terceira' ? 'tatica' : 'terceira';
    if (this.mode === 'tatica' && document.exitPointerLock && this.locked) document.exitPointerLock();
  }

  // direção "para frente" e "direita" no chão (coordenadas do jogo), para o WASD
  basis() {
    if (this.mode === 'tatica') {
      const f = [-Math.SQRT1_2, -Math.SQRT1_2];
      return { fwd: f, right: [-f[1], f[0]] };
    }
    const f = [Math.cos(this.yaw), Math.sin(this.yaw)];
    return { fwd: f, right: [-f[1], f[0]] };
  }

  // ground(x, y) = altura do chão: a câmera nunca entra no terreno
  update(dt, px, py, pz, ground) {
    const goal = new THREE.Vector3(px, pz + (this.mode === 'terceira' ? 72 : 40), py);
    this.target.lerp(goal, 1 - Math.exp(-dt * (this.mode === 'terceira' ? 14 : 6)));
    const cam = this.camera;
    let pos;
    if (this.mode === 'terceira') {
      const f = [Math.cos(this.yaw), Math.sin(this.yaw)];
      const ch = Math.cos(this.pitch), sh = Math.sin(this.pitch);
      let d = this.dist;
      // se um morro fica entre a câmera e o personagem, aproxima a câmera
      for (let k = 1; k <= 6; k++) {
        const t = (k / 6) * d;
        const x = this.target.x - f[0] * ch * t, y = this.target.z - f[1] * ch * t, z = this.target.y + sh * t;
        if (ground(x, y) + 18 > z) { d = Math.max(90, t * 0.85); break; }
      }
      pos = new THREE.Vector3(this.target.x - f[0] * ch * d, this.target.y + sh * d, this.target.z - f[1] * ch * d);
      const g = ground(pos.x, pos.z) + 22;
      if (pos.y < g) pos.y = g;
      cam.position.lerp(pos, 1 - Math.exp(-dt * 18));
      cam.lookAt(this.target.x, this.target.y + 10, this.target.z);
    } else {
      const p = THREE.MathUtils.degToRad(this.tactical.pitch), D = this.tactical.dist;
      pos = new THREE.Vector3(this.target.x + Math.cos(p) * D * 0.7071, this.target.y + Math.sin(p) * D, this.target.z + Math.cos(p) * D * 0.7071);
      cam.position.copy(pos);
      cam.lookAt(this.target);
    }
  }

  // ponto de mira no chão à frente (para o golpe virar para onde a câmera olha)
  aim(px, py) {
    const { fwd } = this.basis();
    return [px + fwd[0] * 100, py + fwd[1] * 100];
  }
}
