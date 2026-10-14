// SVG renderers (strings) for line coding, digital-to-analog modulation and frequency domain.
import { esc } from '../ui/dom.js';

export function lineCodingSvg(encoded, { title = '', bitW = 56 } = {}) {
  const n = encoded.length;
  const padL = 34, padT = 26, H = 120;
  const W = padL + n * bitW + 12;
  const y = (v) => padT + (1 - v) * 40; // +1 → padT, 0 → padT+40, −1 → padT+80
  let d = '';
  encoded.forEach((e, i) => {
    const x0 = padL + i * bitW, xm = x0 + bitW / 2, x1 = x0 + bitW;
    const [a, b] = e.levels;
    d += i === 0 ? `M${x0},${y(a)}` : `L${x0},${y(a)}`;
    d += `L${xm},${y(a)}L${xm},${y(b)}L${x1},${y(b)}`;
  });
  const grid = encoded.map((e, i) => {
    const x0 = padL + i * bitW;
    return `<line x1="${x0}" y1="14" x2="${x0}" y2="${H - 4}" stroke="var(--line)" stroke-dasharray="3 3"/>
      <text x="${x0 + bitW / 2}" y="14" text-anchor="middle" style="fill:var(--ink);font-weight:700">${e.bit}</text>
      ${e.mark ? `<text x="${x0 + bitW / 2}" y="${e.levels[0] >= 0 ? y(e.levels[0]) - 5 : y(e.levels[0]) + 15}" text-anchor="middle" style="fill:var(--trace-2);font-weight:700">${e.mark}</text>` : ''}`;
  }).join('');
  return `<svg class="wave-svg" viewBox="0 0 ${W} ${H + 6}" width="${W}" height="${H + 6}" role="img" aria-label="${esc(title)} waveform for bits ${encoded.map((e) => e.bit).join('')}">
    <text x="4" y="${y(1) + 4}">+</text><text x="4" y="${y(0) + 4}">0</text><text x="4" y="${y(-1) + 4}">−</text>
    <line x1="${padL}" y1="${y(0)}" x2="${W - 8}" y2="${y(0)}" stroke="var(--ink-2)" stroke-width="1"/>
    ${grid}<line x1="${padL + n * bitW}" y1="14" x2="${padL + n * bitW}" y2="${H - 4}" stroke="var(--line)" stroke-dasharray="3 3"/>
    <path d="${d}" fill="none" stroke="var(--trace)" stroke-width="2.6" stroke-linejoin="round"/>
  </svg>`;
}

// Digital-to-analog: scheme 'ask' | 'psk' | 'fsk'. fc in Hz, bitTime in s.
export function modulationSvg(bits, scheme, { fc = 1, bitTime = 1, f1 = 2, f0 = 1, ask0 = 0, bitW = 110 } = {}) {
  const n = bits.length, padL = 30, H = 110, mid = 58, A = 38;
  const W = padL + n * bitW + 10;
  const samples = 60;
  let d = '';
  bits.forEach((b, i) => {
    for (let k = 0; k <= samples; k += 1) {
      const t = (k / samples) * bitTime; // local time inside the bit
      const tg = i * bitTime + t;
      let v;
      if (scheme === 'ask') v = (b ? 1 : ask0) * Math.sin(2 * Math.PI * fc * tg);
      else if (scheme === 'psk') v = Math.sin(2 * Math.PI * fc * tg + (b ? 0 : Math.PI));
      else v = Math.sin(2 * Math.PI * (b ? f1 : f0) * t);
      const x = padL + i * bitW + (k / samples) * bitW;
      d += `${i === 0 && k === 0 ? 'M' : 'L'}${x.toFixed(1)},${(mid - v * A).toFixed(1)}`;
    }
  });
  const grid = bits.map((b, i) => `<line x1="${padL + i * bitW}" y1="12" x2="${padL + i * bitW}" y2="${H}" stroke="var(--line)" stroke-dasharray="3 3"/><text x="${padL + i * bitW + bitW / 2}" y="12" text-anchor="middle" style="fill:var(--ink);font-weight:700">${b}</text>`).join('');
  const label = { ask: 'ASK', psk: 'PSK', fsk: 'FSK' }[scheme];
  return `<svg class="wave-svg" viewBox="0 0 ${W} ${H + 4}" width="${W}" height="${H + 4}" role="img" aria-label="${label} waveform for ${bits.join('')}">
    <text x="2" y="${mid + 4}">${label}</text>${grid}
    <line x1="${padL}" y1="${mid}" x2="${W - 6}" y2="${mid}" stroke="var(--ink-2)" stroke-width=".8"/>
    <path d="${d}" fill="none" stroke="var(--trace)" stroke-width="2.2"/></svg>`;
}

// Frequency domain: discrete spikes (periodic) or a smooth continuous envelope (nonperiodic).
export function spectrumSvg(freqs, amps, { periodic = true, unit = 'Hz', showBw = true } = {}) {
  const W = 520, H = 230, padL = 44, padB = 52, padT = 18;
  const fmin = Math.min(...freqs), fmax = Math.max(...freqs);
  const span = fmax - fmin || 1;
  const amax = Math.max(...amps, 1);
  const x = (f) => padL + ((f - fmin) / span) * (W - padL - 30) + 6;
  const y = (a) => H - padB - (a / amax) * (H - padB - padT);
  let body = '';
  if (periodic) {
    body = freqs.map((f, i) => `<line x1="${x(f)}" y1="${y(0)}" x2="${x(f)}" y2="${y(amps[i])}" stroke="var(--trace)" stroke-width="4"/><text x="${x(f)}" y="${y(amps[i]) - 5}" text-anchor="middle">${amps[i]}</text>`).join('');
  } else {
    // Catmull-Rom style smooth path through the given points
    const pts = freqs.map((f, i) => [x(f), y(amps[i])]);
    let d = `M${pts[0][0]},${y(0)} L${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
    }
    d += ` L${pts[pts.length - 1][0]},${y(0)} Z`;
    body = `<path d="${d}" fill="var(--primary-soft)" stroke="var(--trace)" stroke-width="2.5"/>` + pts.map((p, i) => `<text x="${p[0]}" y="${p[1] - 6}" text-anchor="middle">${amps[i]}</text>`).join('');
  }
  const ticks = freqs.map((f) => `<text x="${x(f)}" y="${H - padB + 16}" text-anchor="middle">${f}</text>`).join('');
  const bw = showBw ? `<line x1="${x(fmin)}" y1="${H - 18}" x2="${x(fmax)}" y2="${H - 18}" stroke="var(--primary)" stroke-width="1.6" marker-start="url(#ar)" marker-end="url(#ar)"/><text x="${(x(fmin) + x(fmax)) / 2}" y="${H - 4}" text-anchor="middle" style="fill:var(--primary);font-weight:700">Bandwidth = ${fmax} − ${fmin} = ${span} ${unit}</text>` : '';
  return `<svg class="wave-svg" viewBox="0 0 ${W} ${H}" width="100%" style="min-width:440px" role="img" aria-label="${periodic ? 'Discrete' : 'Continuous'} frequency-domain plot from ${fmin} to ${fmax} ${unit}">
    <defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="var(--primary)"/></marker></defs>
    <line x1="${padL}" y1="${y(0)}" x2="${W - 10}" y2="${y(0)}" stroke="var(--ink-2)"/><line x1="${padL}" y1="${y(0)}" x2="${padL}" y2="${padT - 6}" stroke="var(--ink-2)"/>
    <text x="${W - 12}" y="${y(0) - 6}" text-anchor="end">Frequency (${unit})</text><text x="${padL + 4}" y="${padT}">Amplitude</text>
    ${body}${ticks}${bw}</svg>`;
}
