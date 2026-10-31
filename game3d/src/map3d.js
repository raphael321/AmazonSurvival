// Mapa do jogo: minimapa no canto e mapa grande (tecla M), com relevo sombreado, rios,
// mata fechada, pontes marcadas e o jogador. A imagem do relevo é refeita só quando o
// jogador anda (amostragem do campo de altura), e as pontes são buscadas aos poucos.

const MINI = { samples: 96, step: 64, px: 176 }; // 96 amostras × 64 u ≈ 6 km de lado
const BIG = { samples: 220, step: 160, px: 560 }; // ≈ 35 km de lado

const CSS = `
#map-mini{position:fixed;bottom:max(12px,env(safe-area-inset-bottom,0px));right:max(12px,env(safe-area-inset-right,0px));z-index:15;
  width:${MINI.px}px;height:${MINI.px}px;border:3px solid #1d1a12;border-radius:10px;box-shadow:0 0 0 2px rgba(217,192,138,.45);background:#2a2418;cursor:pointer}
#map-big{position:fixed;inset:0;z-index:35;display:grid;place-items:center;background:rgba(11,17,12,.72)}
#map-big[hidden]{display:none!important}
#map-big figure{margin:0;padding:12px;background:#3a2a1c;border:3px solid #1d1a12;border-radius:10px;color:#f4ead2;font:600 13px "Trebuchet MS",system-ui,sans-serif;max-width:calc(100vw - 32px)}
#map-big canvas{display:block;width:min(${BIG.px}px,calc(100vw - 60px),calc(100vh - 140px));aspect-ratio:1;border-radius:6px}
#map-big figcaption{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:8px;color:#d9c08a}
#map-big figcaption i{display:inline-block;width:10px;height:10px;border:1px solid #1d1a12;margin:0 4px 0 10px;vertical-align:-1px}
`;

export class GameMap {
  constructor(world) {
    this.world = world;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.mini = this.makeCanvas(MINI);
    this.mini.id = 'map-mini';
    this.mini.title = 'Mapa (M)';
    this.mini.addEventListener('click', () => this.toggle());
    document.body.appendChild(this.mini);
    this.bigWrap = document.createElement('div');
    this.bigWrap.id = 'map-big';
    this.bigWrap.hidden = true;
    this.bigWrap.innerHTML = `<figure><div class="cv"></div><figcaption><span>Mapa · M fecha</span>
      <span><i style="background:#c9893b"></i>ponte<i style="background:#3a5c60"></i>rio/lagoa<i style="background:#2f4a2c"></i>mata fechada<i style="background:#9c9680"></i>rocha<i style="background:#e3743b"></i>você</span></figcaption></figure>`;
    this.big = this.makeCanvas(BIG);
    this.bigWrap.querySelector('.cv').appendChild(this.big);
    this.bigWrap.addEventListener('click', (e) => { if (e.target === this.bigWrap) this.toggle(false); });
    document.body.appendChild(this.bigWrap);
    this.layers = { mini: null, big: null };
    this.timer = 0;
    addEventListener('keydown', (e) => { if (e.code === 'KeyM') this.toggle(); });
  }

  makeCanvas(cfg) {
    const c = document.createElement('canvas');
    c.width = cfg.px * 2;
    c.height = cfg.px * 2;
    return c;
  }

  toggle(v) {
    this.bigWrap.hidden = v === undefined ? !this.bigWrap.hidden : !v;
    if (!this.bigWrap.hidden) this.layers.big = null; // refaz ao abrir
  }

  // relevo em ImageData: cor por altitude/bioma + sombreamento pela inclinação (luz do noroeste)
  terrainImage(cfg, cx, cy) {
    const f = this.world.field, n = cfg.samples, step = cfg.step;
    const img = new ImageData(n, n);
    const x0 = cx - (n / 2) * step, y0 = cy - (n / 2) * step;
    const H = new Float32Array((n + 1) * (n + 1));
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) H[j * (n + 1) + i] = f.H(x0 + i * step, y0 + j * step);
    const rockH = f.rockH;
    for (let j = 1; j <= n; j++)
      for (let i = 1; i <= n; i++) {
        const h = H[j * (n + 1) + i];
        let c;
        // água em tom frio só no mapa, para separar bem de margem e barro
        if (h < -6) c = [58, 92, 96];
        else if (h < 0) c = [92, 126, 120];
        else if (h < 5) c = [138, 112, 70];
        else if (h > rockH) c = [156, 150, 128];
        else if (f.forest(x0 + i * step, y0 + j * step)) c = [47, 74, 44];
        else { const t = Math.min(1, h / rockH); c = [86 + 10 * t, 108 + 14 * t, 58 + 4 * t]; }
        if (h >= 0) {
          const slope = h - H[(j - 1) * (n + 1) + (i - 1)];
          const k = 1 + Math.max(-0.35, Math.min(0.35, slope / (step * 0.6)));
          c = c.map((v) => v * k);
        }
        const o = ((j - 1) * n + (i - 1)) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    const layer = document.createElement('canvas');
    layer.width = n;
    layer.height = n;
    layer.getContext('2d').putImageData(img, 0, 0);
    return { layer, cx, cy, x0, y0, w: n * step };
  }

  draw(canvas, cfg, layerKey, player, budgetMs) {
    const L = this.layers[layerKey];
    const g = canvas.getContext('2d');
    const S = canvas.width;
    // relevo: refeito quando o jogador se afasta de 1/6 do mapa do centro da última imagem
    if (!L || Math.hypot(player.x - L.cx, player.y - L.cy) > L.w / 6) {
      this.layers[layerKey] = this.terrainImage(cfg, player.x, player.y);
    }
    const lay = this.layers[layerKey];
    const sc = S / lay.w; // px por unidade do mundo
    // centro no jogador
    const ox = S / 2 - (player.x - lay.x0) * sc, oy = S / 2 - (player.y - lay.y0) * sc;
    g.fillStyle = '#2a2418';
    g.fillRect(0, 0, S, S);
    g.imageSmoothingEnabled = true;
    g.drawImage(lay.layer, ox, oy, lay.w * sc, lay.w * sc);
    // pontes (buscadas aos poucos na área do mapa)
    const half = (S / 2) / sc;
    const br = this.world.bridges;
    br.prefetch(player.x - half, player.y - half, player.x + half, player.y + half, budgetMs);
    const toMap = (x, y) => [S / 2 + (x - player.x) * sc, S / 2 + (y - player.y) * sc];
    for (const b of br.inRect(player.x - half, player.y - half, player.x + half, player.y + half)) {
      const [a, c] = b.ends.map(([x, y]) => toMap(x, y));
      const w = Math.max(5, S / 70);
      g.lineCap = 'round';
      g.strokeStyle = '#1d1a12';
      g.lineWidth = w + 4;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke();
      g.strokeStyle = '#c9893b';
      g.lineWidth = w;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke();
    }
    // jogador: seta na direção em que olha
    const ang = Math.atan2(Math.sin(player.angle), Math.cos(player.angle));
    const r = Math.max(7, S / 32);
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(ang);
    g.beginPath();
    g.moveTo(r, 0); g.lineTo(-r * 0.7, r * 0.6); g.lineTo(-r * 0.35, 0); g.lineTo(-r * 0.7, -r * 0.6); g.closePath();
    g.fillStyle = '#e3743b'; g.fill();
    g.lineWidth = 2.5; g.strokeStyle = '#1d1a12'; g.stroke();
    g.restore();
  }

  update(dt, player) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    this.draw(this.mini, MINI, 'mini', player, 2);
    if (!this.bigWrap.hidden) this.draw(this.big, BIG, 'big', player, 6);
  }
}
