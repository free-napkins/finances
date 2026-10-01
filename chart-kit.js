// ============================================================
// CHART KIT — the one chart engine shared by the Finances app and the
// Design Lab (design-lab/chart-kit.js is a copy of this file; keep them
// in sync). It knows:
//   TYPES       10 chart types (bar, pie, trend line, …)
//   DESIGNS     10 visual designs (how marks, grids and labels look)
//   PALETTES    10 color schemes (each validated colorblind-safe and
//               ≥3:1 against the Finances dark card)
//   ANIMATIONS  entrance animations for each chart type
// and draws any supported combination with ChartKit.render(el, spec).
//
// Data comes in one of three shapes:
//   { kind: 'categorical', items: [{ label, value, target? }] }
//   { kind: 'series', x: [labels], series: [{ name, values }], stacked?, reference?: { value, label } }
//   { kind: 'calendar', month: 'YYYY-MM', days: { 'YYYY-MM-DD': value } }
// ============================================================
(function (root) {
  'use strict';

  const VERSION = 1;
  const NS = 'http://www.w3.org/2000/svg';
  const OVER = '#FF6B6B'; // status: over target (always paired with a text label)

  const PALETTES = [
    { id: 'aurora', name: 'Aurora', tagline: 'Balanced, colorblind-safe default.', colors: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'] },
    { id: 'neon', name: 'Neon', tagline: 'Electric, high-saturation glow.', colors: ['#009bd7', '#2f8d10', '#c15bbb', '#bf5000', '#8a71ea', '#c73c54'] },
    { id: 'pastel', name: 'Pastel dusk', tagline: 'Soft and chalky, easy on the eyes.', colors: ['#5c98d5', '#a85550', '#45a983', '#93690d', '#15a8ae', '#855ea1'] },
    { id: 'ember', name: 'Ember', tagline: 'Warm-led: amber, coral and rose with a cool counterweight.', colors: ['#d1701c', '#1577c8', '#da6267', '#a34f9e', '#b78400', '#008e88'] },
    { id: 'ocean', name: 'Ocean', tagline: 'Cool-led: blues, teals and violets with a sand accent.', colors: ['#259ed6', '#8d5500', '#00aba4', '#6f4fa1', '#35aa76', '#3e5fad'] },
    { id: 'forest', name: 'Forest', tagline: 'Earthy and muted: moss, clay, slate.', colors: ['#5f9752', '#944821', '#388ec4', '#755e00', '#ad6ba7', '#97423e'] },
    { id: 'candy', name: 'Candy', tagline: 'Bright and playful sweet-shop colors.', colors: ['#d25f9b', '#6666d1', '#00a8b4', '#bf4f04', '#0097e4', '#8d7500'] },
    { id: 'sunset', name: 'Sunset', tagline: 'Dusky hues from tangerine to indigo.', colors: ['#cc572a', '#5c77df', '#b66e00', '#009aa6', '#cc4f6a', '#9065d0'] },
    { id: 'terminal', name: 'Terminal', tagline: 'Phosphor-green lead with console accents.', colors: ['#49a550', '#835cbe', '#00a9a2', '#aa6000', '#009ed1', '#bc4945'] },
    { id: 'royal', name: 'Royal', tagline: 'Jewel tones: sapphire, ruby, emerald, gold.', colors: ['#5f87e7', '#a4323b', '#00a76c', '#875600', '#00a1c4', '#843e94'] }
  ];

  // fill: solid | soft | gradient | outline | glass | striped | segmented
  // grid: solid | dashed | dots | baseline | none      curve: straight | smooth | step
  // marker: none | end | dot | ring | square           labels: none | peak | all
  const DESIGNS = [
    { id: 'clean', name: 'Clean', tagline: 'Crisp marks, dashed grid, mono numbers.', fill: 'solid', radius: 4, barWidth: 0.6, grid: 'dashed', font: 'mono', curve: 'straight', line: 2, marker: 'end', labels: 'peak', hole: 0.62, gap: 2 },
    { id: 'soft', name: 'Soft', tagline: 'Pill-shaped bars and smooth, thick curves.', fill: 'soft', radius: 99, barWidth: 0.5, grid: 'none', font: 'sans', curve: 'smooth', line: 3, marker: 'none', labels: 'peak', hole: 0.7, gap: 4 },
    { id: 'neon', name: 'Neon glow', tagline: 'Glowing marks over a dotted grid.', fill: 'solid', glow: true, radius: 3, barWidth: 0.45, grid: 'dots', font: 'mono', curve: 'smooth', line: 2.5, marker: 'dot', labels: 'peak', hole: 0.74, gap: 3 },
    { id: 'glass', name: 'Glass', tagline: 'Frosted translucent fills with bright edges.', fill: 'glass', radius: 8, barWidth: 0.6, grid: 'solid', font: 'sans', curve: 'smooth', line: 2, marker: 'ring', labels: 'peak', hole: 0.6, gap: 3 },
    { id: 'gradient', name: 'Gradient', tagline: 'Fills that fade toward the baseline.', fill: 'gradient', radius: 6, barWidth: 0.6, grid: 'dashed', font: 'sans', curve: 'smooth', line: 2.5, marker: 'end', labels: 'peak', hole: 0.58, gap: 2 },
    { id: 'blueprint', name: 'Blueprint', tagline: 'Technical outlines on a drafting grid.', fill: 'outline', radius: 0, barWidth: 0.55, grid: 'solid', gridStrong: true, font: 'mono', curve: 'straight', line: 1.5, marker: 'square', labels: 'all', hole: 0.6, gap: 2, panel: 'blueprint' },
    { id: 'pixel', name: 'Pixel', tagline: 'Retro block segments and stepped lines.', fill: 'segmented', radius: 1, barWidth: 0.6, grid: 'dots', font: 'mono', curve: 'step', line: 2, marker: 'square', labels: 'peak', hole: 0.55, gap: 3 },
    { id: 'editorial', name: 'Editorial', tagline: 'Thin, elegant marks with serif labels.', fill: 'solid', radius: 0, barWidth: 0.28, grid: 'baseline', font: 'serif', curve: 'straight', line: 1.5, marker: 'none', labels: 'all', hole: 0.82, gap: 1 },
    { id: 'striped', name: 'Striped', tagline: 'Hatched fills — readable in print and for color blindness.', fill: 'striped', radius: 4, barWidth: 0.6, grid: 'dashed', font: 'sans', curve: 'straight', line: 2, marker: 'ring', labels: 'peak', hole: 0.6, gap: 2 },
    { id: 'chunky', name: 'Chunky', tagline: 'Bold, wide marks with a hard drop shadow.', fill: 'solid', shadow: true, radius: 2, barWidth: 0.78, grid: 'solid', font: 'sans', bold: true, curve: 'straight', line: 4, marker: 'dot', labels: 'peak', hole: 0.5, gap: 3 }
  ];

  const TYPES = [
    { id: 'bar', name: 'Bar', icon: '▮▮', kinds: ['categorical', 'series'] },
    { id: 'hbar', name: 'Horizontal bar', icon: '☰', kinds: ['categorical'] },
    { id: 'pie', name: 'Pie', icon: '◔', kinds: ['categorical'] },
    { id: 'donut', name: 'Donut', icon: '◎', kinds: ['categorical'] },
    { id: 'line', name: 'Trend line', icon: '⟋', kinds: ['series'] },
    { id: 'area', name: 'Area', icon: '◭', kinds: ['series'] },
    { id: 'lollipop', name: 'Lollipop', icon: '⫯', kinds: ['categorical', 'series'] },
    { id: 'radial', name: 'Radial', icon: '◉', kinds: ['categorical'] },
    { id: 'treemap', name: 'Treemap', icon: '▦', kinds: ['categorical'] },
    { id: 'heatmap', name: 'Calendar heatmap', icon: '▩', kinds: ['calendar'] }
  ];

  const A = (id, name) => ({ id, name });
  const GROW = [A('grow', 'Grow'), A('stagger', 'Stagger'), A('bounce', 'Bounce'), A('fade', 'Fade up'), A('none', 'None')];
  const CIRCLE = [A('sweep', 'Sweep'), A('pop', 'Pop'), A('spin', 'Spin in'), A('fade', 'Fade'), A('none', 'None')];
  const TREND = [A('draw', 'Draw'), A('rise', 'Rise'), A('wipe', 'Wipe'), A('fade', 'Fade'), A('none', 'None')];
  const ANIMATIONS = {
    bar: GROW, hbar: GROW, lollipop: GROW,
    pie: CIRCLE, donut: CIRCLE,
    line: TREND, area: TREND,
    radial: [A('sweep', 'Sweep'), A('stagger', 'Stagger'), A('bounce', 'Bounce'), A('fade', 'Fade'), A('none', 'None')],
    treemap: [A('zoom', 'Zoom'), A('cascade', 'Cascade'), A('fade', 'Fade'), A('none', 'None')],
    heatmap: [A('ripple', 'Ripple'), A('rain', 'Rain'), A('fade', 'Fade'), A('none', 'None')]
  };

  const DEFAULT_STYLE = { design: 'clean', palette: 'aurora', animations: Object.fromEntries(TYPES.map(t => [t.id, ANIMATIONS[t.id][0].id])) };

  const byId = (list, id, fallback) => list.find(x => x.id === id) || fallback || list[0];

  // Keeps only known ids, so a style saved by an older/newer Design Lab can't break charts.
  function normalizeStyle(style) {
    const s = style && typeof style === 'object' ? style : {};
    const animations = {};
    TYPES.forEach(t => {
      const want = s.animations && s.animations[t.id];
      animations[t.id] = ANIMATIONS[t.id].some(a => a.id === want) ? want : DEFAULT_STYLE.animations[t.id];
    });
    return {
      design: byId(DESIGNS, s.design, byId(DESIGNS, DEFAULT_STYLE.design)).id,
      palette: byId(PALETTES, s.palette, byId(PALETTES, DEFAULT_STYLE.palette)).id,
      animations
    };
  }

  function supports(typeId, data) {
    const t = TYPES.find(x => x.id === typeId);
    if (!t || !data || !t.kinds.includes(data.kind)) return false;
    if (data.kind === 'series' && typeId === 'lollipop') return data.series.length === 1;
    return true;
  }

  // ---------- small utils ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round = n => Math.round(n * 100) / 100;
  function rgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  const defaultFormat = v => '$' + Math.round(v).toLocaleString('en-US');
  const defaultCompact = v => { const a = Math.abs(v); return (v < 0 ? '-' : '') + '$' + (a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : Math.round(a)); };
  const FONTS = {
    mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    sans: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
    serif: '"Iowan Old Style", "Palatino Linotype", Georgia, serif'
  };
  let uidN = 0;
  const uid = p => 'ck' + (++uidN) + p;

  function scaleFor(v, ticks) {
    const top = v > 0 ? v : 100;
    const raw = top / ticks;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    const steps = Math.max(1, Math.ceil(top / step - 1e-9));
    return { max: step * steps, ticks: steps };
  }

  // Pie-like charts fold past 6 slices into "Other" (never a 7th generated hue).
  function foldItems(items, max) {
    const sorted = items.filter(i => i.value > 0).sort((a, b) => b.value - a.value);
    if (sorted.length <= max) return sorted;
    const keep = sorted.slice(0, max - 1);
    const rest = sorted.slice(max - 1);
    keep.push({ label: 'Other (' + rest.length + ')', value: rest.reduce((s, i) => s + i.value, 0), target: rest.some(i => i.target) ? rest.reduce((s, i) => s + (i.target || 0), 0) : undefined, other: true });
    return keep;
  }

  // ---------- styles (injected once) ----------
  function ensureStyles() {
    if (document.getElementById('ck-styles')) return;
    const st = document.createElement('style');
    st.id = 'ck-styles';
    st.textContent = [
      '.ck-root{position:relative;width:100%;--ck-text:rgba(250,250,250,.92);--ck-muted:rgba(250,250,250,.5);--ck-grid:rgba(255,255,255,.08)}',
      '.ck-root svg{display:block;overflow:visible}',
      '.ck-root .ck-anim{transform-box:fill-box}',
      '.ck-root .ck-hit{cursor:crosshair;outline:none}',
      '.ck-root .ck-mark{transition:filter .15s ease,opacity .15s ease;outline:none}',
      '.ck-root .ck-mark:hover,.ck-root .ck-mark:focus-visible,.ck-root .ck-mark.ck-on{filter:brightness(1.22)}',
      '.ck-root.ck-dim .ck-mark:not(.ck-on){opacity:.45}',
      '.ck-panel-blueprint{background-color:rgba(40,90,170,.08);background-image:linear-gradient(rgba(120,170,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(120,170,255,.07) 1px,transparent 1px);background-size:16px 16px;border-radius:10px;padding:8px}',
      '.ck-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;font-size:11.5px;color:var(--ck-text)}',
      '.ck-legend span{display:inline-flex;align-items:center;gap:6px;cursor:default}',
      '.ck-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;flex:none}',
      '.ck-legend i.ck-line{height:3px;border-radius:2px;width:14px}',
      '.ck-legend i.ck-dash{height:0;border-top:2px dashed var(--ck-muted);border-radius:0;width:14px}',
      '.ck-legend b{font-weight:600;font-variant-numeric:tabular-nums}',
      '.ck-legend .ck-muted{color:var(--ck-muted)}',
      '.ck-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:center}',
      '.ck-split .ck-legend{flex-direction:column;flex-wrap:nowrap;margin:0}',
      '@media (max-width:520px){.ck-split{grid-template-columns:1fr}}',
      '.ck-tip{position:fixed;z-index:400;pointer-events:none;padding:7px 10px;border-radius:8px;background:#17181c;border:1px solid rgba(255,255,255,.14);color:#fafafa;font:11.5px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45);max-width:240px}',
      '.ck-tip b{font-weight:700}',
      '.ck-empty{font-size:12px;color:var(--ck-muted);padding:18px 4px;line-height:1.5}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ---------- tooltip ----------
  let tipEl = null;
  function showTip(evt, html) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'ck-tip'; tipEl.setAttribute('role', 'status'); document.body.appendChild(tipEl); }
    tipEl.innerHTML = html;
    tipEl.hidden = false;
    let x, y;
    if (evt.clientX != null && evt.type !== 'focus') { x = evt.clientX; y = evt.clientY; }
    else { const b = evt.target.getBoundingClientRect(); x = b.left + b.width / 2; y = b.top; }
    const left = Math.max(8, Math.min(x + 12, window.innerWidth - tipEl.offsetWidth - 8));
    const top = y - tipEl.offsetHeight - 12;
    tipEl.style.left = left + 'px';
    tipEl.style.top = (top < 8 ? y + 18 : top) + 'px';
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }
  function hover(el, html, rootEl) {
    el.setAttribute('tabindex', '0');
    const on = e => { showTip(e, html()); if (rootEl) { rootEl.classList.add('ck-dim'); el.classList.add('ck-on'); } };
    const off = () => { hideTip(); if (rootEl) { rootEl.classList.remove('ck-dim'); el.classList.remove('ck-on'); } };
    el.addEventListener('pointermove', on);
    el.addEventListener('focus', on);
    el.addEventListener('pointerleave', off);
    el.addEventListener('blur', off);
  }

  // ---------- painting marks per design ----------
  function makeDefs() { return { list: [], add(s) { this.list.push(s); } }; }
  // Returns SVG attributes for a filled mark in `color`, adding gradient/pattern defs as needed.
  function paintAttrs(design, color, defs, horizontal) {
    switch (design.fill) {
      case 'soft': return 'fill="' + color + '" fill-opacity="0.88"';
      case 'gradient': {
        const id = uid('g');
        defs.add('<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (horizontal ? 1 : 0) + '" y2="' + (horizontal ? 0 : 1) + '">'
          + '<stop offset="0" stop-color="' + color + '" stop-opacity="' + (horizontal ? 0.35 : 1) + '"/><stop offset="1" stop-color="' + color + '" stop-opacity="' + (horizontal ? 1 : 0.3) + '"/></linearGradient>');
        return 'fill="url(#' + id + ')"';
      }
      case 'outline': return 'fill="' + rgba(color, 0.14) + '" stroke="' + color + '" stroke-width="1.5"';
      case 'glass': return 'fill="' + rgba(color, 0.34) + '" stroke="' + rgba(color, 0.95) + '" stroke-width="1.2"';
      case 'striped': {
        const id = uid('p');
        defs.add('<pattern id="' + id + '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="' + rgba(color, 0.3) + '"/><rect width="3" height="6" fill="' + color + '"/></pattern>');
        return 'fill="url(#' + id + ')" stroke="' + color + '" stroke-width="1"';
      }
      default: return 'fill="' + color + '"';
    }
  }
  function markFilter(design, color) {
    if (design.glow) return ' style="filter:drop-shadow(0 0 6px ' + rgba(color, 0.75) + ')"';
    if (design.shadow) return ' style="filter:drop-shadow(3px 3px 0 rgba(0,0,0,.6))"';
    return '';
  }
  // Rounded-top bar (or rounded-right for horizontal). r is clamped to the bar size.
  function barPath(x, y, w, h, r, horizontal) {
    if (w <= 0 || h <= 0) return '';
    if (!horizontal) {
      r = Math.min(r, w / 2, h);
      return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
    }
    r = Math.min(r, h / 2, w);
    return 'M' + x + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h - r) + 'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w - r) + ',' + (y + h) + 'H' + x + 'Z';
  }
  // A bar in the current design: segmented designs draw stacked blocks.
  function barShape(design, x, y, w, h, color, defs, horizontal) {
    if (design.fill === 'segmented') {
      const block = 6, gap = 2;
      let out = '';
      if (!horizontal) for (let yy = y + h; yy > y + 0.5; yy -= block + gap) { const bh = Math.min(block, yy - y); out += '<rect x="' + x + '" y="' + (yy - bh) + '" width="' + w + '" height="' + bh + '" rx="1" fill="' + color + '"/>'; }
      else for (let xx = x; xx < x + w - 0.5; xx += block + gap) { const bw = Math.min(block, x + w - xx); out += '<rect x="' + xx + '" y="' + y + '" width="' + bw + '" height="' + h + '" rx="1" fill="' + color + '"/>'; }
      return out;
    }
    return '<path d="' + barPath(x, y, w, h, design.radius, horizontal) + '" ' + paintAttrs(design, color, defs, horizontal) + '/>';
  }

  // ---------- frame / axes ----------
  function frameFor(el, height, left) {
    const width = Math.max(240, Math.round(el.clientWidth || 320));
    const m = { top: 16, right: 14, bottom: 26, left: left == null ? 46 : left };
    return { width, height, m, iw: width - m.left - m.right, ih: height - m.top - m.bottom, base: height - m.bottom };
  }
  function gridLines(f, sc, design, compact) {
    let out = '';
    const dash = design.grid === 'dashed' ? ' stroke-dasharray="4 4"' : design.grid === 'dots' ? ' stroke-dasharray="1 5" stroke-linecap="round" stroke-width="1.5"' : '';
    const col = design.gridStrong ? 'rgba(120,170,255,.22)' : 'var(--ck-grid)';
    for (let i = 0; i <= sc.ticks; i++) {
      const v = sc.max * i / sc.ticks, y = f.m.top + f.ih - f.ih * i / sc.ticks;
      const showLine = design.grid !== 'none' && (design.grid !== 'baseline' || i === 0);
      if (showLine) out += '<line x1="' + f.m.left + '" x2="' + (f.width - f.m.right) + '" y1="' + y + '" y2="' + y + '" stroke="' + (i === 0 ? 'rgba(255,255,255,.18)' : col) + '"' + (i === 0 ? '' : dash) + '/>';
      out += '<text x="' + (f.m.left - 8) + '" y="' + (y + 3.5) + '" text-anchor="end" class="ck-axis">' + esc(compact(v)) + '</text>';
    }
    return out;
  }
  // Text styles are scoped to this one svg (a <style> in inline SVG is page-global).
  function textStyles(id, design) {
    return '<style>#' + id + ' .ck-axis{font-size:10px;fill:var(--ck-muted)}#' + id + ' .ck-lbl{font-size:' + (design.bold ? 12 : 11) + 'px;font-weight:' + (design.bold ? 800 : 700) + ';fill:var(--ck-text)}#' + id + ' .ck-in{font-size:11px;font-weight:700;fill:#fff}</style>';
  }
  function svgOpen(f, design, title) {
    const id = uid('s');
    return '<svg id="' + id + '" viewBox="0 0 ' + f.width + ' ' + f.height + '" width="100%" height="' + f.height + '" role="img" aria-label="' + esc(title || 'Chart') + '" style="font-family:' + esc(FONTS[design.font] || FONTS.sans) + '">' + textStyles(id, design);
  }
  const xTickEvery = (n, w) => Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 58))));
  // Every nth label plus the last one, skipping a regular label that would crowd the last.
  const showTick = (i, n, every) => i === n - 1 || (i % every === 0 && n - 1 - i >= Math.max(1, every * 0.7));

  // ============================================================
  // RENDERERS — each returns { html, after(rootEl) } and tags animatable
  // marks with class "ck-anim" and data-a (role) / data-i (order).
  // ============================================================

  // ----- vertical bars (categorical or series; grouped or stacked) -----
  function renderBar(el, d, o) {
    const { design, colors, fmt, compact } = o;
    const f = frameFor(el, o.height || 230);
    const defs = makeDefs();
    let groups, series, stacked = false;
    if (d.kind === 'categorical') {
      groups = d.items.map(i => i.label);
      series = [{ name: d.valueName || 'Value', values: d.items.map(i => i.value), targets: d.items.map(i => i.target) }];
    } else { groups = d.x; series = d.series; stacked = !!d.stacked && series.length > 1; }
    const totals = groups.map((_, gi) => stacked ? series.reduce((s, se) => s + (se.values[gi] || 0), 0) : Math.max(...series.map(se => se.values[gi] || 0)));
    const tmax = series[0].targets ? Math.max(0, ...series[0].targets.filter(Boolean)) : 0;
    const refV = d.reference ? d.reference.value : 0;
    const sc = scaleFor(Math.max(...totals, tmax, refV) * 1.08, 4);
    const y = v => f.m.top + f.ih - v / sc.max * f.ih;
    const slot = f.iw / groups.length;
    const bw = Math.max(3, Math.min(56, slot * design.barWidth));
    let body = '';
    const peakI = totals.indexOf(Math.max(...totals));
    groups.forEach((g, gi) => {
      const cx = f.m.left + slot * gi + slot / 2;
      let marks = '';
      if (stacked) {
        let acc = 0;
        series.forEach((se, si) => {
          const v = se.values[gi] || 0;
          if (v <= 0) return;
          const top = y(acc + v), bottom = y(acc);
          const gapPx = acc > 0 ? 2 : 0;
          const isTop = series.slice(si + 1).every(s2 => !(s2.values[gi] > 0));
          const h = bottom - top - gapPx;
          marks += isTop ? barShape(design, cx - bw / 2, top, bw, h, colors[si % colors.length], defs)
            : (design.fill === 'segmented' ? barShape(design, cx - bw / 2, top, bw, h, colors[si % colors.length], defs) : '<rect x="' + (cx - bw / 2) + '" y="' + top + '" width="' + bw + '" height="' + Math.max(0, h) + '" ' + paintAttrs(design, colors[si % colors.length], defs) + '/>');
          acc += v;
        });
      } else if (series.length > 1) {
        const inner = bw / series.length;
        series.forEach((se, si) => {
          const v = se.values[gi] || 0;
          if (v > 0) marks += barShape(design, cx - bw / 2 + si * inner + 1, y(v), inner - 2, f.base - y(v), colors[si % colors.length], defs);
        });
      } else {
        const v = series[0].values[gi] || 0, t = series[0].targets ? series[0].targets[gi] : 0;
        if (t > 0 && v > t) {
          marks += barShape(design, cx - bw / 2, y(t), bw, f.base - y(t), colors[0], defs);
          marks += '<rect x="' + (cx - bw / 2) + '" y="' + y(v) + '" width="' + bw + '" height="' + Math.max(0, y(t) - y(v) - 2) + '" rx="' + Math.min(design.radius, 3) + '" fill="' + OVER + '"/>';
        } else if (v > 0) marks += barShape(design, cx - bw / 2, y(v), bw, f.base - y(v), colors[0], defs);
      }
      body += '<g class="ck-anim ck-mark" data-a="vbar" data-i="' + gi + '"' + markFilter(design, colors[0]) + '>' + marks + '</g>';
      const t = !stacked && series.length === 1 && series[0].targets ? series[0].targets[gi] : 0;
      if (t > 0) body += '<line x1="' + (cx - bw / 2 - 4) + '" x2="' + (cx + bw / 2 + 4) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="var(--ck-text)" stroke-width="2" stroke-linecap="round"/>';
      const every = xTickEvery(groups.length, f.iw);
      if (showTick(gi, groups.length, every)) body += '<text x="' + cx + '" y="' + (f.height - 8) + '" text-anchor="middle" class="ck-axis">' + esc(shorten(g, Math.max(4, Math.floor(slot * every / 6.5)))) + '</text>';
      const showLabel = design.labels === 'all' ? groups.length <= 12 : design.labels === 'peak' ? (gi === peakI || gi === groups.length - 1) : false;
      if (showLabel && totals[gi] > 0) body += '<text x="' + cx + '" y="' + (y(Math.max(totals[gi], t || 0)) - 7) + '" text-anchor="middle" class="ck-lbl">' + esc(compact(totals[gi])) + '</text>';
      body += '<rect class="ck-hit" data-g="' + gi + '" x="' + (cx - slot / 2) + '" y="' + f.m.top + '" width="' + slot + '" height="' + f.ih + '" fill="transparent"/>';
    });
    let ref = '';
    if (d.reference && d.reference.value > 0) ref = '<line x1="' + f.m.left + '" x2="' + (f.width - f.m.right) + '" y1="' + y(d.reference.value) + '" y2="' + y(d.reference.value) + '" stroke="var(--ck-muted)" stroke-width="1.5" stroke-dasharray="5 4"/>';
    const html = svgOpen(f, design, o.title) + '<defs>' + defs.list.join('') + '</defs>' + gridLines(f, sc, design, compact) + '<g class="ck-plot">' + body + '</g>' + ref + '</svg>'
      + legendFor(d, series, colors, o);
    return {
      html, after(rootEl) {
        rootEl.querySelectorAll('.ck-hit').forEach(hit => {
          const gi = Number(hit.dataset.g);
          const mark = rootEl.querySelector('.ck-mark[data-i="' + gi + '"]');
          hover(hit, () => {
            let s = '<b>' + esc(groups[gi]) + '</b>';
            series.forEach((se, si) => { s += '<br>' + (series.length > 1 ? esc(se.name) + ': ' : '') + '<b>' + esc(fmt(se.values[gi] || 0)) + '</b>'; });
            if (stacked) s += '<br>Total ' + esc(fmt(totals[gi]));
            const t = series[0].targets && series[0].targets[gi];
            if (t > 0) s += '<br>' + ((series[0].values[gi] || 0) > t ? 'Over by ' + esc(fmt(series[0].values[gi] - t)) : esc(fmt(t - (series[0].values[gi] || 0))) + ' left of ' + esc(fmt(t)));
            if (d.reference) s += '<br>' + esc(d.reference.label) + ' ' + esc(fmt(d.reference.value));
            if (d.items && d.items[gi] && d.items[gi].note) s += '<br>' + esc(d.items[gi].note);
            return s;
          });
          hit.addEventListener('pointerenter', () => mark && mark.classList.add('ck-on'));
          hit.addEventListener('pointerleave', () => mark && mark.classList.remove('ck-on'));
        });
      }
    };
  }
  const shorten = (s, n) => { s = String(s); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s; };

  // ----- horizontal bars (categorical) -----
  function renderHbar(el, d, o) {
    const { design, colors, fmt } = o;
    const items = d.items.filter(i => i.value > 0 || i.target > 0);
    const rowH = design.bold ? 40 : 36, barH = design.bold ? 12 : design.fill === 'segmented' ? 10 : 9;
    const f = { width: Math.max(240, Math.round(el.clientWidth || 320)), height: items.length * rowH + 6 };
    const defs = makeDefs();
    const scale = Math.max(1, ...items.map(i => Math.max(i.value, i.target || 0)));
    const w = f.width - 4;
    let body = '';
    items.forEach((it, i) => {
      const y0 = i * rowH + 4, by = y0 + 17;
      const under = it.target > 0 ? Math.min(it.value, it.target) : it.value;
      const over = it.target > 0 ? Math.max(0, it.value - it.target) : 0;
      body += '<text x="0" y="' + (y0 + 10) + '" class="ck-lbl" style="font-weight:600">' + esc(shorten(it.label, 26)) + '</text>'
        + '<text x="' + w + '" y="' + (y0 + 10) + '" text-anchor="end" class="ck-lbl">' + esc(fmt(it.value)) + (it.target > 0 ? '<tspan class="ck-axis" dx="4">/ ' + esc(fmt(it.target)) + '</tspan>' : '') + (over > 0 ? '<tspan dx="6" fill="' + OVER + '">▲ over</tspan>' : '') + '</text>'
        + '<rect x="0" y="' + by + '" width="' + w + '" height="' + barH + '" rx="' + Math.min(design.radius, barH / 2) + '" fill="rgba(255,255,255,.06)"/>'
        + '<g class="ck-anim ck-mark" data-a="hbar" data-i="' + i + '"' + markFilter(design, colors[0]) + '>'
        + (under > 0 ? barShape(design, 0, by, Math.max(2, under / scale * w), barH, colors[0], defs, true) : '')
        + (over > 0 ? '<rect x="' + (under / scale * w + 2) + '" y="' + by + '" width="' + Math.max(0, over / scale * w - 2) + '" height="' + barH + '" rx="' + Math.min(design.radius, barH / 2) + '" fill="' + OVER + '"/>' : '')
        + '</g>'
        + (it.target > 0 ? '<rect x="' + (it.target / scale * w - 1) + '" y="' + (by - 4) + '" width="2" height="' + (barH + 8) + '" rx="1" fill="var(--ck-text)"/>' : '')
        + '<rect class="ck-hit" data-i="' + i + '" x="0" y="' + y0 + '" width="' + w + '" height="' + (rowH - 2) + '" fill="transparent"/>';
    });
    const html = svgOpen(f, design, o.title) + '<defs>' + defs.list.join('') + '</defs><g class="ck-plot">' + body + '</g></svg>';
    return {
      html, after(rootEl) {
        rootEl.querySelectorAll('.ck-hit').forEach(hit => {
          const it = items[Number(hit.dataset.i)];
          const mark = rootEl.querySelector('.ck-mark[data-i="' + hit.dataset.i + '"]');
          hover(hit, () => '<b>' + esc(it.label) + '</b><br>' + esc(fmt(it.value)) + (it.target > 0 ? '<br>' + (it.value > it.target ? 'Over by ' + esc(fmt(it.value - it.target)) : esc(fmt(it.target - it.value)) + ' left of ' + esc(fmt(it.target))) : '') + (it.note ? '<br>' + esc(it.note) : ''));
          hit.addEventListener('pointerenter', () => mark && mark.classList.add('ck-on'));
          hit.addEventListener('pointerleave', () => mark && mark.classList.remove('ck-on'));
        });
      }
    };
  }

  // ----- pie & donut (stroked circles, so a sweep is a dash animation) -----
  function renderPie(el, d, o, donut) {
    const { design, colors, fmt } = o;
    const items = foldItems(d.items, 6);
    const total = items.reduce((s, i) => s + i.value, 0);
    const width = Math.max(240, Math.round(el.clientWidth || 320));
    const split = width >= 420;
    const size = Math.min(split ? width / 2 - 8 : width, 230);
    const R = size / 2 - 6, cx = size / 2, cy = size / 2;
    const hole = donut ? design.hole : 0;
    const r = R * (1 + hole) / 2, sw = R * (1 - hole), C = 2 * Math.PI * r;
    const gapLen = total > 0 && items.length > 1 ? design.gap : 0;
    let acc = 0, slices = '';
    const defs = makeDefs();
    items.forEach((it, i) => {
      const len = it.value / total * C;
      const color = colors[i % colors.length];
      const vis = Math.max(0.5, len - gapLen);
      let stroke = color, extra = '';
      if (design.fill === 'striped') { const id = uid('p'); defs.add('<pattern id="' + id + '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="' + rgba(color, 0.35) + '"/><rect width="3" height="6" fill="' + color + '"/></pattern>'); stroke = 'url(#' + id + ')'; }
      if (design.fill === 'glass' || design.fill === 'outline') { stroke = rgba(color, design.fill === 'outline' ? 0.28 : 0.45); extra = ' data-edge="' + color + '"'; }
      if (design.fill === 'soft') extra += ' stroke-opacity="0.88"';
      slices += '<circle class="ck-anim ck-mark" data-a="slice" data-i="' + i + '" data-len="' + vis + '" data-start="' + acc + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-dasharray="' + vis + ' ' + (C - vis) + '" stroke-dashoffset="' + (-(acc + gapLen / 2)) + '"' + extra + markFilter(design, color) + '/>';
      if (design.fill === 'glass' || design.fill === 'outline') {
        [R, R * hole].forEach(rr => { if (rr > 1) slices += '<circle class="ck-anim" data-a="edge" data-i="' + i + '" cx="' + cx + '" cy="' + cy + '" r="' + rr + '" fill="none" stroke="' + color + '" stroke-width="1.2" stroke-dasharray="' + (vis * rr / r) + ' ' + (2 * Math.PI * rr) + '" stroke-dashoffset="' + (-(acc + gapLen / 2) * rr / r) + '" pointer-events="none"/>'; });
      }
      acc += len;
    });
    let center = '';
    if (donut && hole > 0.45) {
      center = '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" class="ck-lbl" style="font-size:' + Math.max(13, Math.round(R * hole * 0.36)) + 'px">' + esc(fmt(total)) + '</text>'
        + '<text x="' + cx + '" y="' + (cy + 15) + '" text-anchor="middle" class="ck-axis">' + esc(d.totalLabel || 'Total') + '</text>';
    }
    const sid = uid('s');
    const svg = '<svg id="' + sid + '" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" role="img" aria-label="' + esc(o.title || 'Chart') + '" style="margin:0 auto;font-family:' + esc(FONTS[design.font] || FONTS.sans) + '">'
      + textStyles(sid, design) + '<defs>' + defs.list.join('') + '</defs>'
      + '<g class="ck-spin" style="transform-origin:' + cx + 'px ' + cy + 'px"><g transform="rotate(-90 ' + cx + ' ' + cy + ')">' + slices + '</g></g>' + center + '</svg>';
    const legend = '<div class="ck-legend">' + items.map((it, i) => '<span data-i="' + i + '"><i style="background:' + colors[i % colors.length] + '"></i>' + esc(it.label) + ' <b>' + esc(fmt(it.value)) + '</b><span class="ck-muted">' + Math.round(it.value / total * 100) + '%</span></span>').join('') + '</div>';
    const html = total > 0 ? (split ? '<div class="ck-split"><div>' + svg + '</div>' + legend + '</div>' : svg + legend) : '<div class="ck-empty">Nothing to show yet.</div>';
    return {
      html, after(rootEl) {
        const tip = i => '<b>' + esc(items[i].label) + '</b><br>' + esc(fmt(items[i].value)) + ' · ' + Math.round(items[i].value / total * 100) + '%' + (items[i].target > 0 ? '<br>Budget ' + esc(fmt(items[i].target)) : '');
        rootEl.querySelectorAll('circle.ck-mark').forEach(c => hover(c, () => tip(Number(c.dataset.i)), rootEl));
        rootEl.querySelectorAll('.ck-legend span[data-i]').forEach(s => {
          const c = rootEl.querySelector('circle.ck-mark[data-i="' + s.dataset.i + '"]');
          s.addEventListener('pointerenter', () => { rootEl.classList.add('ck-dim'); c && c.classList.add('ck-on'); });
          s.addEventListener('pointerleave', () => { rootEl.classList.remove('ck-dim'); c && c.classList.remove('ck-on'); });
        });
      }
    };
  }

  // ----- trend line & area (series) -----
  function smoothPath(pts) {
    if (pts.length < 3) return pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join('');
    // monotone cubic (Fritsch–Carlson) so curves never overshoot the data
    const n = pts.length, dx = [], dy = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dy[i] / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let dStr = 'M' + pts[0][0] + ',' + pts[0][1];
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      dStr += 'C' + round(pts[i][0] + h) + ',' + round(pts[i][1] + t[i] * h) + ' ' + round(pts[i + 1][0] - h) + ',' + round(pts[i + 1][1] - t[i + 1] * h) + ' ' + pts[i + 1][0] + ',' + pts[i + 1][1];
    }
    return dStr;
  }
  function linePath(pts, curve) {
    if (curve === 'smooth') return smoothPath(pts);
    if (curve === 'step') return pts.map((p, i) => i ? 'H' + p[0] + 'V' + p[1] : 'M' + p[0] + ',' + p[1]).join('');
    return pts.map((p, i) => (i ? 'L' : 'M') + round(p[0]) + ',' + round(p[1])).join('');
  }
  function renderTrend(el, d, o, area) {
    const { design, colors, fmt, compact } = o;
    const f = frameFor(el, o.height || 230);
    const n = d.x.length;
    const series = d.series;
    const stacked = area && d.stacked && series.length > 1;
    const cum = series.map((_, si) => d.x.map((__, xi) => series.slice(0, si + 1).reduce((s, se) => s + (se.values[xi] || 0), 0)));
    const top = stacked ? Math.max(...cum[cum.length - 1]) : Math.max(...series.map(se => Math.max(...se.values.map(v => v || 0))));
    const sc = scaleFor(Math.max(top, d.reference ? d.reference.value || 0 : 0, d.referenceEnd || 0) * 1.08, 4);
    const x = i => f.m.left + (n === 1 ? f.iw / 2 : i / (n - 1) * f.iw);
    const y = v => f.m.top + f.ih - v / sc.max * f.ih;
    const defs = makeDefs();
    let body = '';
    const order = series.map((_, i) => i).reverse(); // first series drawn last = on top
    order.forEach(si => {
      const color = colors[si % colors.length];
      const vals = stacked ? cum[si] : series[si].values;
      const known = vals.map((v, i) => (v == null ? null : [round(x(i)), round(y(v))])).filter(Boolean);
      if (!known.length) return;
      const path = linePath(known, design.curve);
      if (area) {
        const lower = stacked && si > 0 ? cum[si - 1].map((v, i) => [round(x(i)), round(y(v))]).slice(0, known.length).reverse() : null;
        const gid = uid('a');
        const topOp = design.fill === 'outline' ? 0.12 : design.fill === 'gradient' || design.fill === 'soft' || design.fill === 'glass' ? 0.42 : 0.3;
        defs.add('<linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity="' + topOp + '"/><stop offset="1" stop-color="' + color + '" stop-opacity="' + (stacked ? topOp : 0.02) + '"/></linearGradient>');
        let fill = 'url(#' + gid + ')';
        if (design.fill === 'striped') { const pid = uid('p'); defs.add('<pattern id="' + pid + '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="6" fill="' + rgba(color, 0.45) + '"/></pattern>'); fill = 'url(#' + pid + ')'; }
        const closing = lower ? lower.map(p => 'L' + p[0] + ',' + p[1]).join('') + 'Z' : 'L' + known[known.length - 1][0] + ',' + f.base + 'L' + known[0][0] + ',' + f.base + 'Z';
        body += '<path class="ck-anim" data-a="area" data-i="' + si + '" d="' + path + closing + '" fill="' + fill + '"/>';
      }
      body += '<path class="ck-anim" data-a="line" data-i="' + si + '" d="' + path + '" pathLength="1" fill="none" stroke="' + color + '" stroke-width="' + design.line + '" stroke-linejoin="round" stroke-linecap="round"' + markFilter(design, color) + '/>';
      const showAll = (design.marker === 'dot' || design.marker === 'ring' || design.marker === 'square') && known.length <= 16;
      known.forEach((p, i) => {
        const last = i === known.length - 1;
        if (!(showAll || (last && design.marker !== 'none'))) return;
        const rr = design.bold ? 5 : 3.5;
        const mk = design.marker === 'square' ? '<rect x="' + (p[0] - rr) + '" y="' + (p[1] - rr) + '" width="' + rr * 2 + '" height="' + rr * 2 + '" fill="' + color + '"/>'
          : design.marker === 'ring' ? '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + rr + '" fill="#101012" stroke="' + color + '" stroke-width="2"/>'
            : '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (last ? rr + 0.5 : rr) + '" fill="' + color + '" stroke="#0b0b0d" stroke-width="2"/>';
        body += '<g class="ck-anim" data-a="point" data-i="' + i + '">' + mk + '</g>';
      });
      const labelled = series.length === 1 || (stacked ? si === series.length - 1 : si === 0);
      if (labelled && design.labels !== 'none') {
        const lastP = known[known.length - 1];
        const v = vals[known.length - 1];
        {
          const anchor = lastP[0] > f.width - 70 ? 'end' : 'start';
          body += '<text class="ck-anim ck-lbl" data-a="point" x="' + (anchor === 'end' ? lastP[0] - 8 : lastP[0] + 8) + '" y="' + (lastP[1] - 9) + '" text-anchor="' + anchor + '">' + esc(fmt(v)) + '</text>';
        }
      }
    });
    let ref = '';
    if (d.reference && d.reference.value > 0 && !d.referenceEnd) ref = '<line x1="' + f.m.left + '" x2="' + (f.width - f.m.right) + '" y1="' + y(d.reference.value) + '" y2="' + y(d.reference.value) + '" stroke="var(--ck-muted)" stroke-width="1.5" stroke-dasharray="5 4"/>';
    if (d.referenceEnd > 0) ref = '<line x1="' + x(0) + '" y1="' + y(d.referenceStart || 0) + '" x2="' + x(n - 1) + '" y2="' + y(d.referenceEnd) + '" stroke="var(--ck-muted)" stroke-width="1.5" stroke-dasharray="5 4"/>';
    let xl = '';
    const every = xTickEvery(n, f.iw);
    d.x.forEach((lab, i) => { if (showTick(i, n, every)) xl += '<text x="' + x(i) + '" y="' + (f.height - 8) + '" text-anchor="' + (i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle') + '" class="ck-axis">' + esc(lab) + '</text>'; });
    const html = svgOpen(f, design, o.title) + '<defs>' + defs.list.join('') + '</defs>' + gridLines(f, sc, design, compact) + ref + '<g class="ck-plot" style="transform-origin:0px ' + f.base + 'px">' + body + '</g>' + xl
      + '<line class="ck-cross" x1="0" x2="0" y1="' + f.m.top + '" y2="' + f.base + '" stroke="var(--ck-muted)" visibility="hidden"/>'
      + '<rect class="ck-hit" x="' + f.m.left + '" y="' + f.m.top + '" width="' + f.iw + '" height="' + f.ih + '" fill="transparent"/></svg>'
      + legendFor(d, series, colors, o, true);
    return {
      html, after(rootEl) {
        const svgEl = rootEl.querySelector('svg'), hit = rootEl.querySelector('.ck-hit'), cross = rootEl.querySelector('.ck-cross');
        const move = evt => {
          const r = svgEl.getBoundingClientRect();
          const px = (evt.clientX - r.left) * (f.width / r.width);
          const i = Math.max(0, Math.min(n - 1, Math.round((px - f.m.left) / f.iw * (n - 1))));
          cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
          let s = '<b>' + esc(d.xFull ? d.xFull[i] : d.x[i]) + '</b>';
          series.forEach(se => { if (se.values[i] != null) s += '<br>' + esc(se.name) + ': <b>' + esc(fmt(se.values[i])) + '</b>'; });
          if (d.referenceEnd > 0) s += '<br>' + esc(d.reference ? d.reference.label : 'Target') + ': ' + esc(fmt((d.referenceStart || 0) + (d.referenceEnd - (d.referenceStart || 0)) * (n === 1 ? 1 : i / (n - 1))));
          else if (d.reference) s += '<br>' + esc(d.reference.label) + ': ' + esc(fmt(d.reference.value));
          showTip(evt, s);
        };
        hit.addEventListener('pointermove', move);
        hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(); });
      }
    };
  }

  // ----- lollipop (categorical or single series) -----
  function renderLollipop(el, d, o) {
    const { design, colors, fmt, compact } = o;
    const f = frameFor(el, o.height || 230);
    const labels = d.kind === 'categorical' ? d.items.map(i => i.label) : d.x;
    const vals = d.kind === 'categorical' ? d.items.map(i => i.value) : d.series[0].values.map(v => v || 0);
    const targets = d.kind === 'categorical' ? d.items.map(i => i.target || 0) : [];
    const sc = scaleFor(Math.max(...vals, ...targets, d.reference ? d.reference.value : 0) * 1.1, 4);
    const y = v => f.m.top + f.ih - v / sc.max * f.ih;
    const slot = f.iw / labels.length;
    const head = design.bold ? 7 : design.fill === 'soft' ? 6.5 : 5;
    let body = '';
    const peak = vals.indexOf(Math.max(...vals));
    labels.forEach((lab, i) => {
      const cx = f.m.left + slot * i + slot / 2, v = vals[i], t = targets[i];
      const color = t > 0 && v > t ? OVER : colors[0];
      const headShape = design.marker === 'square' || design.fill === 'segmented' ? '<rect x="' + (cx - head) + '" y="' + (y(v) - head) + '" width="' + head * 2 + '" height="' + head * 2 + '" fill="' + color + '"/>'
        : design.fill === 'outline' || design.fill === 'glass' ? '<circle cx="' + cx + '" cy="' + y(v) + '" r="' + head + '" fill="' + rgba(color, 0.25) + '" stroke="' + color + '" stroke-width="2"/>'
          : '<circle cx="' + cx + '" cy="' + y(v) + '" r="' + head + '" fill="' + color + '"/>';
      if (v > 0) body += '<g class="ck-anim ck-mark" data-a="vbar" data-i="' + i + '"' + markFilter(design, color) + '><line x1="' + cx + '" x2="' + cx + '" y1="' + f.base + '" y2="' + y(v) + '" stroke="' + color + '" stroke-width="' + Math.max(1.5, design.line) + '"' + (design.fill === 'striped' ? ' stroke-dasharray="3 3"' : '') + '/>' + headShape + '</g>';
      if (t > 0) body += '<line x1="' + (cx - 8) + '" x2="' + (cx + 8) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="var(--ck-text)" stroke-width="2" stroke-linecap="round"/>';
      const every = xTickEvery(labels.length, f.iw);
      if (showTick(i, labels.length, every)) body += '<text x="' + cx + '" y="' + (f.height - 8) + '" text-anchor="middle" class="ck-axis">' + esc(shorten(lab, Math.max(4, Math.floor(slot * every / 6.5)))) + '</text>';
      if ((design.labels === 'all' && labels.length <= 12) || (design.labels === 'peak' && (i === peak || i === labels.length - 1))) if (v > 0) body += '<text x="' + cx + '" y="' + (y(v) - head - 6) + '" text-anchor="middle" class="ck-lbl">' + esc(compact(v)) + '</text>';
      body += '<rect class="ck-hit" data-i="' + i + '" x="' + (cx - slot / 2) + '" y="' + f.m.top + '" width="' + slot + '" height="' + f.ih + '" fill="transparent"/>';
    });
    let ref = '';
    if (d.reference && d.reference.value > 0) ref = '<line x1="' + f.m.left + '" x2="' + (f.width - f.m.right) + '" y1="' + y(d.reference.value) + '" y2="' + y(d.reference.value) + '" stroke="var(--ck-muted)" stroke-width="1.5" stroke-dasharray="5 4"/>';
    const html = svgOpen(f, design, o.title) + gridLines(f, sc, design, compact) + ref + '<g class="ck-plot">' + body + '</g></svg>'
      + (d.reference ? '<div class="ck-legend"><span><i class="ck-dash"></i>' + esc(d.reference.label) + '</span></div>' : '');
    return {
      html, after(rootEl) {
        rootEl.querySelectorAll('.ck-hit').forEach(hit => {
          const i = Number(hit.dataset.i), mark = rootEl.querySelector('.ck-mark[data-i="' + i + '"]');
          hover(hit, () => '<b>' + esc(d.xFull ? d.xFull[i] : labels[i]) + '</b><br><b>' + esc(fmt(vals[i])) + '</b>' + (targets[i] > 0 ? '<br>' + (vals[i] > targets[i] ? 'Over by ' + esc(fmt(vals[i] - targets[i])) : esc(fmt(targets[i] - vals[i])) + ' left of ' + esc(fmt(targets[i]))) : ''));
          hit.addEventListener('pointerenter', () => mark && mark.classList.add('ck-on'));
          hit.addEventListener('pointerleave', () => mark && mark.classList.remove('ck-on'));
        });
      }
    };
  }

  // ----- radial bars: one ring per item, value / target (or / largest) -----
  function renderRadial(el, d, o) {
    const { design, colors, fmt } = o;
    const items = foldItems(d.items.map(i => ({ ...i, value: Math.max(i.value, 0.0001) })), 6).map(i => ({ ...i, value: i.value < 0.001 ? 0 : i.value }));
    const width = Math.max(240, Math.round(el.clientWidth || 320));
    const split = width >= 420;
    const size = Math.min(split ? width / 2 - 8 : width, 230);
    const cx = size / 2, cy = size / 2;
    const outer = size / 2 - 6;
    const bandGap = design.fill === 'segmented' ? 4 : 3;
    const band = Math.max(6, Math.min(design.bold ? 18 : 14, (outer * 0.62) / items.length - bandGap));
    const maxV = Math.max(...items.map(i => i.value), 1);
    let rings = '';
    items.forEach((it, i) => {
      const r = outer - band / 2 - i * (band + bandGap);
      const C = 2 * Math.PI * r;
      const denom = it.target > 0 ? it.target : maxV;
      const frac = Math.min(1, it.value / denom);
      const over = it.target > 0 && it.value > it.target;
      const color = over ? OVER : colors[i % colors.length];
      rings += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="' + band + '"/>';
      const dash = design.fill === 'segmented' ? ' stroke-dasharray="' + (C * 0.018) + ' ' + (C * 0.007) + '"' : '';
      const len = Math.max(0.001, frac * C);
      rings += '<circle class="ck-anim ck-mark" data-a="ring" data-i="' + i + '" data-len="' + len + '" data-c="' + C + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + (design.fill === 'glass' || design.fill === 'outline' ? rgba(color, 0.55) : color) + '" stroke-width="' + band + '" stroke-linecap="' + (design.radius >= 6 ? 'round' : 'butt') + '"'
        + (dash ? ' data-seg="1"' : '') + ' stroke-dasharray="' + len + ' ' + C + '"' + markFilter(design, color) + '/>';
      if (dash) rings += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#101012" stroke-width="' + (band + 1) + '"' + ' stroke-dasharray="1.2 ' + (C / 40 - 1.2) + '" pointer-events="none"/>';
    });
    const svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" role="img" aria-label="' + esc(o.title || 'Chart') + '" style="margin:0 auto"><g transform="rotate(-90 ' + cx + ' ' + cy + ')">' + rings + '</g></svg>';
    const legend = '<div class="ck-legend">' + items.map((it, i) => {
      const over = it.target > 0 && it.value > it.target;
      return '<span data-i="' + i + '"><i style="background:' + (over ? OVER : colors[i % colors.length]) + '"></i>' + esc(it.label) + ' <b>' + esc(fmt(it.value)) + '</b>' + (it.target > 0 ? '<span class="ck-muted">/ ' + esc(fmt(it.target)) + (over ? ' · over' : '') + '</span>' : '') + '</span>';
    }).join('') + '</div>';
    const html = items.length ? (split ? '<div class="ck-split"><div>' + svg + '</div>' + legend + '</div>' : svg + legend) : '<div class="ck-empty">Nothing to show yet.</div>';
    return {
      html, after(rootEl) {
        rootEl.querySelectorAll('circle.ck-mark').forEach(c => {
          const it = items[Number(c.dataset.i)];
          hover(c, () => '<b>' + esc(it.label) + '</b><br>' + esc(fmt(it.value)) + (it.target > 0 ? '<br>' + (it.value > it.target ? 'Over by ' + esc(fmt(it.value - it.target)) : Math.round(it.value / it.target * 100) + '% of ' + esc(fmt(it.target))) : ''), rootEl);
        });
      }
    };
  }

  // ----- treemap (squarified) -----
  function squarify(items, x, y, w, h) {
    const total = items.reduce((s, i) => s + i.value, 0);
    const out = [];
    let rest = items.map(i => ({ ...i, area: i.value / total * w * h }));
    while (rest.length) {
      const short = Math.min(w, h);
      let row = [rest[0]], best = worst(row, short);
      for (let k = 1; k < rest.length; k++) {
        const next = row.concat(rest[k]), wv = worst(next, short);
        if (wv > best) break;
        row = next; best = wv;
      }
      const rowArea = row.reduce((s, i) => s + i.area, 0);
      if (w >= h) {
        const cw = rowArea / h;
        let yy = y;
        row.forEach(it => { const ch = it.area / cw; out.push({ ...it, x, y: yy, w: cw, h: ch }); yy += ch; });
        x += cw; w -= cw;
      } else {
        const ch = rowArea / w;
        let xx = x;
        row.forEach(it => { const cw = it.area / ch; out.push({ ...it, x: xx, y, w: cw, h: ch }); xx += cw; });
        y += ch; h -= ch;
      }
      rest = rest.slice(row.length);
    }
    return out;
    function worst(row, side) {
      const s = row.reduce((a, i) => a + i.area, 0), mx = Math.max(...row.map(i => i.area)), mn = Math.min(...row.map(i => i.area));
      return Math.max(side * side * mx / (s * s), (s * s) / (side * side * mn));
    }
  }
  function renderTreemap(el, d, o) {
    const { design, colors, fmt } = o;
    const items = foldItems(d.items, 6);
    const total = items.reduce((s, i) => s + i.value, 0);
    const f = { width: Math.max(240, Math.round(el.clientWidth || 320)), height: o.height || 230 };
    if (!total) return { html: '<div class="ck-empty">Nothing to show yet.</div>', after() {} };
    const defs = makeDefs();
    const tiles = squarify(items.map((it, i) => ({ ...it, ci: i })), 0, 0, f.width, f.height);
    const g = Math.max(2, design.gap);
    let body = '';
    tiles.forEach((t, i) => {
      const color = colors[t.ci % colors.length];
      const x = t.x + g / 2, y = t.y + g / 2, w = Math.max(0, t.w - g), h = Math.max(0, t.h - g);
      const shape = design.fill === 'segmented'
        ? '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1" fill="' + color + '"/><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="url(#' + (defs.pix || (defs.pix = (() => { const id = uid('px'); defs.add('<pattern id="' + id + '" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2"/></pattern>'); return id; })())) + ')"/>'
        : '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + Math.min(design.radius, 10) + '" ' + paintAttrs(design, color, defs) + '/>';
      const fits = w > 64 && h > 34;
      const text = fits ? '<text x="' + (x + 9) + '" y="' + (y + 18) + '" class="ck-in">' + esc(shorten(t.label, Math.floor(w / 7))) + '</text><text x="' + (x + 9) + '" y="' + (y + 33) + '" class="ck-in" style="font-weight:500;opacity:.9">' + esc(fmt(t.value)) + ' · ' + Math.round(t.value / total * 100) + '%</text>' : '';
      body += '<g class="ck-anim ck-mark" data-a="tile" data-i="' + i + '"' + markFilter(design, color) + '>' + shape + text + '</g>';
    });
    const html = svgOpen({ width: f.width, height: f.height }, design, o.title) + '<defs>' + defs.list.join('') + '</defs><g class="ck-plot">' + body + '</g></svg>'
      + '<div class="ck-legend">' + tiles.filter(t => !(t.w - g > 64 && t.h - g > 34)).map(t => '<span><i style="background:' + colors[t.ci % colors.length] + '"></i>' + esc(t.label) + ' <b>' + esc(fmt(t.value)) + '</b></span>').join('') + '</div>';
    return {
      html, after(rootEl) {
        rootEl.querySelectorAll('.ck-mark').forEach(m => {
          const t = tiles[Number(m.dataset.i)];
          hover(m, () => '<b>' + esc(t.label) + '</b><br>' + esc(fmt(t.value)) + ' · ' + Math.round(t.value / total * 100) + '% of ' + esc(fmt(total)), rootEl);
        });
      }
    };
  }

  // ----- calendar heatmap (one hue, five steps) -----
  function renderHeatmap(el, d, o) {
    const { design, colors, fmt } = o;
    const [yy, mm] = d.month.split('-').map(Number);
    const daysInMonth = new Date(yy, mm, 0).getDate();
    const firstDow = (new Date(yy, mm - 1, 1).getDay() + 6) % 7;
    const rows = Math.ceil((firstDow + daysInMonth) / 7);
    const width = Math.max(240, Math.round(el.clientWidth || 320));
    const gap = design.fill === 'segmented' ? 3 : 4;
    const cell = Math.min(46, (width - 6 * gap) / 7);
    const gridW = cell * 7 + gap * 6;
    const f = { width, height: 18 + rows * (cell + gap) };
    const vals = Object.values(d.days).filter(v => v > 0).sort((a, b) => a - b);
    const q = p => vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : 0;
    const cuts = [q(0.2), q(0.4), q(0.6), q(0.8)];
    const level = v => (v > 0 ? 1 + cuts.filter(c => v > c).length : 0);
    const alpha = [0, 0.22, 0.4, 0.6, 0.8, 1];
    const color = colors[0];
    const x0 = (width - gridW) / 2;
    let body = '';
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((dn, i) => { body += '<text x="' + (x0 + i * (cell + gap) + cell / 2) + '" y="11" text-anchor="middle" class="ck-axis">' + dn + '</text>'; });
    const pad = n => String(n).padStart(2, '0');
    for (let day = 1; day <= daysInMonth; day++) {
      const idx = firstDow + day - 1, col = idx % 7, row = Math.floor(idx / 7);
      const iso = d.month + '-' + pad(day);
      const v = d.days[iso] || 0, lv = level(v);
      const x = x0 + col * (cell + gap), y = 18 + row * (cell + gap);
      const fill = lv ? (design.fill === 'outline' ? rgba(color, alpha[lv] * 0.5) : rgba(color, alpha[lv])) : 'rgba(255,255,255,.045)';
      const stroke = design.fill === 'outline' || design.fill === 'glass' ? ' stroke="' + (lv ? color : 'rgba(255,255,255,.12)') + '" stroke-width="1"' : '';
      body += '<g class="ck-anim ck-mark" data-a="cell" data-i="' + day + '" data-r="' + row + '" data-c="' + col + '" data-iso="' + iso + '"' + (lv && (design.glow) ? markFilter(design, color) : '') + '>'
        + '<rect x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell + '" rx="' + Math.min(design.radius, cell / 2 - 1) + '" fill="' + fill + '"' + stroke + '/>'
        + (cell >= 22 ? '<text x="' + (x + 5) + '" y="' + (y + 12) + '" class="ck-axis" style="font-size:9px' + (lv >= 4 ? ';fill:#fff' : '') + '">' + day + '</text>' : '') + '</g>';
    }
    const scale = '<div class="ck-legend" style="justify-content:center"><span class="ck-muted">Less</span>' + alpha.slice(1).map(a => '<i style="background:' + rgba(color, a) + '"></i>').join('') + '<span class="ck-muted">More</span></div>';
    const html = svgOpen(f, design, o.title) + '<g class="ck-plot">' + body + '</g></svg>' + scale;
    return {
      html, after(rootEl) {
        rootEl.querySelectorAll('.ck-mark').forEach(m => {
          const iso = m.dataset.iso;
          hover(m, () => '<b>' + esc(new Date(iso + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })) + '</b><br>' + (d.days[iso] > 0 ? esc(fmt(d.days[iso])) : 'No spending'), rootEl);
        });
      }
    };
  }

  function legendFor(d, series, colors, o, lines) {
    const parts = [];
    if (series.length > 1) series.forEach((se, i) => parts.push('<span><i class="' + (lines ? 'ck-line' : '') + '" style="background:' + colors[i % colors.length] + '"></i>' + esc(se.name) + '</span>'));
    if (d.reference) parts.push('<span><i class="ck-dash"></i>' + esc(d.reference.label) + '</span>');
    if (d.kind === 'categorical' && d.items.some(i => i.target > 0)) parts.push('<span><i style="width:2px;height:12px;border-radius:1px;background:var(--ck-text)"></i>Budget</span>');
    return parts.length ? '<div class="ck-legend">' + parts.join('') + '</div>' : '';
  }

  // ============================================================
  // ANIMATION — Web Animations API on the tagged marks
  // ============================================================
  const EASE = 'cubic-bezier(.16,1,.3,1)';
  const SPRING = 'cubic-bezier(.34,1.56,.64,1)';
  function animate(rootEl, type, animId) {
    if (!animId || animId === 'none') return;
    if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const marks = [...rootEl.querySelectorAll('.ck-anim')];
    const play = (el, frames, opts) => { try { el.animate(frames, Object.assign({ fill: 'backwards', easing: EASE, duration: 800 }, opts)); } catch (_) {} };
    const idx = el => Number(el.dataset.i) || 0;

    if (type === 'bar' || type === 'hbar' || type === 'lollipop') {
      const horizontal = type === 'hbar';
      marks.forEach(el => {
        el.style.transformOrigin = horizontal ? '0% 50%' : '50% 100%';
        const from = horizontal ? 'scaleX(0)' : 'scaleY(0)';
        if (animId === 'fade') play(el, [{ opacity: 0, transform: horizontal ? 'translateX(-10px)' : 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: idx(el) * 40 });
        else if (animId === 'grow') play(el, [{ transform: from }, { transform: 'none' }], { duration: 750 });
        else if (animId === 'stagger') play(el, [{ transform: from, opacity: 0.3 }, { transform: 'none', opacity: 1 }], { duration: 600, delay: idx(el) * 70 });
        else if (animId === 'bounce') play(el, [{ transform: from }, { transform: 'none' }], { duration: 950, easing: SPRING, delay: idx(el) * 45 });
      });
      return;
    }
    if (type === 'pie' || type === 'donut') {
      const spin = rootEl.querySelector('.ck-spin');
      const slices = marks.filter(m => m.dataset.a === 'slice' || m.dataset.a === 'edge');
      const total = slices.filter(s => s.dataset.a === 'slice').reduce((s, c) => s + Number(c.dataset.len), 0) || 1;
      if (animId === 'sweep') {
        slices.forEach(c => {
          const da = c.getAttribute('stroke-dasharray').split(' ').map(Number);
          const full = da[0] + da[1];
          const slice = slices.find(s => s.dataset.a === 'slice' && s.dataset.i === c.dataset.i);
          const start = Number(slice.dataset.start) / total, share = Number(slice.dataset.len) / total;
          play(c, [{ strokeDasharray: '0 ' + full }, { strokeDasharray: da[0] + ' ' + da[1] }], { duration: Math.max(180, share * 1000), delay: start * 1000, easing: 'linear', fill: 'backwards' });
        });
      } else if (animId === 'pop') {
        slices.forEach(c => { c.style.transformOrigin = 'center'; c.style.transformBox = 'view-box'; play(c, [{ transform: 'scale(.55)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 650, easing: SPRING, delay: idx(c) * 90 }); });
      } else if (animId === 'spin' && spin) {
        play(spin, [{ transform: 'rotate(-160deg) scale(.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 1000 });
      } else if (animId === 'fade') {
        slices.forEach(c => play(c, [{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: idx(c) * 60 }));
      }
      return;
    }
    if (type === 'line' || type === 'area') {
      const plot = rootEl.querySelector('.ck-plot');
      const lines = marks.filter(m => m.dataset.a === 'line'), areas = marks.filter(m => m.dataset.a === 'area'), points = marks.filter(m => m.dataset.a === 'point');
      if (animId === 'draw') {
        lines.forEach(l => { l.style.strokeDasharray = '1'; play(l, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 1200, easing: 'cubic-bezier(.45,0,.2,1)', delay: idx(l) * 150, fill: 'both' }); });
        areas.forEach(a => play(a, [{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 700 }));
        points.forEach(p => play(p, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 1100 }));
      } else if (animId === 'rise' && plot) {
        play(plot, [{ transform: 'scaleY(0)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 900, easing: SPRING });
      } else if (animId === 'wipe' && plot) {
        play(plot, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], { duration: 1100, easing: 'cubic-bezier(.45,0,.2,1)' });
      } else if (animId === 'fade' && plot) {
        play(plot, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 700 });
      }
      return;
    }
    if (type === 'radial') {
      marks.forEach(c => {
        const len = Number(c.dataset.len), C = Number(c.dataset.c);
        if (animId === 'fade') { play(c, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: idx(c) * 80 }); return; }
        const opts = animId === 'bounce' ? { duration: 1100, easing: SPRING, delay: idx(c) * 60 } : animId === 'stagger' ? { duration: 700, delay: idx(c) * 140 } : { duration: 1000 };
        play(c, [{ strokeDasharray: '0.001 ' + C }, { strokeDasharray: len + ' ' + C }], opts);
      });
      return;
    }
    if (type === 'treemap') {
      marks.forEach(m => {
        m.style.transformOrigin = '50% 50%';
        if (animId === 'zoom') play(m, [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 650, easing: SPRING, delay: idx(m) * 80 });
        else if (animId === 'cascade') play(m, [{ transform: 'translateY(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 550, delay: idx(m) * 110 });
        else if (animId === 'fade') play(m, [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
      });
      return;
    }
    if (type === 'heatmap') {
      marks.forEach(m => {
        const r = Number(m.dataset.r), c = Number(m.dataset.c);
        m.style.transformOrigin = '50% 50%';
        if (animId === 'ripple') play(m, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 450, easing: SPRING, delay: (r + c) * 45 });
        else if (animId === 'rain') play(m, [{ transform: 'translateY(-12px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 450, delay: c * 70 + r * 25 });
        else if (animId === 'fade') play(m, [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
      });
    }
  }

  // ============================================================
  // PUBLIC: render(el, spec)
  //   spec = { type, data, style: {design, palette, animations}, animate?: true,
  //            format?(v), compact?(v), height?, title? }
  // ============================================================
  function render(el, spec) {
    ensureStyles();
    hideTip();
    const style = normalizeStyle(spec.style);
    const design = byId(DESIGNS, style.design);
    const palette = byId(PALETTES, style.palette);
    const data = spec.data;
    let type = spec.type;
    if (!supports(type, data)) type = TYPES.find(t => supports(t.id, data)).id;
    const o = { design, colors: palette.colors, fmt: spec.format || defaultFormat, compact: spec.compact || defaultCompact, height: spec.height, title: spec.title };
    el.classList.add('ck-root');
    el.classList.toggle('ck-panel-blueprint', design.panel === 'blueprint');
    const empty = data.kind === 'categorical' ? !data.items.some(i => i.value > 0 || i.target > 0)
      : data.kind === 'series' ? !data.series.some(s => s.values.some(v => v > 0))
        : !Object.values(data.days).some(v => v > 0);
    if (empty) { el.innerHTML = '<div class="ck-empty">' + esc(spec.emptyText || 'Nothing to show yet.') + '</div>'; return type; }
    const r = type === 'bar' ? renderBar(el, data, o)
      : type === 'hbar' ? renderHbar(el, data, o)
        : type === 'pie' ? renderPie(el, data, o, false)
          : type === 'donut' ? renderPie(el, data, o, true)
            : type === 'line' ? renderTrend(el, data, o, false)
              : type === 'area' ? renderTrend(el, data, o, true)
                : type === 'lollipop' ? renderLollipop(el, data, o)
                  : type === 'radial' ? renderRadial(el, data, o)
                    : type === 'treemap' ? renderTreemap(el, data, o)
                      : renderHeatmap(el, data, o);
    el.innerHTML = r.html;
    r.after(el);
    if (spec.animate !== false) animate(el, type, style.animations[type]);
    return type;
  }

  // Sample data for previews (Design Lab, and anywhere a demo is handy).
  const SAMPLES = {
    categorical: { kind: 'categorical', totalLabel: 'Spent', items: [
      { label: '🏠 Rent', value: 1200, target: 1200 }, { label: '🛒 Groceries', value: 372, target: 400 }, { label: '🍔 Dining out', value: 186, target: 150 },
      { label: '⛽ Gas', value: 96, target: 120 }, { label: '👕 Clothing', value: 64, target: 80 }, { label: '🎬 Fun', value: 45, target: 60 }] },
    series: { kind: 'series', x: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'], series: [{ name: 'Spent', values: [1640, 1720, 1580, 1810, 1690, 1760] }], reference: { value: 1900, label: 'Monthly budget' } },
    stacked: { kind: 'series', stacked: true, x: ['Aug 10', 'Aug 17', 'Aug 24', 'Aug 31', 'Sep 7', 'Sep 14', 'Sep 21', 'Sep 28'], series: [
      { name: 'Kept for spending', values: [820, 910, 760, 980, 870, 930, 800, 520] }, { name: 'Set aside', values: [160, 210, 140, 240, 190, 220, 170, 90] }] },
    calendar: (function () {
      const days = {};
      const vals = [0, 42, 18, 0, 65, 120, 88, 12, 0, 34, 27, 0, 9, 140, 76, 0, 22, 31, 58, 0, 110, 95, 14, 0, 37, 29, 0, 61, 132, 44];
      vals.forEach((v, i) => { days['2026-09-' + String(i + 1).padStart(2, '0')] = v; });
      return { kind: 'calendar', month: '2026-09', days };
    })()
  };
  function sampleFor(typeId) {
    const t = TYPES.find(x => x.id === typeId);
    if (t.kinds.includes('calendar')) return SAMPLES.calendar;
    if (typeId === 'area') return SAMPLES.stacked;
    if (t.kinds.includes('series') && !t.kinds.includes('categorical')) return SAMPLES.series;
    return SAMPLES.categorical;
  }

  root.ChartKit = { VERSION, TYPES, DESIGNS, PALETTES, ANIMATIONS, DEFAULT_STYLE, normalizeStyle, supports, render, animate, SAMPLES, sampleFor, hideTip };
})(window);
