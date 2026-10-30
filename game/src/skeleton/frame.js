// Referencial do corpo: posição no chão + direção para frente.
// Coordenadas locais: f (frente), s (lado direito), z (altura).

export class Frame {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.fwd = [1, 0];
    this.right = [0, 1];
  }

  set(x, y, angle) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.fwd = [Math.cos(angle), Math.sin(angle)];
    this.right = [-Math.sin(angle), Math.cos(angle)];
    return this;
  }

  // local -> mundo
  w(f, s, z, yaw = 0) {
    let fx = this.fwd[0], fy = this.fwd[1], rx = this.right[0], ry = this.right[1];
    if (yaw) {
      const c = Math.cos(yaw), n = Math.sin(yaw);
      [fx, fy, rx, ry] = [fx * c + rx * n, fy * c + ry * n, rx * c - fx * n, ry * c - fy * n];
    }
    return [this.x + fx * f + rx * s, this.y + fy * f + ry * s, z];
  }

  // direção local -> mundo (sem translação)
  dir(f, s, z, yaw = 0) {
    const p = this.w(f, s, z, yaw);
    return [p[0] - this.x, p[1] - this.y, z];
  }
}
