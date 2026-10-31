import { SCHEMA, DEFAULTS, T } from '../world/gen.js';

// Debugger do mundo (F1 ou `): painel no estilo Tweakpane com pastas recolhíveis,
// controle deslizante + caixa numérica, métricas de streaming, minimapa com relevo
// sombreado, grade de chunks/tiles e modo voo. Parâmetros salvos no navegador.

const STORE = 'amazon-survival:world-params:v2';

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
  font:600 12px ui-monospace,Menlo,Consolas,monospace;color:#c8ccd4;background:#1e2127;border:1px solid #2f343d;border-radius:6px;padding:7px 11px;cursor:pointer}
#dbg{position:fixed;top:max(10px,env(safe-area-inset-top,0px));right:max(10px,env(safe-area-inset-right,0px));z-index:21;width:min(300px,calc(100vw - 20px));
  max-height:calc(100% - 20px);overflow-y:auto;box-sizing:border-box;background:#1e2127;border:1px solid #2f343d;border-radius:8px;
  color:#c8ccd4;font:11px/1.3 ui-monospace,Menlo,Consolas,monospace;box-shadow:0 8px 24px rgba(0,0,0,.45)}
#dbg[hidden],#dbg .body[hidden]{display:none!important}
#dbg .bar{display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:#262a31;border-bottom:1px solid #2f343d;position:sticky;top:0;z-index:1}
#dbg .bar b{font-weight:700;color:#e3e6ea;letter-spacing:.02em}
#dbg .bar button{background:none;border:0;color:#8b919c;font:inherit;cursor:pointer;padding:2px 6px;border-radius:4px}
#dbg .bar button:hover{background:#30353e;color:#e3e6ea}
#dbg details{border-top:1px solid #2a2e36}
#dbg details details{border-top:0;margin-left:8px}
#dbg summary{cursor:pointer;list-style:none;padding:6px 8px;font-weight:700;color:#e3e6ea;user-select:none}
#dbg summary::-webkit-details-marker{display:none}
#dbg summary::before{content:"▸";display:inline-block;width:12px;color:#8b919c;transition:transform .12s}
#dbg details[open]>summary::before{transform:rotate(90deg)}
#dbg .row{display:grid;grid-template-columns:86px 1fr 52px;gap:6px;align-items:center;padding:3px 8px 3px 20px}
#dbg .row label{color:#9aa0aa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#dbg input[type=range]{width:100%;min-width:0;accent-color:#3d8bfd;margin:0}
#dbg input[type=number]{width:100%;box-sizing:border-box;background:#2a2e36;border:1px solid #353a44;border-radius:4px;color:#e3e6ea;font:inherit;padding:3px 4px;text-align:right;font-variant-numeric:tabular-nums}
#dbg input[type=number]::-webkit-inner-spin-button{opacity:.4}
#dbg .stats{margin:6px 8px;padding:7px 8px;background:#15171b;border-radius:6px;white-space:pre;font-variant-numeric:tabular-nums;color:#b5bac3}
#dbg .toggles{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;padding:4px 8px 8px 20px}
#dbg .toggles label{display:flex;gap:6px;align-items:center;cursor:pointer;color:#9aa0aa}
#dbg .btns{display:flex;flex-wrap:wrap;gap:6px;padding:8px}
#dbg .btns button{font:inherit;color:#e3e6ea;background:#2f343d;border:1px solid #3a404b;border-radius:5px;padding:5px 9px;cursor:pointer}
#dbg .btns button:hover{background:#3a404b}
#dbg button:focus-visible,#dbg input:focus-visible,#dbg summary:focus-visible,#dbg-toggle:focus-visible{outline:2px solid #3d8bfd;outline-offset:1px}
#dbg canvas{display:block;width:calc(100% - 16px);margin:4px 8px 8px;aspect-ratio:1;image-rendering:pixelated;border-radius:6px;background:#15171b}
`;

const MAP = 128;

export class DebugPanel {
  constructor({ params, onChange, toggles }) {
    this.params = { ...params };
    this.onChange = onChange;
    this.toggles = toggles;
    this.timer = 0;
    this.build();
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
    btn.textContent = 'Debug (`)';
    btn.addEventListener('click', () => this.toggle());
    document.body.appendChild(btn);

    const el = document.createElement('aside');
    el.id = 'dbg';
    el.hidden = true;
    el.innerHTML = `
      <div class="bar"><b>Mundo</b><span><button type="button" data-act="fold" aria-label="Recolher">—</button><button type="button" data-act="close" aria-label="Fechar">✕</button></span></div>
      <div class="body">
        <details open><summary>Monitor</summary>
          <div class="stats">…</div>
          <canvas width="${MAP}" height="${MAP}" aria-label="Minimapa do relevo"></canvas>
        </details>
        <details><summary>Visualização</summary>
          <div class="toggles">
            <label><input type="checkbox" id="dbg-grid"> chunks</label>
            <label><input type="checkbox" id="dbg-tiles"> tiles</label>
            <label><input type="checkbox" id="dbg-fly"> modo voo</label>
            <label><input type="checkbox" id="dbg-light"> raios de sol</label>
          </div>
        </details>
        <div class="folders"></div>
        <div class="btns">
          <button type="button" data-act="seed">Nova seed</button>
          <button type="button" data-act="reset">Padrão</button>
          <button type="button" data-act="copy">Copiar JSON</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.body = el.querySelector('.body');
    this.statsEl = el.querySelector('.stats');
    this.map = el.querySelector('canvas');

    for (const id of ['grid', 'fly', 'light', 'tiles']) {
      const cb = el.querySelector('#dbg-' + id);
      cb.checked = !!this.toggles[id];
      cb.addEventListener('change', () => { this.toggles[id] = cb.checked; });
    }

    // pastas e subpastas a partir do SCHEMA
    const host = el.querySelector('.folders');
    const folders = {};
    this.inputs = {};
    for (const s of SCHEMA) {
      if (!folders[s.folder]) {
        const d = document.createElement('details');
        d.open = s.folder === 'Terreno';
        d.innerHTML = `<summary>${s.folder}</summary>`;
        host.appendChild(d);
        folders[s.folder] = { el: d, subs: {} };
      }
      const f = folders[s.folder];
      if (!f.subs[s.sub]) {
        const d = document.createElement('details');
        d.open = true;
        d.innerHTML = `<summary>${s.sub}</summary>`;
        f.el.appendChild(d);
        f.subs[s.sub] = d;
      }
      const row = document.createElement('div');
      row.className = 'row';
      const title = s.unit ? `${s.label} (${s.unit})` : s.label;
      row.innerHTML = `<label for="dbg-${s.key}" title="${title}">${s.label}</label>
        <input type="range" id="dbg-${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" aria-label="${title}">
        <input type="number" id="dbg-${s.key}-n" min="${s.min}" max="${s.max}" step="${s.step}" aria-label="${title} (valor)">`;
      f.subs[s.sub].appendChild(row);
      const range = row.querySelector('input[type=range]'), num = row.querySelector('input[type=number]');
      const dec = s.step < 0.01 ? 3 : s.step < 0.1 ? 2 : s.step < 1 ? 1 : 0;
      const show = () => {
        range.value = this.params[s.key];
        num.value = (+this.params[s.key]).toFixed(dec);
      };
      show();
      range.addEventListener('input', () => {
        this.params[s.key] = +range.value;
        num.value = (+range.value).toFixed(dec);
        this.changed();
      });
      // caixa numérica aceita valores fora da faixa do controle (para experimentar)
      num.addEventListener('change', () => {
        const v = parseFloat(num.value);
        if (!Number.isFinite(v)) { show(); return; }
        this.params[s.key] = v;
        range.value = v;
        this.changed(true);
      });
      this.inputs[s.key] = { show };
    }

    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') this.toggle(false);
      if (act === 'fold') this.body.hidden = !this.body.hidden;
      if (act === 'seed') this.set({ seed: 1 + Math.floor(Math.random() * 99998) });
      if (act === 'reset') this.set({ ...DEFAULTS });
      if (act === 'copy') {
        const txt = JSON.stringify(this.params, null, 2);
        const p = navigator.clipboard?.writeText(txt);
        if (p) p.then(() => this.flash('JSON copiado'), () => this.flash('Não deu para copiar'));
      }
    });
    // teclas digitadas no painel não andam com o personagem
    el.addEventListener('keydown', (e) => {
      if (e.code === 'F1' || e.code === 'Backquote') return;
      const t = e.target;
      if (t.type === 'number' || (t.type === 'range' && e.code.startsWith('Arrow'))) e.stopPropagation();
    });
  }

  set(p) {
    Object.assign(this.params, p);
    for (const { show } of Object.values(this.inputs)) show();
    this.changed(true);
  }

  changed(now = false) {
    clearTimeout(this.debounce);
    const fire = () => { saveParams(this.params); this.onChange({ ...this.params }); };
    if (now) fire();
    else this.debounce = setTimeout(fire, 120);
  }

  flash(msg) {
    this.flashMsg = msg;
    this.flashUntil = performance.now() + 1500;
  }

  toggle(v) {
    this.el.hidden = v === undefined ? !this.el.hidden : !v;
    if (this.el.hidden && this.el.contains(document.activeElement)) document.activeElement.blur();
  }

  get open() {
    return !this.el.hidden;
  }

  update(dt, info, world, player) {
    if (!this.open || this.body.hidden) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const g = world.gen, s = world.stats;
    const ti = Math.floor(player.x / T), tj = Math.floor(player.y / T);
    const h = g.h(ti, tj);
    const bio = h < 0 ? 'água' : g.isForest(ti, tj) ? 'mata fechada' : h >= g.rockLevel ? 'rocha' : 'chão';
    let txt =
      `fps        ${info.fps.toFixed(0)}\n` +
      `tile       ${ti}, ${tj}  nível ${h}  ${bio}\n` +
      `chunks     ${world.chunks.size}  ${(s.chunkMB || 0).toFixed(0)} MB  escala ${world.rs}\n` +
      `fila       ${s.queue}  pintando ${world.jobs.size}\n` +
      `pintura    ${s.paintMs.toFixed(1)} ms/chunk  ${(s.frameMs || 0).toFixed(1)} ms/quadro\n` +
      `total      ${s.painted} pintados  ${s.evicted} descartados\n` +
      `objetos    ${info.drawn} na tela  ${world.bank.size} sprites`;
    if (this.flashMsg && performance.now() < this.flashUntil) txt += `\n${this.flashMsg}`;
    this.statsEl.textContent = txt;
    this.drawMap(world, player);
  }

  // minimapa: cor por altitude + sombreamento por inclinação (luz do noroeste)
  drawMap(world, player) {
    const g = world.gen;
    const ctx = this.map.getContext('2d');
    const img = ctx.createImageData(MAP, MAP);
    const ci = Math.floor(player.x / T) - MAP / 2, cj = Math.floor(player.y / T) - MAP / 2;
    const top = Math.max(1, g.maxLand);
    for (let y = 0; y < MAP; y++)
      for (let x = 0; x < MAP; x++) {
        const i = ci + x, j = cj + y;
        const h = g.h(i, j);
        let c;
        if (h < 0) {
          const d = g.deep(i, j);
          c = [138 - 60 * d, 110 - 45 * d, 64 - 25 * d];
        } else {
          const f = h / top;
          if (h >= g.rockLevel) c = [128 + 40 * f, 122 + 36 * f, 100 + 30 * f];
          else if (g.isForest(i, j)) c = [38, 62, 40];
          else c = [92 + 10 * f, 98 + 30 * f, 56 + 6 * f];
          // relevo sombreado: diferença de altura com o vizinho do noroeste
          const slope = h - Math.max(0, g.h(i - 1, j - 1));
          const k = 1 + Math.max(-0.35, Math.min(0.35, slope * 0.18));
          c = c.map((v) => v * k);
        }
        const o = (y * MAP + x) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = '#ff5a3c';
    ctx.fillRect(MAP / 2 - 1, MAP / 2 - 1, 3, 3);
  }
}
