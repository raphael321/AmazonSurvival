// Pinta uma vez num canvas fora da tela e reaproveita.
// (ox, oy) = ponto de ancoragem dentro do sprite, em unidades de vista.

export function makeSprite(w, h, ox, oy, rs, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * rs);
  canvas.height = Math.ceil(h * rs);
  const ctx = canvas.getContext('2d');
  ctx.scale(rs, rs);
  ctx.translate(ox, oy);
  paint(ctx);
  return { canvas, w, h, ox, oy };
}

export function drawSprite(ctx, s, vx, vy) {
  ctx.drawImage(s.canvas, vx - s.ox, vy - s.oy, s.w, s.h);
}

// Desenha com balanço de vento: inclina em torno da base do sprite.
export function drawSwaying(ctx, s, vx, vy, skew) {
  ctx.save();
  ctx.translate(vx, vy);
  ctx.transform(1, 0, skew, 1, 0, 0);
  ctx.drawImage(s.canvas, -s.ox, -s.oy, s.w, s.h);
  ctx.restore();
}
