import { INK, PAL } from '../art/palette.js';
import { drawHeart } from '../art/fx.js';
import { drawFruit } from '../art/scenery.js';
import { TRUST_NEEDED } from '../entities/capybara.js';

// HUD desenhado por código, em pixels de tela (CSS).
const FONT = '"Trebuchet MS", "Segoe UI", sans-serif';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(58,42,28,0.92)';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(217,192,138,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 4, w - 8, h - 8, 5);
  ctx.stroke();
}

function text(ctx, s, x, y, size = 14, color = PAL.ui.text, align = 'left') {
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

export function drawHud(ctx, sw, sh, { player, capy, hint, fps, showFps }) {
  const s = sw < 600 ? 0.85 : 1;
  ctx.save();
  ctx.scale(s, s);
  panel(ctx, 12, 12, 220, 96);
  // vida
  text(ctx, 'Vida', 26, 32, 13, PAL.ui.straw);
  ctx.fillStyle = INK;
  ctx.fillRect(68, 24, 150, 16);
  ctx.fillStyle = '#5a1f16';
  ctx.fillRect(70, 26, 146, 12);
  ctx.fillStyle = PAL.fire[0];
  ctx.fillRect(70, 26, 146 * (player.hp / player.maxHp), 12);
  ctx.fillStyle = PAL.fire[2];
  ctx.fillRect(70, 26, 146 * (player.hp / player.maxHp), 4);
  // frutas
  drawFruit(ctx, 32, 60, 1.6);
  text(ctx, `Camu-camu × ${player.fruits}`, 46, 60, 14);
  // confiança da capivara
  text(ctx, 'Capivara', 26, 88, 13, PAL.ui.straw);
  if (capy.tamed) text(ctx, 'domada!', 92, 88, 13, '#9fd16b');
  else for (let i = 0; i < TRUST_NEEDED; i++) drawHeart(ctx, 100 + i * 20, 88, 1, i < capy.trust);
  ctx.restore();

  if (hint) {
    ctx.font = `bold 15px ${FONT}`;
    const w = ctx.measureText(hint).width + 32;
    panel(ctx, sw / 2 - w / 2, sh - 70, w, 34);
    text(ctx, hint, sw / 2, sh - 53, 15, PAL.ui.text, 'center');
  }

  if (sw > 700) text(ctx, 'WASD mover · Shift correr · Clique golpe · E interagir', 14, sh - 18, 12, 'rgba(244,234,210,0.85)');
  if (showFps) text(ctx, `${fps.toFixed(0)} FPS`, sw - 14, 22, 13, PAL.ui.straw, 'right');
}
