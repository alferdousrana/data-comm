// Line coding + scrambling engine. Conventions follow the Chapter 4 slides
// (Forouzan 5th ed., Figures 4.6–4.9, 4.19, 4.20):
//   NRZ-L      : 0 → positive, 1 → negative                         (Fig 4.6)
//   NRZ-I      : 1 → invert level at start of bit, 0 → no change    (Fig 4.6)
//   RZ         : 1 → +V then 0 ; 0 → −V then 0 (returns mid-bit)     (Fig 4.7)
//   Manchester : 0 → high-to-low, 1 → low-to-high (mid-bit)          (Fig 4.8)
//   Diff. Manchester : always mid-bit transition; transition at the start
//                      of the bit means 0, no transition means 1      (Fig 4.8)
//   AMI        : 0 → zero; 1 → alternating ±                         (Fig 4.9)
//   Pseudoternary : 1 → zero; 0 → alternating ±                      (Fig 4.9)
//   B8ZS       : 8 zeros → 000VB0VB                                  (Fig 4.19)
//   HDB3       : 4 zeros → 000V (odd pulses since last sub) or B00V (even) (Fig 4.20)
// Every encoder returns one entry per bit: { bit, levels:[firstHalf, secondHalf], mark }.
// Levels are +1, 0, −1. `mark` is 'V' or 'B' for scrambling substitutions.

export const SCHEMES = {
  'nrz-l': { name: 'NRZ-L', halves: false, slide: 'Ch4 slides 15–17 (Fig 4.6)' },
  'nrz-i': { name: 'NRZ-I', halves: false, slide: 'Ch4 slides 15–17 (Fig 4.6)' },
  rz: { name: 'RZ', halves: true, slide: 'Ch4 slide 20 (Fig 4.7)' },
  manchester: { name: 'Manchester', halves: true, slide: 'Ch4 slides 21–24 (Fig 4.8)' },
  'diff-manchester': { name: 'Differential Manchester', halves: true, slide: 'Ch4 slides 21–24 (Fig 4.8)' },
  ami: { name: 'AMI', halves: false, slide: 'Ch4 slide 25 (Fig 4.9)' },
  pseudoternary: { name: 'Pseudoternary', halves: false, slide: 'Ch4 slide 25 (Fig 4.9)' },
  b8zs: { name: 'B8ZS', halves: false, slide: 'Ch4 slide 40 (Fig 4.19)' },
  hdb3: { name: 'HDB3', halves: false, slide: 'Ch4 slide 41 (Fig 4.20)' },
};

export function parseBits(input) {
  const s = String(input ?? '').replace(/[\s,]/g, '');
  if (!s.length) throw new RangeError('Enter at least one bit');
  if (!/^[01]+$/.test(s)) throw new RangeError('Bits must contain only 0 and 1');
  if (s.length > 64) throw new RangeError('Use at most 64 bits');
  return s.split('').map(Number);
}

const flat = (bit, v, mark = null) => ({ bit, levels: [v, v], mark });

export function encode(bitsIn, scheme, opts = {}) {
  const bits = Array.isArray(bitsIn) ? bitsIn : parseBits(bitsIn);
  switch (scheme) {
    case 'nrz-l': {
      const oneLevel = opts.onePositive ? 1 : -1;
      return bits.map((b) => flat(b, b ? oneLevel : -oneLevel));
    }
    case 'nrz-i': {
      let level = opts.initialLevel ?? 1; // level before the first bit
      return bits.map((b) => { if (b) level = -level; return flat(b, level); });
    }
    case 'rz':
      return bits.map((b) => ({ bit: b, levels: [b ? 1 : -1, 0], mark: null }));
    case 'manchester':
      return bits.map((b) => ({ bit: b, levels: b ? [-1, 1] : [1, -1], mark: null }));
    case 'diff-manchester': {
      let prev = opts.initialLevel ?? -1; // level at the end of the (imaginary) previous bit
      return bits.map((b) => {
        const first = b === 0 ? -prev : prev;
        prev = -first;
        return { bit: b, levels: [first, -first], mark: null };
      });
    }
    case 'ami': {
      let last = opts.lastPulse ?? -1; // so the first 1 is positive (Fig 4.9)
      return bits.map((b) => { if (!b) return flat(b, 0); last = -last; return flat(b, last); });
    }
    case 'pseudoternary': {
      let last = opts.lastPulse ?? -1;
      return bits.map((b) => { if (b) return flat(b, 0); last = -last; return flat(b, last); });
    }
    case 'b8zs': return b8zs(bits, opts.lastPulse ?? -1);
    case 'hdb3': return hdb3(bits, opts.lastPulse ?? -1, opts.pulsesSinceSub ?? 0);
    default: throw new RangeError(`Unknown scheme: ${scheme}`);
  }
}

function b8zs(bits, lastPulse) {
  const out = [];
  let last = lastPulse;
  for (let i = 0; i < bits.length;) {
    const run = bits.slice(i, i + 8);
    if (run.length === 8 && run.every((b) => b === 0)) {
      const p = last;
      // 0 0 0 V B 0 V B
      const pattern = [[0, null], [0, null], [0, null], [p, 'V'], [-p, 'B'], [0, null], [-p, 'V'], [p, 'B']];
      pattern.forEach(([v, m]) => out.push(flat(0, v, m)));
      last = p;
      i += 8;
      continue;
    }
    const b = bits[i];
    if (b) { last = -last; out.push(flat(1, last)); } else out.push(flat(0, 0));
    i += 1;
  }
  return out;
}

function hdb3(bits, lastPulse, pulsesSinceSub) {
  const out = [];
  let last = lastPulse;
  let count = pulsesSinceSub;
  for (let i = 0; i < bits.length;) {
    const run = bits.slice(i, i + 4);
    if (run.length === 4 && run.every((b) => b === 0)) {
      if (count % 2 === 1) {
        // 000V — V repeats the polarity of the last pulse
        out.push(flat(0, 0), flat(0, 0), flat(0, 0), flat(0, last, 'V'));
      } else {
        // B00V — B follows AMI (opposite of last), V repeats B
        const bp = -last;
        out.push(flat(0, bp, 'B'), flat(0, 0), flat(0, 0), flat(0, bp, 'V'));
        last = bp;
      }
      count = 0;
      i += 4;
      continue;
    }
    const b = bits[i];
    if (b) { last = -last; out.push(flat(1, last)); count += 1; } else out.push(flat(0, 0));
    i += 1;
  }
  return out;
}

// Decoders (used by tests to prove encode/decode consistency)
export function decode(encoded, scheme, opts = {}) {
  switch (scheme) {
    case 'nrz-l': { const one = opts.onePositive ? 1 : -1; return encoded.map((e) => (e.levels[0] === one ? 1 : 0)); }
    case 'nrz-i': { let prev = opts.initialLevel ?? 1; return encoded.map((e) => { const b = e.levels[0] !== prev ? 1 : 0; prev = e.levels[0]; return b; }); }
    case 'rz': return encoded.map((e) => (e.levels[0] > 0 ? 1 : 0));
    case 'manchester': return encoded.map((e) => (e.levels[0] < e.levels[1] ? 1 : 0));
    case 'diff-manchester': { let prev = opts.initialLevel ?? -1; return encoded.map((e) => { const b = e.levels[0] !== prev ? 0 : 1; prev = e.levels[1]; return b; }); }
    case 'ami': return encoded.map((e) => (e.levels[0] !== 0 ? 1 : 0));
    case 'pseudoternary': return encoded.map((e) => (e.levels[0] === 0 ? 1 : 0));
    case 'b8zs': case 'hdb3': {
      // Substituted positions carry marks; everything marked decodes to 0.
      return encoded.map((e) => (e.mark ? 0 : e.levels[0] !== 0 ? 1 : 0));
    }
    default: throw new RangeError(`Unknown scheme: ${scheme}`);
  }
}

// Symbol notation used in exam answers: "+", "−"/"-", "0"
export const sym = (v) => (v > 0 ? '+' : v < 0 ? '−' : '0');
export function toNotation(encoded, halves = false) {
  return encoded.map((e) => (halves ? `${sym(e.levels[0])}${sym(e.levels[1])}` : sym(e.levels[0]))).join(' ');
}

// Parse a student's level answer. Accepts "+ - 0", "+-0", "+0 -0", "P N Z", unicode minus.
export function parseNotation(text, halves = false) {
  const clean = String(text ?? '').toUpperCase()
    .replace(/[−–—]/g, '-').replace(/P/g, '+').replace(/N/g, '-').replace(/Z/g, '0')
    .replace(/[^+\-0]/g, '');
  const vals = clean.split('').map((c) => (c === '+' ? 1 : c === '-' ? -1 : 0));
  if (!halves) return vals.map((v) => [v, v]);
  const out = [];
  for (let i = 0; i < vals.length; i += 2) out.push([vals[i], vals[i + 1] ?? null]);
  return out;
}

// Compare a student's notation with the expected encoding; returns per-bit correctness.
export function gradeNotation(studentText, expected, halves = false) {
  const got = parseNotation(studentText, halves);
  const perBit = expected.map((e, i) => {
    const g = got[i];
    if (!g) return false;
    return halves ? g[0] === e.levels[0] && g[1] === e.levels[1] : g[0] === e.levels[0];
  });
  const correct = perBit.filter(Boolean).length;
  return { perBit, correct, total: expected.length, extra: Math.max(0, got.length - expected.length) };
}
