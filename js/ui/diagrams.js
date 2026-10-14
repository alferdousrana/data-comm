// Original, editable SVG diagrams (not copies of slide images). Colours come from CSS tokens.
const T = (x, y, s, a = 'middle', extra = '') => `<text x="${x}" y="${y}" text-anchor="${a}" font-size="12" fill="var(--ink)" ${extra}>${s}</text>`;
const node = (x, y, r = 9) => `<circle cx="${x}" cy="${y}" r="${r}" fill="var(--surface)" stroke="var(--primary)" stroke-width="2"/>`;
const ln = (x1, y1, x2, y2, c = 'var(--ink-2)', w = 1.6, dash = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
const svg = (w, h, label, body) => `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${label}" style="max-width:${w}px">${body}</svg>`;

function ring(cx, cy, r, n) {
  const pts = Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), cy + r * Math.sin((2 * Math.PI * i) / n - Math.PI / 2)]);
  return { pts, lines: pts.map((p, i) => ln(p[0], p[1], pts[(i + 1) % n][0], pts[(i + 1) % n][1], 'var(--trace)', 2)).join(''), nodes: pts.map((p) => node(p[0], p[1], 7)).join('') };
}

export const DIAGRAMS = {
  'switching-compare': () => svg(620, 210, 'Circuit switching versus packet switching', `
    ${T(150, 18, 'Circuit switching', 'middle', 'font-weight="700"')}${T(470, 18, 'Packet switching', 'middle', 'font-weight="700"')}
    ${node(30, 110)}${node(270, 110)}
    ${[90, 150, 210].map((x, i) => `<rect x="${x - 16}" y="${[70, 120, 80][i]}" width="32" height="24" rx="4" fill="var(--surface-2)" stroke="var(--ink-2)"/>`).join('')}
    <path d="M30 110 L90 82 L150 132 L210 92 L270 110" fill="none" stroke="var(--trace)" stroke-width="4"/>
    ${T(150, 185, 'Dedicated circuit reserved for the whole call')}
    ${node(350, 110)}${node(590, 110)}
    ${[[410, 70], [470, 140], [530, 80], [470, 60]].map(([x, y]) => `<rect x="${x - 18}" y="${y - 12}" width="36" height="24" rx="4" fill="var(--surface-2)" stroke="var(--ink-2)"/>`).join('')}
    ${ln(350, 110, 410, 70)}${ln(350, 110, 470, 140)}${ln(410, 70, 470, 60)}${ln(470, 60, 530, 80)}${ln(470, 140, 530, 80)}${ln(530, 80, 590, 110)}${ln(410, 70, 470, 140)}
    ${[[380, 92], [440, 66], [500, 112], [560, 96]].map(([x, y], i) => `<rect x="${x - 7}" y="${y - 6}" width="14" height="12" fill="${i % 2 ? 'var(--trace)' : 'var(--primary)'}"/>`).join('')}
    ${T(470, 185, 'Packets queued and forwarded by routers')}`),

  topologies: () => {
    const mesh = Array.from({ length: 5 }, (_, i) => [80 + 50 * Math.cos((2 * Math.PI * i) / 5 - Math.PI / 2), 95 + 50 * Math.sin((2 * Math.PI * i) / 5 - Math.PI / 2)]);
    let m = '';
    mesh.forEach((a, i) => mesh.slice(i + 1).forEach((b) => { m += ln(a[0], a[1], b[0], b[1]); }));
    const star = [[230, 50], [290, 70], [290, 130], [230, 150], [190, 100]];
    const r = ring(560, 95, 50, 6);
    return svg(640, 190, 'Mesh, star, bus and ring topologies', `
      ${m}${mesh.map((p) => node(p[0], p[1], 7)).join('')}${T(80, 180, 'Mesh: n(n−1)/2 links')}
      ${star.map((p) => ln(245, 100, p[0], p[1])).join('')}<rect x="232" y="90" width="26" height="20" rx="3" fill="var(--primary)"/>${star.map((p) => node(p[0], p[1], 7)).join('')}${T(245, 180, 'Star: all to a hub')}
      ${ln(330, 100, 470, 100, 'var(--trace)', 4)}${[350, 395, 440].map((x, i) => ln(x, 100, x, i % 2 ? 140 : 60) + node(x, i % 2 ? 140 : 60, 7)).join('')}${T(400, 180, 'Bus: one backbone')}
      ${r.lines}${r.nodes}${T(560, 180, 'Ring: neighbour to neighbour')}`);
  },

  'hybrid-bus-star-rings': () => {
    const r1 = ring(330, 190, 46, 4), r2 = ring(530, 190, 46, 4);
    const starPts = [[70, 230], [110, 250], [170, 250], [210, 230]];
    return svg(620, 270, 'Hybrid topology: bus backbone connecting one star and two rings', `
      ${ln(40, 50, 590, 50, 'var(--trace)', 5)}<rect x="32" y="40" width="8" height="20" fill="var(--ink)"/><rect x="590" y="40" width="8" height="20" fill="var(--ink)"/>
      ${T(315, 32, 'Bus backbone (with terminators)', 'middle', 'font-weight="700"')}
      ${ln(140, 50, 140, 160, 'var(--ink-2)', 1.6, '4 3')}${T(150, 105, 'drop line', 'start')}
      ${starPts.map((p) => ln(140, 170, p[0], p[1])).join('')}<rect x="122" y="160" width="36" height="22" rx="3" fill="var(--primary)"/>${T(140, 176, 'Hub', 'middle', 'fill="var(--primary-ink)"')}
      ${starPts.map((p) => node(p[0], p[1], 7)).join('')}${T(140, 268, 'Star')}
      ${ln(330, 50, r1.pts[0][0], r1.pts[0][1], 'var(--ink-2)', 1.6, '4 3')}${r1.lines}${r1.nodes}${T(330, 255, 'Ring 1')}
      ${ln(530, 50, r2.pts[0][0], r2.pts[0][1], 'var(--ink-2)', 1.6, '4 3')}${r2.lines}${r2.nodes}${T(530, 255, 'Ring 2')}`);
  },

  'fiber-layers': () => {
    const layers = [['Outer jacket', 110, 'var(--surface-2)'], ['Kevlar strength members', 88, 'var(--warn-soft)'], ['Plastic buffer', 66, 'var(--primary-soft)'], ['Cladding (lower refractive index)', 44, 'var(--surface)'], ['Core (glass or plastic)', 22, 'var(--trace)']];
    return svg(620, 250, 'Fiber-optic cable cross-section with core, cladding, plastic buffer, Kevlar and outer jacket', `
      ${layers.map(([, r, c]) => `<circle cx="125" cy="125" r="${r}" fill="${c}" stroke="var(--ink-2)" stroke-width="1.2"/>`).join('')}
      ${layers.map(([name, r], i) => `${ln(125 + r * 0.7, 125 - r * 0.7, 270, 30 + i * 46)}${T(278, 34 + i * 46, `${5 - i}. ${name}`, 'start')}`).join('')}`);
  },

  'fiber-tir': () => svg(620, 150, 'Light ray travelling in the core by total internal reflection', `
    <rect x="40" y="20" width="540" height="30" fill="var(--surface-2)" stroke="var(--ink-2)"/><rect x="40" y="50" width="540" height="50" fill="var(--primary-soft)" stroke="var(--ink-2)"/><rect x="40" y="100" width="540" height="30" fill="var(--surface-2)" stroke="var(--ink-2)"/>
    ${T(310, 40, 'Cladding')}${T(310, 124, 'Cladding')}${T(70, 80, 'Core', 'start')}
    <path d="M40 75 L110 50 L200 100 L290 50 L380 100 L470 50 L560 100 L580 93" fill="none" stroke="var(--trace)" stroke-width="2.6"/>
    ${T(310, 146, 'Ray hits the core–cladding boundary above the critical angle and is totally reflected')}`),

  'nyquist-shannon': () => svg(620, 170, 'When to use Nyquist or Shannon', `
    <rect x="10" y="20" width="180" height="60" rx="8" fill="var(--surface-2)" stroke="var(--ink-2)"/>${T(100, 45, 'Noiseless channel?')}${T(100, 64, 'levels L given')}
    <rect x="220" y="20" width="180" height="60" rx="8" fill="var(--primary-soft)" stroke="var(--primary)"/>${T(310, 45, 'Nyquist', 'middle', 'font-weight="700"')}${T(310, 64, 'N = 2B log₂L')}
    <rect x="10" y="95" width="180" height="60" rx="8" fill="var(--surface-2)" stroke="var(--ink-2)"/>${T(100, 120, 'Noisy channel?')}${T(100, 139, 'SNR (or dB) given')}
    <rect x="220" y="95" width="180" height="60" rx="8" fill="var(--warn-soft)" stroke="var(--warn)"/>${T(310, 120, 'Shannon', 'middle', 'font-weight="700"')}${T(310, 139, 'C = B log₂(1+SNR)')}
    ${ln(190, 50, 220, 50, 'var(--primary)', 2)}${ln(190, 125, 220, 125, 'var(--warn)', 2)}
    <rect x="430" y="50" width="180" height="80" rx="8" fill="var(--surface)" stroke="var(--ink-2)"/>${T(520, 76, 'Both?', 'middle', 'font-weight="700"')}${T(520, 96, 'Shannon → upper limit')}${T(520, 114, 'Nyquist → levels')}`),

  'bit-baud': () => {
    const row = (y, groups, label) => groups.map((g, i) => `<rect x="${60 + i * (480 / groups.length)}" y="${y}" width="${480 / groups.length - 6}" height="34" rx="4" fill="var(--primary-soft)" stroke="var(--primary)"/>${T(60 + i * (480 / groups.length) + (480 / groups.length - 6) / 2, y + 22, g)}`).join('') + T(30, y + 22, label);
    return svg(580, 120, 'Bit rate versus baud rate', `${row(10, ['1', '0', '1', '1', '0', '0', '1', '0'], 'r=1')}${row(66, ['10', '11', '00', '10'], 'r=2')}`);
  },
};

export function diagram(id) { return DIAGRAMS[id] ? DIAGRAMS[id]() : `<p class="muted">Diagram “${id}” is not available.</p>`; }
