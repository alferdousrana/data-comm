// Practice-problem generators for formulas taught in the slides.
// Each problem: { id, topic, prompt, promptBn, parts:[{label, expected, dim, unit, display}], steps:[...], source }
// Values are random but deterministic for a given seed, so a problem can be re-opened.
import * as F from './formulas.js';

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const fmt = (v, dp = 4) => Number(F.round(v, dp)).toLocaleString('en-US', { maximumFractionDigits: dp });

export const TOPICS = {
  nyquist: { title: 'Nyquist bit rate (noiseless channel)', titleBn: 'নাইকুইস্ট বিট রেট', lessonId: 'ch3-data-rate-limits', source: 'Forouzan Ch3, slides 80–83' },
  'nyquist-levels': { title: 'Nyquist: levels needed', titleBn: 'প্রয়োজনীয় সিগন্যাল লেভেল', lessonId: 'ch3-data-rate-limits', source: 'Forouzan Ch3, slide 83 (Example 3.36)' },
  shannon: { title: 'Shannon capacity', titleBn: 'শ্যানন ক্যাপাসিটি', lessonId: 'ch3-data-rate-limits', source: 'Forouzan Ch3, slides 84–87' },
  'shannon-min-snr': { title: 'Minimum SNR and SNR(dB)', titleBn: 'ন্যূনতম SNR ও ডেসিবেল', lessonId: 'ch3-data-rate-limits', source: 'Forouzan Ch3, slides 72, 84 (midterm Q2c pattern)' },
  'transmission-time': { title: 'Transmission time', titleBn: 'ট্রান্সমিশন সময়', lessonId: 'ch3-digital-signals', source: 'Forouzan Ch3 bit-rate section (midterm Q2b pattern)' },
  bandwidth: { title: 'Bandwidth of a composite signal', titleBn: 'কম্পোজিট সিগন্যালের ব্যান্ডউইডথ', lessonId: 'ch3-composite-bandwidth', source: 'Forouzan Ch3, slides 33–38' },
  period: { title: 'Frequency and period', titleBn: 'ফ্রিকোয়েন্সি ও পিরিয়ড', lessonId: 'ch3-composite-bandwidth', source: 'Forouzan Ch3, slides 13–18' },
  'bit-baud': { title: 'Bit rate and baud rate', titleBn: 'বিট রেট ও বড রেট', lessonId: 'ch5-bit-baud', source: 'Forouzan Ch5, slides 6–8' },
  snrdb: { title: 'SNR and SNR in dB', titleBn: 'SNR ও SNR(dB)', lessonId: 'ch3-data-rate-limits', source: 'Forouzan Ch3, slides 71–74' },
  mesh: { title: 'Mesh topology links', titleBn: 'মেশ টপোলজির লিংক', lessonId: 'ch1-topology', source: 'Forouzan Ch1, slide 10' },
  fdm: { title: 'FDM bandwidth with guard bands', titleBn: 'গার্ড ব্যান্ডসহ FDM', lessonId: null, source: 'Forouzan Ch6 (Multiplexing), slide 15 — supplementary until the Multiplexing lesson batch is published' },
  tdm: { title: 'Synchronous TDM', titleBn: 'সিনক্রোনাস TDM', lessonId: null, source: 'Forouzan Ch6 (Multiplexing), slides 28–34 — supplementary until the Multiplexing lesson batch is published' },
};

const G = {
  nyquist(r) {
    const B = pick(r, [2000, 3000, 4000, 5000, 8000, 10000, 20000]);
    const bits = pick(r, [1, 2, 3, 4]);
    const L = 2 ** bits;
    const N = F.nyquistBitRate(B, L);
    return {
      prompt: `A noiseless channel with a bandwidth of ${B} Hz transmits a signal that sends ${bits} bit${bits > 1 ? 's' : ''} for each level. Calculate the maximum bit rate.`,
      promptBn: `${B} Hz ব্যান্ডউইডথের নয়েজমুক্ত চ্যানেল; প্রতি লেভেলে ${bits} বিট। সর্বোচ্চ বিট রেট বের করো।`,
      parts: [{ label: 'Maximum bit rate', expected: N, dim: 'rate', unit: 'bps', display: `${fmt(N)} bps` }],
      steps: [
        `Given: B = ${B} Hz, bits per level = ${bits} ⇒ L = 2^${bits} = ${L}`,
        'Formula (Nyquist): N_max = 2 × B × log₂ L',
        `Substitution: N_max = 2 × ${B} × log₂ ${L} = 2 × ${B} × ${bits}`,
        `Answer: N_max = ${fmt(N)} bps = ${F.formatSI(N, 'bps')}`,
      ],
      noteBn: '“প্রতি লেভেলে ২ বিট” মানে L = 2² = 4 — L = 2 ধরে নেওয়া সবচেয়ে সাধারণ ভুল।',
    };
  },
  'nyquist-levels'(r) {
    const B = pick(r, [10000, 20000, 25000, 50000]);
    const bits = pick(r, [2, 3, 4, 5, 6]);
    const N = 2 * B * bits;
    return {
      prompt: `We need to send ${fmt(N)} bps over a noiseless channel with a bandwidth of ${B} Hz. How many signal levels are needed?`,
      promptBn: `${B} Hz নয়েজমুক্ত চ্যানেলে ${fmt(N)} bps পাঠাতে কত লেভেল লাগবে?`,
      parts: [{ label: 'Signal levels L', expected: 2 ** bits, dim: null, display: `${2 ** bits}` }],
      steps: [
        `Given: N = ${fmt(N)} bps, B = ${B} Hz`,
        'Formula: N = 2 × B × log₂ L ⇒ log₂ L = N / (2B)',
        `log₂ L = ${fmt(N)} / (2 × ${B}) = ${bits}`,
        `Answer: L = 2^${bits} = ${2 ** bits} levels`,
      ],
    };
  },
  shannon(r) {
    const B = pick(r, [3000, 3400, 4000, 1e6, 2e6]);
    const snrDb = pick(r, [20, 30, 36, 40]);
    const snr = F.fromDb(snrDb);
    const C = F.shannonCapacity(B, snr);
    return {
      prompt: `A channel has a bandwidth of ${F.formatSI(B, 'Hz')} and SNR(dB) = ${snrDb} dB. Find the theoretical channel capacity.`,
      promptBn: `ব্যান্ডউইডথ ${F.formatSI(B, 'Hz')}, SNR(dB) = ${snrDb} dB। শ্যানন ক্যাপাসিটি বের করো।`,
      parts: [{ label: 'Capacity C', expected: C, dim: 'rate', unit: 'bps', display: F.formatSI(C, 'bps') }],
      steps: [
        `Given: B = ${F.formatSI(B, 'Hz')}, SNR(dB) = ${snrDb}`,
        `Convert dB to ratio: SNR = 10^(SNR_dB/10) = 10^${snrDb / 10} = ${fmt(snr)}`,
        'Formula (Shannon): C = B × log₂(1 + SNR)',
        `C = ${B} × log₂(1 + ${fmt(snr)}) = ${B} × ${fmt(F.log2(1 + snr))}`,
        `Answer: C ≈ ${F.formatSI(C, 'bps')}`,
      ],
      noteBn: 'Shannon সূত্রে dB মান সরাসরি বসাবে না — আগে সাধারণ অনুপাতে রূপান্তর করো।',
    };
  },
  'shannon-min-snr'(r) {
    const B = pick(r, [2000, 3000, 4000, 5000, 10000]);
    const ratio = pick(r, [4, 5, 6, 8, 10, 12, 25]);
    const C = B * ratio;
    const snr = F.minSnrForRate(B, C);
    const db = F.toDb(snr);
    return {
      prompt: `A channel has a bandwidth of ${F.formatSI(B, 'Hz')}. The system must support a data rate of ${F.formatSI(C, 'bps')}. Determine the minimum SNR and the corresponding SNR in decibels (SNR_dB).`,
      promptBn: `ব্যান্ডউইডথ ${F.formatSI(B, 'Hz')}, প্রয়োজনীয় ডেটা রেট ${F.formatSI(C, 'bps')}। ন্যূনতম SNR ও SNR(dB) বের করো।`,
      parts: [
        { label: 'Minimum SNR', expected: snr, dim: null, display: fmt(snr, 2), relTol: 0.005 },
        { label: 'SNR_dB', expected: db, dim: 'db', unit: 'dB', display: `${fmt(db, 2)} dB`, relTol: 0.005 },
      ],
      steps: [
        `Given: B = ${B} Hz, C = ${C} bps`,
        'Shannon: C = B log₂(1 + SNR) ⇒ SNR = 2^(C/B) − 1',
        `C/B = ${C}/${B} = ${ratio}`,
        `SNR = 2^${ratio} − 1 = ${fmt(snr, 2)}`,
        `SNR_dB = 10 log₁₀(${fmt(snr, 2)}) = ${fmt(db, 2)} dB`,
      ],
      noteBn: 'C/B আগে বের করো — kHz আর kbps এর k একে অপরকে কেটে দেয়, কিন্তু একক মিলিয়ে নিতে ভুলো না।',
    };
  },
  'transmission-time'(r) {
    const R = pick(r, [1000, 2000, 4800, 9600, 56000]);
    const chars = pick(r, [1000, 5000, 20000, 200000]);
    const bpc = pick(r, [7, 8]);
    const bits = F.charactersToBits(chars, bpc);
    const t = F.transmissionTime(bits, R);
    return {
      prompt: `A device transmits at ${R} bps. Each character is represented using ${bpc} bits. Calculate the time required to transmit a file containing ${fmt(chars)} characters.`,
      promptBn: `ডেটা রেট ${R} bps, প্রতি ক্যারেক্টার ${bpc} বিট। ${fmt(chars)} ক্যারেক্টারের ফাইল পাঠাতে কত সময় লাগবে?`,
      parts: [{ label: 'Transmission time', expected: t, dim: 'time', unit: 's', display: `${fmt(t)} s` }],
      steps: [
        `Total bits = ${fmt(chars)} × ${bpc} = ${fmt(bits)} bits`,
        'Time = total bits / data rate',
        `Time = ${fmt(bits)} / ${R} = ${fmt(t)} s`,
      ],
    };
  },
  bandwidth(r) {
    const step = pick(r, [2, 4, 5, 10, 100]);
    const start = pick(r, [0, 0, step, 2 * step, 10 * step]);
    const n = pick(r, [3, 4, 5]);
    const freqs = Array.from({ length: n }, (_, i) => start + i * step);
    const bw = F.compositeBandwidth(freqs).bandwidth;
    return {
      prompt: `A composite signal contains sine-wave components at ${freqs.join(', ')} Hz. What is its bandwidth?`,
      promptBn: `${freqs.join(', ')} Hz ফ্রিকোয়েন্সির কম্পোনেন্ট নিয়ে কম্পোজিট সিগন্যাল। ব্যান্ডউইডথ কত?`,
      parts: [{ label: 'Bandwidth', expected: bw, dim: 'freq', unit: 'Hz', display: `${bw} Hz` }],
      steps: [`f_h = ${Math.max(...freqs)} Hz, f_l = ${Math.min(...freqs)} Hz`, 'B = f_h − f_l', `B = ${Math.max(...freqs)} − ${Math.min(...freqs)} = ${bw} Hz`],
      noteBn: 'ব্যান্ডউইডথ amplitude এর উপর নির্ভর করে না — শুধু সর্বোচ্চ ও সর্বনিম্ন ফ্রিকোয়েন্সি।',
    };
  },
  period(r) {
    const ms = pick(r, [1, 2, 5, 10, 100, 250]);
    const f = 1 / (ms / 1000);
    return {
      prompt: `The period of a signal is ${ms} ms. What is its frequency (in Hz and kHz)?`,
      promptBn: `একটি সিগন্যালের পিরিয়ড ${ms} ms। ফ্রিকোয়েন্সি কত?`,
      parts: [{ label: 'Frequency', expected: f, dim: 'freq', unit: 'Hz', display: `${fmt(f)} Hz = ${fmt(f / 1000)} kHz` }],
      steps: [`T = ${ms} ms = ${ms} × 10⁻³ s`, 'f = 1/T', `f = 1/${ms / 1000} = ${fmt(f)} Hz = ${fmt(f / 1000)} kHz`],
    };
  },
  'bit-baud'(r) {
    const r_ = pick(r, [1, 2, 3, 4]);
    const S = pick(r, [1000, 2000, 2400, 4800]);
    const N = S * r_;
    return {
      prompt: `An analog signal carries ${r_} bit${r_ > 1 ? 's' : ''} per signal element. If ${S} signal elements are sent per second, find the bit rate. How many signal levels (L) are used?`,
      promptBn: `প্রতি সিগন্যাল এলিমেন্টে ${r_} বিট, প্রতি সেকেন্ডে ${S}টি এলিমেন্ট। বিট রেট ও L বের করো।`,
      parts: [
        { label: 'Bit rate N', expected: N, dim: 'rate', unit: 'bps', display: `${N} bps` },
        { label: 'Levels L', expected: 2 ** r_, dim: null, display: `${2 ** r_}` },
      ],
      steps: [`S = N × (1/r) ⇒ N = S × r`, `N = ${S} × ${r_} = ${N} bps`, `r = log₂ L ⇒ L = 2^${r_} = ${2 ** r_}`],
    };
  },
  snrdb(r) {
    const S = pick(r, [10, 100, 1000]);
    const Nw = pick(r, [0.001, 0.01, 0.02, 1e-6]);
    const snr = S / Nw;
    return {
      prompt: `Signal power is ${S} mW and noise power is ${Nw} mW. Find SNR and SNR_dB.`,
      promptBn: `সিগন্যাল পাওয়ার ${S} mW, নয়েজ পাওয়ার ${Nw} mW। SNR ও SNR(dB) বের করো।`,
      parts: [
        { label: 'SNR', expected: snr, dim: null, display: fmt(snr) },
        { label: 'SNR_dB', expected: F.toDb(snr), dim: 'db', unit: 'dB', display: `${fmt(F.toDb(snr), 2)} dB`, relTol: 0.005 },
      ],
      steps: [`SNR = S/N = ${S}/${Nw} = ${fmt(snr)}`, `SNR_dB = 10 log₁₀ SNR = ${fmt(F.toDb(snr), 2)} dB`],
    };
  },
  mesh(r) {
    const n = pick(r, [4, 5, 6, 8, 10, 12]);
    return {
      prompt: `How many duplex-mode links are needed to connect ${n} devices in a fully connected mesh? How many I/O ports does each device need?`,
      promptBn: `${n}টি ডিভাইস ফুল মেশে যুক্ত করতে কয়টি ডুপ্লেক্স লিংক লাগবে?`,
      parts: [
        { label: 'Links', expected: F.meshLinks(n), dim: null, display: `${F.meshLinks(n)}` },
        { label: 'Ports per device', expected: n - 1, dim: null, display: `${n - 1}` },
      ],
      steps: ['Links = n(n − 1)/2', `= ${n} × ${n - 1} / 2 = ${F.meshLinks(n)}`, `Ports per device = n − 1 = ${n - 1}`],
    };
  },
  fdm(r) {
    const n = pick(r, [3, 4, 5, 6]);
    const bw = pick(r, [4, 10, 100]);
    const g = pick(r, [1, 2, 10]);
    const total = F.fdmBandwidth(n, bw * 1000, g * 1000);
    return {
      prompt: `${n} channels, each with a ${bw}-kHz bandwidth, are multiplexed with FDM. A guard band of ${g} kHz is needed between channels. What is the minimum link bandwidth?`,
      promptBn: `${n}টি চ্যানেল, প্রতিটি ${bw} kHz, মাঝে ${g} kHz গার্ড ব্যান্ড। ন্যূনতম লিংক ব্যান্ডউইডথ?`,
      parts: [{ label: 'Link bandwidth', expected: total, dim: 'freq', unit: 'Hz', display: F.formatSI(total, 'Hz') }],
      steps: [`n channels need n − 1 = ${n - 1} guard bands`, `B = ${n} × ${bw} + ${n - 1} × ${g} = ${total / 1000} kHz`],
    };
  },
  tdm(r) {
    const n = pick(r, [3, 4, 5]);
    const rate = pick(r, [1000, 100000, 1e6]);
    const t = F.synchronousTdm(n, rate, 1);
    return {
      prompt: `${n} connections of ${F.formatSI(rate, 'bps')} each are multiplexed with synchronous TDM, 1 bit per slot. Find the link bit rate and the frame duration.`,
      promptBn: `${n}টি সংযোগ, প্রতিটি ${F.formatSI(rate, 'bps')}, প্রতি স্লটে ১ বিট। লিংক রেট ও ফ্রেম সময় বের করো।`,
      parts: [
        { label: 'Link rate', expected: t.linkRate, dim: 'rate', unit: 'bps', display: F.formatSI(t.linkRate, 'bps') },
        { label: 'Frame duration', expected: t.frameDuration, dim: 'time', unit: 's', display: F.formatSI(t.frameDuration, 's') },
      ],
      steps: [`Link rate = n × input rate = ${n} × ${rate} = ${t.linkRate} bps`, `Frame duration = duration of one input bit = 1/${rate} s = ${F.formatSI(t.frameDuration, 's')}`],
    };
  },
};

export function generate(topic, seed = Date.now()) {
  const gen = G[topic];
  if (!gen) throw new RangeError(`Unknown topic ${topic}`);
  const p = gen(rng(seed));
  return { id: `${topic}-${seed}`, topic, seed, source: TOPICS[topic].source, ...p };
}

export function checkPart(part, input) {
  const m = F.matchQuantity(String(input ?? ''), part.expected, { dim: part.dim || null, relTol: part.relTol ?? 0.01, displayUnits: part.unit ? [part.unit, `k${part.unit}`, `m${part.unit}`] : [] });
  return { correct: m.ok, unitOk: m.unitOk };
}
