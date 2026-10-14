// Interactive widgets mounted into lesson pages and the Practice → Simulators page.
import { encode, parseBits, SCHEMES, toNotation } from './linecoding.js';
import { lineCodingSvg, modulationSvg, spectrumSvg } from './render.js';
import { esc, $, $$ } from '../ui/dom.js';
import { diagram } from '../ui/diagrams.js';
import { recordExplore } from '../storage/repo.js';

const RULES = {
  'nrz-l': 'Level decides the bit: 0 → +V, 1 → −V (slide figure). No return to zero.',
  'nrz-i': 'A 1 inverts the level at the start of the bit; a 0 keeps the previous level. Set the reference level before the first bit.',
  rz: '1 → +V for the first half then 0; 0 → −V for the first half then 0. Returns to zero mid-bit.',
  manchester: 'Mid-bit transition always. 0 = high→low, 1 = low→high.',
  'diff-manchester': 'Mid-bit transition always. Transition at the start of the bit = 0; none = 1. Set the level before the first bit.',
  ami: '0 → zero; 1 → alternating +/−. Set the polarity of the last pulse before the sequence.',
  pseudoternary: '1 → zero; 0 → alternating +/−.',
  b8zs: 'AMI, but 8 consecutive zeros → 000VB0VB. V repeats the previous polarity; B follows AMI.',
  hdb3: 'AMI, but 4 consecutive zeros → 000V (odd pulses since last substitution) or B00V (even).',
};

export function mountLineCoding(el, p = {}) {
  el.innerHTML = `<div class="card">
    <div class="grid two">
      <label class="field"><span>Bits</span><input type="text" inputmode="numeric" class="levels" name="bits" value="${esc(p.bits || '10110001')}" aria-describedby="lc-err"></label>
      <label class="field"><span>Scheme</span><select name="scheme">${Object.entries(SCHEMES).map(([k, v]) => `<option value="${k}" ${k === (p.scheme || 'nrz-l') ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
    </div>
    <div class="row" data-opt="init"><label class="field" style="margin:0"><span>Level before first bit</span><select name="init"><option value="1">+V (positive)</option><option value="-1">−V (negative)</option></select></label></div>
    <div class="row" data-opt="last"><label class="field" style="margin:0"><span>Last nonzero pulse before the sequence</span><select name="last"><option value="1" ${p.lastPulse === 1 ? 'selected' : ''}>Positive (+)</option><option value="-1" ${p.lastPulse === 1 ? '' : 'selected'}>Negative (−)</option></select></label></div>
    <p id="lc-err" class="small" style="color:var(--bad)" role="alert"></p>
    <p class="small muted" data-rule></p>
    <div class="scroll-x" data-out></div>
    <p class="small">Notation: <code data-notation></code></p>
    <p class="small muted" data-src></p></div>`;
  const f = (n) => $(`[name="${n}"]`, el);
  if (p.scheme === 'diff-manchester') f('init').value = '-1';
  const draw = () => {
    const scheme = f('scheme').value;
    $('[data-opt="init"]', el).hidden = !['nrz-i', 'diff-manchester'].includes(scheme);
    $('[data-opt="last"]', el).hidden = !['ami', 'pseudoternary', 'b8zs', 'hdb3'].includes(scheme);
    try {
      const bits = parseBits(f('bits').value);
      const opts = { initialLevel: Number(f('init').value), lastPulse: Number(f('last').value) };
      const enc = encode(bits, scheme, opts);
      $('[data-out]', el).innerHTML = lineCodingSvg(enc, { title: SCHEMES[scheme].name });
      $('[data-notation]', el).textContent = toNotation(enc, SCHEMES[scheme].halves);
      $('#lc-err', el).textContent = '';
      recordExplore(`scheme:${scheme}`);
    } catch (e) { $('#lc-err', el).textContent = e.message; }
    $('[data-rule]', el).textContent = RULES[scheme];
    $('[data-src]', el).textContent = `Source: ${SCHEMES[scheme].slide}`;
  };
  el.addEventListener('input', draw);
  draw();
}

export function mountModulation(el, p = {}) {
  el.innerHTML = `<div class="card">
    <div class="grid two">
      <label class="field"><span>Bits</span><input type="text" class="levels" name="bits" value="${esc(p.bits || '1011')}"></label>
      <label class="field"><span>Carrier fc (Hz) — ASK/PSK</span><input type="number" name="fc" min="0.5" max="6" step="0.5" value="${p.fc ?? 1}"></label>
      <label class="field"><span>FSK: frequency for 1 (Hz)</span><input type="number" name="f1" min="0.5" max="8" step="0.5" value="${p.f1 ?? 2}"></label>
      <label class="field"><span>FSK: frequency for 0 (Hz)</span><input type="number" name="f0" min="0.5" max="8" step="0.5" value="${p.f0 ?? 1}"></label>
    </div>
    <p class="small muted">Bit duration is 1 s, so fc = 1 Hz gives one carrier cycle per bit. ASK uses on-off keying (0 → zero amplitude). PSK: 1 → 0°, 0 → 180°. The FSK frequencies are illustrative — state your own choice in an exam if the question does not give them.</p>
    <p class="small" style="color:var(--bad)" role="alert" data-err></p>
    <div class="scroll-x" data-out></div></div>`;
  const draw = () => {
    const v = (n) => $(`[name="${n}"]`, el).value;
    try {
      const bits = parseBits(v('bits'));
      if (bits.length > 12) throw new RangeError('Use at most 12 bits here');
      const o = { fc: Number(v('fc')) || 1, f1: Number(v('f1')) || 2, f0: Number(v('f0')) || 1 };
      $('[data-out]', el).innerHTML = ['ask', 'psk', 'fsk'].map((s) => modulationSvg(bits, s, o)).join('');
      $('[data-err]', el).textContent = '';
    } catch (e) { $('[data-err]', el).textContent = e.message; }
  };
  el.addEventListener('input', draw);
  draw();
}

export function mountSpectrum(el, p = {}) {
  const freqs = p.freqs || [0, 4, 8, 12, 16];
  const amps = p.amps || [3, 10, 20, 10, 5];
  el.innerHTML = `<div class="card">
    <label class="field"><span>Components as frequency:amplitude</span><input type="text" class="levels" name="spec" value="${esc(freqs.map((f, i) => `${f}:${amps[i]}`).join(', '))}"></label>
    <div class="row"><label><input type="checkbox" name="periodic" ${p.periodic ? 'checked' : ''}> Periodic signal (discrete spikes)</label></div>
    <p class="small" style="color:var(--bad)" role="alert" data-err></p>
    <div class="scroll-x" data-out></div>
    <p class="small muted" data-info></p></div>`;
  const draw = () => {
    const pairs = $('[name="spec"]', el).value.split(',').map((s) => s.trim().split(':').map(Number)).filter((a) => a.length === 2 && a.every(Number.isFinite));
    if (pairs.length < 2) { $('[data-err]', el).textContent = 'Enter at least two components, e.g. 0:3, 8:20'; return; }
    pairs.sort((a, b) => a[0] - b[0]);
    $('[data-err]', el).textContent = '';
    const periodic = $('[name="periodic"]', el).checked;
    $('[data-out]', el).innerHTML = spectrumSvg(pairs.map((x) => x[0]), pairs.map((x) => x[1]), { periodic });
    $('[data-info]', el).textContent = periodic ? 'Periodic composite → discrete frequencies (spikes).' : 'Nonperiodic composite → continuous frequencies (a smooth curve over the band).';
  };
  el.addEventListener('input', draw);
  draw();
}

// Midterm Figure 1 (Forouzan Fig. 2.18): logical/physical pairs.
const HOPS = [
  { at: 'Host A (A/10)', what: 'The upper layers hand data down. The network layer adds source logical address A and destination logical address P. P is on another network, so the data link layer addresses the frame to Router 1’s LAN 1 interface (physical 20).', frame: null },
  { at: 'LAN 1: Host A → Router 1', what: 'Frame travels on LAN 1.', frame: ['20', '10', 'A', 'P'] },
  { at: 'Router 1 (F/20 | T/99)', what: 'Router 1 accepts the frame (20 is its address), removes the data-link header and trailer (decapsulation), reads destination logical address P, routes it to LAN 2, and builds a new frame with new physical addresses (encapsulation).', frame: null },
  { at: 'LAN 2: Router 1 → Router 2', what: 'New frame on LAN 2: source is Router 1’s LAN 2 interface (99), destination is Router 2’s LAN 2 interface (33).', frame: ['33', '99', 'A', 'P'] },
  { at: 'Router 2 (N/33 | Z/66)', what: 'Router 2 repeats the process: decapsulate, route on P, re-encapsulate for LAN 3.', frame: null },
  { at: 'LAN 3: Router 2 → Host D', what: 'Final frame: source 66 (Router 2’s LAN 3 interface), destination 95 (Host D).', frame: ['95', '66', 'A', 'P'] },
  { at: 'Host D (P/95)', what: 'Host D accepts the frame (95 matches), removes the header/trailer and passes the data up. The logical addresses A → P were never changed.', frame: null },
];
export function mountJourney(el) {
  let i = 0;
  el.innerHTML = `<div class="card">
    <div class="scroll-x"><svg viewBox="0 0 640 120" width="640" role="img" aria-label="Host A, LAN 1, Router 1, LAN 2, Router 2, LAN 3, Host D in a line" data-map></svg></div>
    <div aria-live="polite"><h4 data-at></h4><p data-what></p><div class="table-wrap" data-frame></div></div>
    <div class="row"><button class="btn" data-prev>Previous hop</button><button class="btn primary" data-next>Next hop</button><span class="small muted" data-step></span></div>
    <p class="small muted">Rule: physical addresses change at every hop; logical (and port) addresses usually stay the same. Port numbers are not given in the exam figure, so they are not invented here.</p></div>`;
  const xs = [30, 120, 210, 320, 430, 520, 610];
  const names = ['Host A\nA/10', 'LAN 1', 'Router 1\nF/20 T/99', 'LAN 2', 'Router 2\nN/33 Z/66', 'LAN 3', 'Host D\nP/95'];
  const draw = () => {
    $('[data-map]', el).innerHTML = `<line x1="30" y1="50" x2="610" y2="50" stroke="var(--line)" stroke-width="3"/>` + xs.map((x, k) => {
      const active = k === i;
      const isLan = k % 2 === 1;
      const shape = isLan ? `<ellipse cx="${x}" cy="50" rx="34" ry="16" fill="${active ? 'var(--primary-soft)' : 'var(--surface-2)'}" stroke="${active ? 'var(--primary)' : 'var(--ink-2)'}" stroke-width="${active ? 3 : 1.2}"/>` : `<rect x="${x - 22}" y="34" width="44" height="32" rx="6" fill="${active ? 'var(--primary)' : 'var(--surface)'}" stroke="var(--ink-2)"/>`;
      return shape + names[k].split('\n').map((t, j) => `<text x="${x}" y="${isLan ? 55 : 84 + j * 14}" text-anchor="middle" font-size="11" fill="var(--ink)">${t}</text>`).join('');
    }).join('');
    const h = HOPS[i];
    $('[data-at]', el).textContent = h.at;
    $('[data-what]', el).textContent = h.what;
    $('[data-frame]', el).innerHTML = h.frame ? `<table><thead><tr><th>Dest. physical</th><th>Source physical</th><th>Source logical</th><th>Dest. logical</th><th>Data</th><th>Trailer</th></tr></thead><tbody><tr>${h.frame.map((c, k) => `<td><b>${c}</b>${k < 2 ? ' <span class="chip im">changes per hop</span>' : ' <span class="chip ok">unchanged</span>'}</td>`).join('')}<td>Data</td><td>T2</td></tr></tbody></table>` : '';
    $('[data-step]', el).textContent = `Step ${i + 1} of ${HOPS.length}`;
    $('[data-prev]', el).disabled = i === 0;
    $('[data-next]', el).disabled = i === HOPS.length - 1;
  };
  $('[data-prev]', el).onclick = () => { i = Math.max(0, i - 1); draw(); };
  $('[data-next]', el).onclick = () => { i = Math.min(HOPS.length - 1, i + 1); draw(); };
  draw();
}

// Labelling exercise: tap a label then tap a slot (keyboard friendly), or drag and drop.
const LABEL_SETS = {
  fiber: { title: 'Fiber-optic cable', diagram: 'fiber-layers', slots: ['1', '2', '3', '4', '5'], answers: { 1: 'Core', 2: 'Cladding', 3: 'Plastic buffer', 4: 'Kevlar strength members', 5: 'Outer jacket' }, hint: 'Numbers count from the centre outward (1 = innermost).' },
  osi: { title: 'OSI model layers (top to bottom)', diagram: null, slots: ['7', '6', '5', '4', '3', '2', '1'], answers: { 7: 'Application', 6: 'Presentation', 5: 'Session', 4: 'Transport', 3: 'Network', 2: 'Data link', 1: 'Physical' }, hint: 'Layer 7 at the top, layer 1 at the bottom.' },
};
export function mountLabel(el, p = {}) {
  const set = LABEL_SETS[p.diagram || 'fiber'];
  const labels = Object.values(set.answers).sort(() => Math.random() - 0.5);
  const placed = {};
  let picked = null;
  el.innerHTML = `<div class="card"><h4>${esc(set.title)}</h4>
    ${set.diagram ? `<div class="figure">${diagram(set.diagram).replace(/\d\. [^<]+/g, (m) => `${m[0]}. ?`)}</div>` : ''}
    <p class="small muted">${esc(set.hint)} Tap a label, then tap a slot (or drag it).</p>
    <div class="row" data-bank>${labels.map((l) => `<button type="button" class="chip label-chip" draggable="true" data-label="${esc(l)}" aria-pressed="false">${esc(l)}</button>`).join('')}</div>
    <ol class="list" style="margin-top:.75rem">${set.slots.map((s) => `<li class="row"><b style="width:2.5rem">${s}.</b><button type="button" class="dropzone" data-slot="${s}" aria-label="Slot ${s}: empty">—</button><span data-res="${s}"></span></li>`).join('')}</ol>
    <div class="row"><button class="btn primary" data-check>Check labels</button><button class="btn" data-reset>Reset</button><span data-score class="verdict"></span></div></div>`;
  const sync = () => {
    $$('[data-slot]', el).forEach((z) => { const v = placed[z.dataset.slot]; z.textContent = v || '—'; z.setAttribute('aria-label', `Slot ${z.dataset.slot}: ${v || 'empty'}`); });
    $$('[data-label]', el).forEach((b) => { b.hidden = Object.values(placed).includes(b.dataset.label); b.setAttribute('aria-pressed', String(b.dataset.label === picked)); });
  };
  const put = (slot, label) => { for (const k of Object.keys(placed)) if (placed[k] === label) delete placed[k]; placed[slot] = label; picked = null; sync(); };
  el.addEventListener('click', (e) => {
    const lab = e.target.closest('[data-label]'); const slot = e.target.closest('[data-slot]');
    if (lab) { picked = lab.dataset.label; sync(); }
    else if (slot) { if (picked) put(slot.dataset.slot, picked); else if (placed[slot.dataset.slot]) { delete placed[slot.dataset.slot]; sync(); } }
  });
  el.addEventListener('dragstart', (e) => { const l = e.target.closest('[data-label]'); if (l) e.dataTransfer.setData('text/plain', l.dataset.label); });
  el.addEventListener('dragover', (e) => { if (e.target.closest('[data-slot]')) e.preventDefault(); });
  el.addEventListener('drop', (e) => { const s = e.target.closest('[data-slot]'); if (s) { e.preventDefault(); put(s.dataset.slot, e.dataTransfer.getData('text/plain')); } });
  $('[data-reset]', el).onclick = () => { for (const k of Object.keys(placed)) delete placed[k]; $$('[data-res]', el).forEach((r) => { r.textContent = ''; }); $('[data-score]', el).textContent = ''; sync(); };
  $('[data-check]', el).onclick = () => {
    let ok = 0;
    for (const s of set.slots) {
      const good = placed[s] === set.answers[s];
      if (good) ok += 1;
      $(`[data-res="${s}"]`, el).innerHTML = good ? '<span class="chip ok">✓ correct</span>' : `<span class="chip vi">✗ ${esc(set.answers[s])}</span>`;
    }
    const sc = $('[data-score]', el);
    sc.textContent = `${ok} / ${set.slots.length} correct`;
    sc.className = `verdict ${ok === set.slots.length ? 'ok' : 'bad'}`;
  };
  sync();
}

// Simple drawing pad for diagram answers (stored with the attempt as a PNG data URL).
export function mountCanvas(el) {
  el.innerHTML = `<canvas class="draw" aria-label="Drawing area for your diagram"></canvas>
    <div class="row small"><button type="button" class="btn small" data-clear>Clear drawing</button><span class="muted">Draw with mouse, finger or stylus.</span></div>`;
  const c = $('canvas', el);
  const ctx = c.getContext('2d');
  const fit = () => { const r = c.getBoundingClientRect(); const img = c.width ? c.toDataURL() : null; c.width = r.width * devicePixelRatio; c.height = r.height * devicePixelRatio; ctx.scale(devicePixelRatio, devicePixelRatio); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#172033'; if (img) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, r.width, r.height); im.src = img; } };
  requestAnimationFrame(fit);
  let drawing = false, dirty = false;
  const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  c.addEventListener('pointerdown', (e) => { drawing = true; dirty = true; c.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); });
  c.addEventListener('pointermove', (e) => { if (drawing) { ctx.lineTo(...pos(e)); ctx.stroke(); } });
  c.addEventListener('pointerup', () => { drawing = false; });
  $('[data-clear]', el).onclick = () => { ctx.clearRect(0, 0, c.width, c.height); dirty = false; };
  return { get: () => (dirty ? c.toDataURL('image/png', 0.6) : null) };
}

export function mountSim(el, id, params) {
  ({ linecoding: mountLineCoding, modulation: mountModulation, spectrum: mountSpectrum, journey: mountJourney, label: mountLabel }[id] || (() => { el.textContent = 'Simulator not found'; }))(el, params || {});
}
