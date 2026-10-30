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

// Multiplica a cor do sprite (luz/sombra do lugar onde ele está), preservando a transparência.
export function tintSprite(s, rgb) {
  const { canvas } = s;
  const tmp = document.createElement('canvas');
  tmp.width = canvas.width;
  tmp.height = canvas.height;
  tmp.getContext('2d').drawImage(canvas, 0, 0);
  const g = canvas.getContext('2d');
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(tmp, 0, 0);
  g.restore();
  return s;
}

// Escala atual da tela (dpr × zoom). Com ela os sprites caem alinhados ao pixel do
// dispositivo e o navegador usa a cópia 1:1 (rápida), sem reamostrar a cada quadro.
let RS = 1;
export function setDeviceScale(rs) {
  RS = rs;
}
const snap = (v) => Math.round(v * RS) / RS;

export function drawSprite(ctx, s, vx, vy) {
  ctx.drawImage(s.canvas, snap(vx - s.ox), snap(vy - s.oy), s.w, s.h);
}

// Vento: copas balançam deslocando o topo (cópia rápida). Só a moita sacudida usa
// inclinação de verdade, que é mais cara.
export function drawSwaying(ctx, s, vx, vy, skew) {
  if (Math.abs(skew) < 0.04) {
    drawSprite(ctx, s, vx - skew * s.oy * 0.5, vy);
    return;
  }
  ctx.save();
  ctx.translate(vx, vy);
  ctx.transform(1, 0, skew, 1, 0, 0);
  ctx.drawImage(s.canvas, -s.ox, -s.oy, s.w, s.h);
  ctx.restore();
}
