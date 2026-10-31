import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { toonRamp, INK } from './toon.js';

// Animais com esqueleto (auto-rig da Tripo): o modelo vem com ossos e, às vezes, com
// animações prontas (ex.: "preset:quadruped:walk"). Onde há animação, ela toca no ritmo da
// velocidade do bicho; onde não há, os ossos são movidos por código (passo, cauda, pescoço).
// Por cima de tudo, uma camada procedural: olhar, rugir, pastar, deitar, inclinar no terreno.

export const RIG_FILES = { amazon: 'assets/rig-amazonssauro.glb', onca: 'assets/rig-onca.glb' };

export async function loadRigs(base = '') {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const out = {};
  for (const [kind, f] of Object.entries(RIG_FILES)) {
    try {
      const b64 = typeof window !== 'undefined' && window.__EMBEDDED_ASSETS && window.__EMBEDDED_ASSETS[f];
      const gltf = b64 ? await loader.parseAsync(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer, '') : await loader.loadAsync(base + f);
      out[kind] = gltf;
    } catch (e) {
      console.warn('rig não carregou', f, e);
    }
  }
  return out;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

export class RigBody {
  constructor(scene, gltf, sp) {
    this.scene = scene;
    this.root = SkeletonUtils.clone(gltf.scene);
    this.root.updateMatrixWorld(true);
    // material toon com a textura pintada + contorno de tinta preso ao mesmo esqueleto
    this.root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.material = new THREE.MeshToonMaterial({ map: o.material.map, gradientMap: toonRamp() });
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      const g = o.geometry.clone(), pos = g.attributes.position, nor = g.attributes.normal;
      const box = new THREE.Box3().setFromBufferAttribute(pos), t = box.getSize(_v).length() * 0.0035;
      const p = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { p[i * 3] = pos.getX(i) + nor.getX(i) * t; p[i * 3 + 1] = pos.getY(i) + nor.getY(i) * t; p[i * 3 + 2] = pos.getZ(i) + nor.getZ(i) * t; }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const ink = new THREE.SkinnedMesh(g, inkMat);
      ink.bind(o.skeleton, o.bindMatrix);
      ink.frustumCulled = false;
      o.parent.add(ink);
    });
    // ossos por nome (a Tripo usa "tripo::Spine_0", "tripo::0_Left_Limb_1"...)
    this.bones = {};
    // (o carregador do three tira os ':' dos nomes: "tripo::Spine_0" chega como "tripoSpine_0")
    this.root.traverse((o) => { if (o.isBone) this.bones[o.name.replace(/^tripo:*/, '')] = o; });
    for (const b of Object.values(this.bones)) b.userData.rest = b.quaternion.clone();
    // medidas na pose de descanso: comprimento, altura, para que lado a cabeça olha
    const box = new THREE.Box3().setFromObject(this.root, true);
    const size = box.getSize(new THREE.Vector3());
    const wp = (n) => (this.bones[n] ? this.bones[n].getWorldPosition(new THREE.Vector3()) : null);
    const head = wp('Head_2') || wp('Head_0'), tail = wp('Tail_2') || wp('Tail_0');
    const alongX = size.x >= size.z;
    // ângulo que leva a cabeça do modelo para +X
    const hd = head && tail ? new THREE.Vector3().subVectors(head, tail) : new THREE.Vector3(alongX ? 1 : 0, 0, alongX ? 0 : 1);
    this.yawFix = Math.atan2(hd.z, hd.x); // rotação em Y que alinha a cabeça com +X
    this.len = Math.max(size.x, size.z);
    this.height = size.y;
    this.baseY = box.min.y;
    this.scale = sp.length / this.len;
    // eixos do modelo (no espaço da raiz): frente, cima, lado
    this.fwd = new THREE.Vector3(Math.cos(this.yawFix), 0, Math.sin(this.yawFix));
    this.side = new THREE.Vector3().crossVectors(this.fwd, Y).normalize(); // aponta para a direita
    // cada osso: eixo do "lado" e do "cima" no espaço local do osso (para girar no plano certo)
    const rootInv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    for (const b of Object.values(this.bones)) {
      // eixo no espaço do próprio osso (a rotação extra é multiplicada à direita da pose de descanso)
      const wq = new THREE.Quaternion().setFromRotationMatrix(_m.multiplyMatrices(rootInv, b.matrixWorld));
      const inv = wq.clone().invert();
      b.userData.sideAxis = this.side.clone().applyQuaternion(inv).normalize();
      b.userData.upAxis = Y.clone().applyQuaternion(inv).normalize();
      b.userData.pos = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInv);
    }
    // pernas: cadeia Limb_0..3 por lado; frente/trás pela posição ao longo do corpo
    this.legs = [];
    for (const pre of ['0', '1']) for (const s of ['Left', 'Right']) {
      const chain = [0, 1, 2, 3].map((k) => this.bones[`${pre}_${s}_Limb_${k}`]).filter(Boolean);
      if (!chain.length) continue;
      const along = chain[0].userData.pos.dot(this.fwd);
      this.legs.push({ chain, along, left: s === 'Left' });
    }
    const mid = this.legs.reduce((a, l) => a + l.along, 0) / Math.max(1, this.legs.length);
    for (const l of this.legs) {
      l.front = this.legs.length > 2 ? l.along > mid : false;
      l.off = (l.front ? 0.25 : 0) + (l.left ? 0 : 0.5);
    }
    this.tail = ['Tail_0', 'Tail_1', 'Tail_2'].map((n) => this.bones[n]).filter(Boolean);
    this.neck = ['Head_0', 'Head_1', 'Head_2'].map((n) => this.bones[n]).filter(Boolean);
    // animações prontas
    this.mixer = gltf.animations.length ? new THREE.AnimationMixer(this.root) : null;
    this.walk = null;
    if (this.mixer) {
      const clip = gltf.animations.find((c) => /walk/i.test(c.name)) || gltf.animations[0];
      this.walk = this.mixer.clipAction(clip);
      this.walk.play();
      this.walk.setEffectiveWeight(0);
      this.clipLen = clip.duration;
    }
    this.group = new THREE.Group();
    this.group.rotation.order = 'YZX';
    // gira o modelo para a cabeça ficar em +X e a base no chão
    this.root.rotation.y = this.yawFix;
    this.root.position.y = -this.baseY;
    this.group.add(this.root);
    scene.add(this.group);
    this.pitch = 0;
    this.prevA = null;
    this.look = 0;
    this.turn = 0;
  }

  dispose() {
    this.scene.remove(this.group);
  }

  rot(b, axis, ang) {
    if (!b || !ang) return;
    b.quaternion.multiply(_q.setFromAxisAngle(b.userData[axis], ang));
  }

  update(d, world, visible, dt) {
    this.group.visible = visible;
    if (!visible) return;
    const sp = d.sp, k = this.scale * d.scale;
    const fx = Math.cos(d.a), fy = Math.sin(d.a);
    const v = d.speed / d.scale;
    const moving = Math.min(1, v / 15);
    const run = clamp((v - sp.walk) / (sp.run - sp.walk), 0, 1);
    // posição, direção e inclinação com o terreno
    const L = this.len * k;
    const gB = world.groundZ(d.x - fx * L * 0.3, d.y - fy * L * 0.3), gF = world.groundZ(d.x + fx * L * 0.3, d.y + fy * L * 0.3);
    const gC = world.groundZ(d.x, d.y);
    const slopeT = clamp(Math.atan2(gF - gB, L * 0.6), -0.3, 0.3) * (1 - d.swim);
    this.pitch += (slopeT - this.pitch) * 0.1;
    const restDrop = d.rest * this.height * k * 0.38;
    // agachada ao rodear (corpo baixo, pronta para o bote) e altura do pulo
    const crouchDrop = (d.crouch || 0) * this.height * k * 0.18;
    this.group.position.set(d.x, Math.min(gC, (gB + gF) / 2) - 2 - restDrop - crouchDrop - d.swim * this.height * k * 0.6 + (d.jz || 0), d.y);
    // no pulo o corpo sobe de nariz e desce de nariz
    const leapPitch = d.jz > 0 ? clamp((d.vz || 0) / 1400, -0.35, 0.35) : 0;
    this.group.rotation.set(0, -d.a, this.pitch + leapPitch);
    this.group.scale.setScalar(k);
    // ossos: volta para a pose de descanso, depois animação pronta e camada procedural
    for (const b of Object.values(this.bones)) b.quaternion.copy(b.userData.rest);
    if (this.mixer) {
      // a animação de andar acelera com a velocidade (passada de corrida = mesma, mais rápida)
      this.walk.setEffectiveWeight(moving * (1 - d.rest));
      this.walk.timeScale = clamp(v / sp.walk, 0.3, 2.6);
      this.mixer.update(dt);
    } else {
      // sem animação: passo por código (coxa balança, joelho dobra no balanço, pé acompanha)
      const amp = (0.38 + run * 0.25) * moving * (1 - d.rest);
      for (const l of this.legs) {
        const ph = Math.PI * 2 * (d.phase + l.off);
        const s = Math.sin(ph), lift = Math.max(0, Math.cos(ph));
        this.rot(l.chain[0], 'sideAxis', -s * amp);
        this.rot(l.chain[1], 'sideAxis', (l.front ? -1 : 1) * lift * amp * 0.9);
        this.rot(l.chain[2], 'sideAxis', (l.front ? 1 : -1) * lift * amp * 0.6);
      }
    }
    // deitado: patas dobradas para baixo do corpo
    if (d.rest > 0.01) for (const l of this.legs) {
      this.rot(l.chain[0], 'sideAxis', (l.front ? -0.9 : 0.9) * d.rest);
      this.rot(l.chain[1], 'sideAxis', (l.front ? 1.5 : -1.5) * d.rest);
    }
    // cauda: onda que corre para a ponta e curva nas viradas
    const turn = this.prevA === null ? 0 : angDiff(this.prevA, d.a) / Math.max(dt, 1e-3);
    this.prevA = d.a;
    this.turn += (clamp(-turn * 0.4, -0.5, 0.5) - this.turn) * 0.08;
    this.tail.forEach((b, i) => {
      const w = Math.sin(d.t * (1.4 + run * 3) - i * 0.9) * (0.1 + 0.06 * i);
      this.rot(b, 'upAxis', w + this.turn * (0.4 + i * 0.3));
      this.rot(b, 'sideAxis', -d.rest * 0.15);
    });
    // pescoço e cabeça: rugido ergue, pastar abaixa, olha em volta parado
    const roar = d.state === 'roar' && !sp.crouch ? 1 : 0, eat = d.state === 'eat' ? 1 : 0;
    // rodeando: cabeça baixa e fixa no alvo
    const stalkHead = d.state === 'stalk' ? -0.15 : 0;
    const pitchT = roar * 0.35 - eat * 0.45 - d.rest * 0.25 + stalkHead + Math.sin(d.t * 0.7) * 0.03;
    this.look += (pitchT - this.look) * 0.08;
    const yawT = Math.sin(d.t * 0.4 + d.id) * 0.25 * (1 - moving);
    const shake = roar && d.timer < 1.3 && d.timer > 0.2 ? Math.sin(d.t * 34) * 0.06 : 0;
    this.neck.forEach((b) => {
      this.rot(b, 'sideAxis', this.look / this.neck.length);
      this.rot(b, 'upAxis', (yawT + shake) / this.neck.length);
    });
    this.root.updateMatrixWorld(true);
    // pontos no mundo: boca (mordida), quadril e peito (empurrar o jogador)
    const w = (b) => b.getWorldPosition(_v);
    const toGame = (p) => [p.x, p.z, p.y];
    const head = this.neck[this.neck.length - 1];
    if (head) d.mouth = toGame(w(head));
    d.pelvis = toGame(w(this.bones.Spine_0 || this.bones.Root));
    d.chest = toGame(w(this.neck[0] || this.bones.Spine_1 || this.bones.Root));
    d.bodyR = this.height * k * 0.3;
  }
}
