// Numerical helpers for formulas taught in the CSE 311 slides.
// Every function validates input and throws RangeError on invalid values.
// Pure module: no DOM access, so it runs in Node tests and in the browser.

const assertPos = (name, v) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new RangeError(`${name} must be a positive number`);
};
const assertNonNeg = (name, v) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new RangeError(`${name} must be zero or positive`);
};

export const log2 = (x) => Math.log(x) / Math.LN2;

// Ch 3 (Forouzan) — period/frequency, slide 13–18
export function frequencyFromPeriod(T) { assertPos('Period', T); return 1 / T; }
export function periodFromFrequency(f) { assertPos('Frequency', f); return 1 / f; }
// Ch 3 slide 25 — wavelength = propagation speed / frequency
export function wavelength(speed, f) { assertPos('Propagation speed', speed); assertPos('Frequency', f); return speed / f; }
// Ch 3 slide 23 — phase from fraction of a cycle
export function phaseFromCycleFraction(frac) { assertNonNeg('Cycle fraction', frac); return { degrees: 360 * frac, radians: 2 * Math.PI * frac }; }

// Ch 3 slide 33 — bandwidth = fh − fl
export function compositeBandwidth(freqs) {
  if (!Array.isArray(freqs) || freqs.length < 1) throw new RangeError('Provide at least one frequency');
  freqs.forEach((f) => assertNonNeg('Frequency', f));
  const fh = Math.max(...freqs), fl = Math.min(...freqs);
  return { fh, fl, bandwidth: fh - fl };
}

// Ch 3 slide 43 — bits per level = log2 L
export function bitsPerLevel(L) { assertPos('Levels', L); if (L < 2) throw new RangeError('A signal needs at least 2 levels'); return log2(L); }

// Transmission time = bits / data rate (Ch 3 bit-rate examples; midterm Q2b)
export function transmissionTime(bits, rateBps) { assertNonNeg('Number of bits', bits); assertPos('Data rate', rateBps); return bits / rateBps; }
export function charactersToBits(chars, bitsPerChar = 8) { assertNonNeg('Characters', chars); assertPos('Bits per character', bitsPerChar); return chars * bitsPerChar; }

// Ch 3 slide 80 — Nyquist: N = 2 × B × log2 L
export function nyquistBitRate(B, L) { assertPos('Bandwidth', B); bitsPerLevel(L); return 2 * B * log2(L); }
// Ch 3 slide 83 — levels needed: L = 2^(N / 2B)
export function nyquistLevels(N, B) { assertPos('Bit rate', N); assertPos('Bandwidth', B); return 2 ** (N / (2 * B)); }

// Ch 3 slide 84 — Shannon: C = B log2(1 + SNR)
export function shannonCapacity(B, snr) { assertPos('Bandwidth', B); assertNonNeg('SNR', snr); return B * log2(1 + snr); }
// Rearranged Shannon (midterm Q2c): SNR_min = 2^(C/B) − 1
export function minSnrForRate(B, C) { assertPos('Bandwidth', B); assertPos('Data rate', C); return 2 ** (C / B) - 1; }

// Ch 3 slides 63, 72 — decibels
export function toDb(ratio) { assertPos('Ratio', ratio); return 10 * Math.log10(ratio); }
export function fromDb(db) { if (!Number.isFinite(db)) throw new RangeError('dB value must be a number'); return 10 ** (db / 10); }
export function attenuationDb(p1, p2) { assertPos('P1', p1); assertPos('P2', p2); return 10 * Math.log10(p2 / p1); }
export function dbmToMilliwatts(dbm) { return fromDb(dbm); }

// Ch 3 slides 55–57 — baseband bandwidth from bit rate (first harmonic)
export function basebandMinBandwidth(N) { assertPos('Bit rate', N); return N / 2; }

// Ch 4 slide 6 — S_ave = c × N × (1/r)
export function lineCodingBaud(N, r, c = 0.5) { assertPos('Bit rate', N); assertPos('r', r); assertNonNeg('c', c); return (c * N) / r; }
// Ch 4 slides 43–47, 54–60 — PCM
export function nyquistSamplingRate(fmax) { assertPos('Highest frequency', fmax); return 2 * fmax; }
export function pcmBitRate(fmax, bitsPerSample) { assertPos('Bits per sample', bitsPerSample); return nyquistSamplingRate(fmax) * bitsPerSample; }
export function quantizationSnrDb(nb) { assertPos('Bits per sample', nb); return 6.02 * nb + 1.76; }

// Ch 5 slide 6 — S = N / r ; r = log2 L
export function baudRate(N, r) { assertPos('Bit rate', N); assertPos('r', r); return N / r; }
export function bitRateFromBaud(S, r) { assertPos('Baud rate', S); assertPos('r', r); return S * r; }
// Ch 5 slides 10, 18, 24
export function askBandwidth(S, d) { assertPos('Baud rate', S); if (d < 0 || d > 1) throw new RangeError('d must be between 0 and 1'); return (1 + d) * S; }
export function bfskBandwidth(S, d, twoDeltaF) { assertNonNeg('2Δf', twoDeltaF); return askBandwidth(S, d) + twoDeltaF; }
export function mfskBandwidth(L, S) { assertPos('L', L); assertPos('Baud rate', S); return L * S; }

// Ch 1 slide 10 — mesh: n(n − 1)/2 duplex links
export function meshLinks(n) { if (!Number.isInteger(n) || n < 2) throw new RangeError('Need at least 2 devices'); return (n * (n - 1)) / 2; }
export function meshPortsPerDevice(n) { meshLinks(n); return n - 1; }

// Ch 6 (Forouzan) slide 15 — FDM link bandwidth with guard bands
export function fdmBandwidth(channels, channelBw, guard = 0) {
  if (!Number.isInteger(channels) || channels < 1) throw new RangeError('Channels must be a positive integer');
  assertPos('Channel bandwidth', channelBw); assertNonNeg('Guard band', guard);
  return channels * channelBw + (channels - 1) * guard;
}
// Ch 6 slides 27–34 — synchronous TDM, unit of n bits per slot
export function synchronousTdm(inputs, inputRateBps, bitsPerSlot = 1, syncBitsPerFrame = 0) {
  if (!Number.isInteger(inputs) || inputs < 1) throw new RangeError('Inputs must be a positive integer');
  assertPos('Input rate', inputRateBps); assertPos('Bits per slot', bitsPerSlot); assertNonNeg('Sync bits', syncBitsPerFrame);
  const frameRate = inputRateBps / bitsPerSlot;
  const frameBits = inputs * bitsPerSlot + syncBitsPerFrame;
  const linkRate = frameRate * frameBits;
  return {
    inputBitDuration: 1 / inputRateBps,
    inputSlotDuration: bitsPerSlot / inputRateBps,
    frameRate, frameBits, frameDuration: 1 / frameRate, linkRate,
    outputBitDuration: 1 / linkRate,
    outputSlotDuration: bitsPerSlot / linkRate,
  };
}

// ---------- Units ----------
// Each unit maps to { dim, factor } relative to a base unit.
export const UNITS = {
  bps: { dim: 'rate', f: 1 }, kbps: { dim: 'rate', f: 1e3 }, mbps: { dim: 'rate', f: 1e6 }, gbps: { dim: 'rate', f: 1e9 },
  'bit/s': { dim: 'rate', f: 1 }, 'b/s': { dim: 'rate', f: 1 },
  hz: { dim: 'freq', f: 1 }, khz: { dim: 'freq', f: 1e3 }, mhz: { dim: 'freq', f: 1e6 }, ghz: { dim: 'freq', f: 1e9 },
  s: { dim: 'time', f: 1 }, sec: { dim: 'time', f: 1 }, second: { dim: 'time', f: 1 }, seconds: { dim: 'time', f: 1 },
  ms: { dim: 'time', f: 1e-3 }, us: { dim: 'time', f: 1e-6 }, 'µs': { dim: 'time', f: 1e-6 }, 'μs': { dim: 'time', f: 1e-6 }, ns: { dim: 'time', f: 1e-9 },
  min: { dim: 'time', f: 60 }, minutes: { dim: 'time', f: 60 },
  bit: { dim: 'data', f: 1 }, bits: { dim: 'data', f: 1 }, byte: { dim: 'data', f: 8 }, bytes: { dim: 'data', f: 8 },
  kb: { dim: 'data', f: 1e3 }, // kilobit (course convention: lowercase b = bit)
  db: { dim: 'db', f: 1 }, w: { dim: 'power', f: 1 }, mw: { dim: 'power', f: 1e-3 },
  baud: { dim: 'baud', f: 1 }, kbaud: { dim: 'baud', f: 1e3 }, mbaud: { dim: 'baud', f: 1e6 },
  v: { dim: 'volt', f: 1 }, m: { dim: 'length', f: 1 }, km: { dim: 'length', f: 1e3 },
  rad: { dim: 'angle', f: 1 }, '°': { dim: 'deg', f: 1 }, deg: { dim: 'deg', f: 1 }, degrees: { dim: 'deg', f: 1 },
};

export function unitInfo(u) {
  if (!u) return null;
  return UNITS[String(u).trim().toLowerCase()] || null;
}

export function toBase(value, unit) {
  const info = unitInfo(unit);
  if (!info) throw new RangeError(`Unknown unit: ${unit}`);
  return { value: value * info.f, dim: info.dim };
}

// Parse a number written like 33,554,431 | 3.36e7 | 3.36×10^7 | 3.36 x 10^7 | 1/3
export function parseNumber(str) {
  if (str == null) return NaN;
  let s = String(str).trim().replace(/,(?=\d{3}(\D|$))/g, '').replace(/\s+/g, '');
  const sci = s.match(/^([-+]?\d*\.?\d+)[x×*]10\^?\(?([-+]?\d+)\)?$/i);
  if (sci) return parseFloat(sci[1]) * 10 ** parseInt(sci[2], 10);
  const frac = s.match(/^([-+]?\d*\.?\d+)\/(\d*\.?\d+)$/);
  if (frac) return parseFloat(frac[1]) / parseFloat(frac[2]);
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return parseFloat(s);
  return NaN;
}

// Extract every number (with an optional trailing unit) from free text.
const NUM_RE = /([-+]?\d[\d,]*\.?\d*(?:\s*[x×*]\s*10\s*\^?\s*\(?[-+]?\d+\)?|e[-+]?\d+)?)\s*(kbps|mbps|gbps|bps|bit\/s|b\/s|khz|mhz|ghz|hz|kbaud|mbaud|baud|ms|µs|μs|us|ns|seconds|second|sec|minutes|min|s|bytes|byte|bits|bit|db|mw|w|v|km|m|rad|degrees|deg|°)?(?![a-z])/gi;
export function extractQuantities(text) {
  const out = [];
  if (!text) return out;
  const sup = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
  const norm = String(text).replace(/10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_, e) => `10^${e.split('').map((c) => sup[c]).join('')}`);
  for (const m of norm.matchAll(NUM_RE)) {
    const value = parseNumber(m[1]);
    if (!Number.isFinite(value)) continue;
    const unit = m[2] ? m[2].toLowerCase() : null;
    out.push({ raw: m[0].trim(), value, unit });
  }
  return out;
}

export function approxEqual(a, b, relTol = 0.01, absTol = 1e-9) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= Math.max(absTol, relTol * Math.max(Math.abs(a), Math.abs(b)));
}

// Check a student answer against an expected value expressed in a base unit of `dim`.
// Returns { ok, unitOk, matched } — unitOk is false when the right number appears without a unit.
export function matchQuantity(text, expected, { dim = null, relTol = 0.01, displayUnits = [] } = {}) {
  const qs = extractQuantities(text);
  for (const q of qs) {
    if (q.unit) {
      const info = unitInfo(q.unit);
      if (!info) continue;
      if (dim && info.dim !== dim) continue;
      if (approxEqual(q.value * info.f, expected, relTol)) return { ok: true, unitOk: true, matched: q.raw };
    }
  }
  // Number without unit: accept value in base unit or any listed display unit, but flag the unit.
  for (const q of qs) {
    if (q.unit && dim && unitInfo(q.unit)?.dim === dim) continue;
    if (approxEqual(q.value, expected, relTol)) return { ok: true, unitOk: !dim, matched: q.raw };
    for (const du of displayUnits) {
      const info = unitInfo(du);
      if (info && approxEqual(q.value * info.f, expected, relTol)) return { ok: true, unitOk: false, matched: q.raw };
    }
  }
  return { ok: false, unitOk: false, matched: null };
}

// Human formatting with SI prefixes
export function formatSI(value, baseUnit) {
  if (!Number.isFinite(value)) return String(value);
  const prefixes = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n']];
  const abs = Math.abs(value);
  if (abs === 0) return `0 ${baseUnit}`;
  for (const [f, p] of prefixes) {
    if (abs >= f) return `${round(value / f, 4)} ${p}${baseUnit}`;
  }
  return `${value.toExponential(3)} ${baseUnit}`;
}
export function round(v, dp = 2) { const k = 10 ** dp; return Math.round((v + Number.EPSILON) * k) / k; }
