import { SCHEMA, DEFAULTS, T } from '../world/gen.js';

// Debugger do mundo (F1 ou `): edita os parâmetros do ruído ao vivo, mostra métricas,
// minimapa do ruído, grade de chunks e modo voo. Os parâmetros ficam salvos no navegador.

const STORE = 'amazon-survival:world-params';

export function loadParams() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s && typeof s === 'object') return { ...DEFAULTS, ...s };
  } catch (e) { /* armazenamento indisponível: usa o padrão */ }
  return { ...DEFAULTS };
}

function saveParams(p) {
  try { localStorage.setItem(STORE, JSON.stringify(p)); } catch (e) { /* sem armazenamento */ }
}

const CSS = `
#dbg-toggle{position:fixed;right:max(12px,env(safe-area-inset-right,0px));bottom:max(12px,env(safe-area-inset-bottom,0px));z-index:20;
  font:600 13px "Trebuchet MS",system-ui,sans-serif;color:#f4ead2;background:#3a2a1c;border:2px solid #1d1a12;border-radius:6px;padding:7px 12px;cursor:pointer}
#dbg{position:fixed;top:0;right:0;bottom:0;width:min(330px,92vw);z-index:21;overflow-y:auto;box-sizing:border-box;
  padding:14px max(14px,env(safe-area-inset-right,0px)) 18px 14px;background:rgba(29,22,14,0.94);border-left:3px solid #1d1a12;
  color:#f4ead2;font:13px/1.35 "Trebuchet MS",system-ui,sans-serif;display:flex;flex-direction:column;gap:12px}
#dbg[hidden]{display:none!important}
#dbg h2{margin:0;font-size:15px;color:#d9c08a;letter-spacing:.04em;text-transform:uppercase;display:flex;justify-content:space-between;align-items:center}
#dbg h3{margin:0 0 6px;font-size:11px;color:#d9c08a;letter-spacing:.08em;text-transform:uppercase;opacity:.85}
#dbg .stats{font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;background:rgba(0,0,0,.35);border-radius:6px;padding:8px;white-space:pre;font-variant-numeric:tabular-nums}
#dbg .row{display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:center;margin-bottom:6px}
#dbg .row label{min-width:0}
#dbg .row output{font:12px ui-monospace,Menlo,Consolas,monospace;color:#d9c08a;font-variant-numeric:tabular-nums}
#dbg .row input[type=range]{grid-column:1/3;width:100%;accent-color:#d9c08a}
#dbg .toggles{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#dbg .toggles label{display:flex;gap:6px;align-items:center;cursor:pointer}
#dbg .btns{display:flex;flex-wrap:wrap;gap:6px}
#dbg button{font:600 12px "Trebuchet MS",system-ui,sans-serif;color:#f4ead2;background:#5a4128;border:2px solid #1d1a12;border-radius:5px;padding:6px 10px;cursor:pointer}
#dbg button:hover{background:#6b4a2e}
#dbg button:focus-visible,#dbg input:focus-visible,#dbg-toggle:focus-visible{outline:2px solid #f2c46b;outline-offset:2px}
#dbg canvas{width:100%;max-width:300px;aspect-ratio:1;image-rendering:pixelated;border:2px solid #1d1a12;border-radius:6px;align-self:center}
#dbg .legend{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11px;opacity:.85}
#dbg .legend i{display:inline-block;width:9px;height:9px;margin-right:4px;border:1px solid #1d1a12;vertical-align:-1px}
`;

const MAP_COLORS = { water: [138, 106, 58], deep: [74, 58, 34], floor: [96, 90, 54], mound: [125, 138, 82], high: [163, 173, 106], forest: [31, 51, 36] };
const MAP_TILES = 128;

export class DebugPanel {
  constructor({ params, onChange, toggles }) {
    this.params = { ...params };
    this.onChange = onChange;
    this.toggles = toggles; // { grid, fly, minimap, light } -> valores iniciais
    this.build();
    this.timer = 0;
    addEventListener('keydown', (e) => {
      if (e.code === 'F1' || e.code === 'Backquote') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  build() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const btn = document.createElement('button');
    btn.id = 'dbg-toggle';
    btn.type = 'button';
    btn.textContent = 'Debug (F1)';
    btn.addEventListener('click', () => this.toggle());
    document.body.appendChild(btn);

    const el = document.createElement('aside');
    el.id = 'dbg';
    el.hidden = true;
    el.innerHTML = `<h2>Debugger do mundo <button type="button" data-act="close" aria-label="Fechar">✕</button></h2>
      <div class="stats" aria-live="off">…</div>
      <div><h3>Minimapa do ruído (${MAP_TILES}×${MAP_TILES} tiles)</h3><canvas width="${MAP_TILES}" height="${MAP_TILES}"></canvas>
      <div class="legend"><span><i style="background:rgb(${MAP_COLORS.floor})"></i>chão</span><span><i style="background:rgb(${MAP_COLORS.mound})"></i>morrote</span><span><i style="background:rgb(${MAP_COLORS.high})"></i>morrote alto</span><span><i style="background:rgb(${MAP_COLORS.forest})"></i>mata fechada</span><span><i style="background:rgb(${MAP_COLORS.water})"></i>rio</span><span><i style="background:#e3743b"></i>você</span></div></div>
      <div class="toggles">
        <label><input type="checkbox" id="dbg-grid"> Grade de chunks</label>
        <label><input type="checkbox" id="dbg-fly"> Modo voo</label>
        <label><input type="checkbox" id="dbg-light"> Raios de sol</label>
        <label><input type="checkbox" id="dbg-tiles"> Grade de tiles</label>
      </div>
      <div class="groups"></div>
      <div class="btns">
        <button type="button" data-act="seed">Nova seed</button>
        <button type="button" data-act="reset">Restaurar padrão</button>
        <button type="button" data-act="copy">Copiar parâmetros</button>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.statsEl = el.querySelector('.stats');
    this.map = el.querySelector('canvas');

    for (const id of ['grid', 'fly', 'light', 'tiles']) {
      const cb = el.querySelector('#dbg-' + id);
      cb.checked = !!this.toggles[id];
      cb.addEventListener('change', () => { this.toggles[id] = cb.checked; });
    }

    const groups = el.querySelector('.groups');
    let current = null;
    this.inputs = {};
    for (const s of SCHEMA) {
      if (s.group !== current) {
        current = s.group;
        const g = document.createElement('div');
        g.innerHTML = `<h3>${s.group}</h3>`;
        groups.appendChild(g);
        this.groupEl = g;
      }
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<label for="dbg-${s.key}">${s.label}</label><output id="dbg-${s.key}-v"></output>
        <input type="range" id="dbg-${s.key}" min="${s.min}" max="${s.max}" step="${s.step}">`;
      this.groupEl.appendChild(row);
      const input = row.querySelector('input'), out = row.querySelector('output');
      input.value = this.params[s.key];
      const show = () => { out.textContent = fmt(+input.value, s); };
      show();
      input.addEventListener('input', () => {
        this.params[s.key] = +input.value;
        show();
        this.changed();
      });
      this.inputs[s.key] = { input, show };
    }

    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') this.toggle(false);
      if (act === 'seed') this.set({ seed: 1 + Math.floor(Math.random() * 99998) });
      if (act === 'reset') this.set({ ...DEFAULTS });
      if (act === 'copy') {
        const txt = JSON.stringify(this.params, null, 2);
        navigator.clipboard?.writeText(txt).then(() => this.flash('Parâmetros copiados'), () => this.flash('Não deu para copiar'));
      }
    });
    // teclas do jogo não devem disparar enquanto se mexe num controle do painel
    // setas mexem no controle deslizante sem andar com o personagem
    el.addEventListener('keydown', (e) => { if (e.target.type === 'range' && e.code.startsWith('Arrow')) e.stopPropagation(); });
  }

  set(p) {
    Object.assign(this.params, p);
    for (const [k, { input, show }] of Object.entries(this.inputs)) { input.value = this.params[k]; show(); }
    this.changed(true);
  }

  changed(now = false) {
    clearTimeout(this.debounce);
    const fire = () => { saveParams(this.params); this.onChange({ ...this.params }); };
    if (now) fire();
    else this.debounce = setTimeout(fire, 140);
  }

  flash(msg) {
    this.flashMsg = msg;
    this.flashUntil = performance.now() + 1500;
  }

  toggle(v) {
    this.el.hidden = v === undefined ? !this.el.hidden : !v;
    // ao fechar, devolve o teclado para o jogo
    if (this.el.hidden && this.el.contains(document.activeElement)) document.activeElement.blur();
  }

  get open() {
    return !this.el.hidden;
  }

  // chamado todo quadro; atualiza o texto e o minimapa poucas vezes por segundo
  update(dt, info, world, player) {
    if (!this.open) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const ti = Math.floor(player.x / T), tj = Math.floor(player.y / T);
    const g = world.gen;
    const bio = g.h(ti, tj) < 0 ? 'rio' : g.isForest(ti, tj) ? 'mata fechada' : g.h(ti, tj) > 0 ? 'morrote' : 'chão de várzea';
    let txt =
      `FPS            ${info.fps.toFixed(0)}\n` +
      `tile           ${ti}, ${tj}  (${bio})\n` +
      `chunks         ${world.chunks.size} na memória\n` +
      `fila           ${world.stats.queue} esperando\n` +
      `pintura        ${world.stats.paintMs.toFixed(1)} ms/chunk  (${(world.stats.frameMs || 0).toFixed(1)} ms neste quadro)\n` +
      `em andamento   ${world.jobs.size} chunk(s)\n` +
      `pintados       ${world.stats.painted}   descartados ${world.stats.evicted}\n` +
      `blocos         ${world.blocks.size}   sprites ${world.bank.size}\n` +
      `objetos à vista ${info.drawn}`;
    if (this.flashMsg && performance.now() < this.flashUntil) txt += `\n${this.flashMsg}`;
    this.statsEl.textContent = txt;
    this.drawMap(world, player);
  }

  drawMap(world, player) {
    const g = world.gen;
    const ctx = this.map.getContext('2d');
    const img = ctx.createImageData(MAP_TILES, MAP_TILES);
    const ci = Math.floor(player.x / T) - MAP_TILES / 2, cj = Math.floor(player.y / T) - MAP_TILES / 2;
    for (let y = 0; y < MAP_TILES; y++)
      for (let x = 0; x < MAP_TILES; x++) {
        const i = ci + x, j = cj + y;
        const h = g.h(i, j);
        let c;
        if (h < 0) c = g.deep(i, j) > 0.5 ? MAP_COLORS.deep : MAP_COLORS.water;
        else if (g.isForest(i, j)) c = MAP_COLORS.forest;
        else c = h === 2 ? MAP_COLORS.high : h === 1 ? MAP_COLORS.mound : MAP_COLORS.floor;
        const k = (y * MAP_TILES + x) * 4;
        img.data[k] = c[0];
        img.data[k + 1] = c[1];
        img.data[k + 2] = c[2];
        img.data[k + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = '#e3743b';
    ctx.fillRect(MAP_TILES / 2 - 1, MAP_TILES / 2 - 1, 3, 3);
  }
}

function fmt(v, s) {
  const d = s.step < 0.01 ? 3 : s.step < 1 ? 2 : 0;
  return v.toFixed(d) + (s.unit ? ' ' + s.unit : '');
}
