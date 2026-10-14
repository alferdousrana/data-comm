import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../js/numerics/formulas.js';
import { generate, TOPICS, checkPart } from '../js/numerics/generators.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('Midterm Q1b: Nyquist, B = 3000 Hz, 2 bits per level → 12 000 bps', () => {
  assert.equal(F.nyquistBitRate(3000, 4), 12000);
});
test('Slide examples 3.34 / 3.35 / 3.36', () => {
  assert.equal(F.nyquistBitRate(3000, 2), 6000);
  assert.equal(F.nyquistBitRate(3000, 4), 12000);
  close(F.nyquistLevels(265000, 20000), 2 ** 6.625);
});
test('Midterm Q2b: transmission time', () => {
  assert.equal(F.transmissionTime(150, 1000), 0.15);
  assert.equal(F.transmissionTime(8, 1000), 0.008);
  assert.equal(F.transmissionTime(F.charactersToBits(200000, 8), 1000), 1600);
});
test('Midterm Q2c: min SNR for 100 kbps over 4 kHz', () => {
  const snr = F.minSnrForRate(4000, 100000);
  assert.equal(snr, 2 ** 25 - 1);
  assert.equal(snr, 33554431);
  close(F.toDb(snr), 75.257, 1e-4);
});
test('Midterm Q2a: composite bandwidth 0–16 Hz', () => {
  assert.deepEqual(F.compositeBandwidth([0, 4, 8, 12, 16]), { fh: 16, fl: 0, bandwidth: 16 });
});
test('Shannon slide examples', () => {
  close(F.shannonCapacity(3400, 1000), 33888.6, 1e-4); // slide shows ≈33898 using rounded log2(1001)=9.97
  close(F.shannonCapacity(3000, 3162), 34860, 1e-3);
  close(F.shannonCapacity(2e6, F.fromDb(36)), 23.92e6, 1e-3);
  assert.equal(F.shannonCapacity(1e6, 63), 6e6);
  assert.equal(F.shannonCapacity(100e6, 63), 600e6);
  assert.equal(F.shannonCapacity(5000, 0), 0);
});
test('Decibels: half power ≈ −3 dB; dBm −30 → 0.001 mW', () => {
  close(F.attenuationDb(1, 0.5), -3.0103, 1e-4);
  close(F.dbmToMilliwatts(-30), 0.001);
  close(F.toDb(10e-3 / 1e-6), 40); // Example 3.31
});
test('Period / frequency / phase / wavelength', () => {
  close(F.periodFromFrequency(60), 0.0166667, 1e-5);
  close(F.frequencyFromPeriod(0.1), 10);
  assert.deepEqual(F.phaseFromCycleFraction(1 / 6).degrees, 60);
  close(F.wavelength(3e8, 1e6), 300);
});
test('Bit/baud rate and modulation bandwidths', () => {
  assert.equal(F.bitRateFromBaud(1000, 4), 4000); // Example 5.1
  assert.equal(F.baudRate(8000, 3), 8000 / 3);
  assert.equal(F.askBandwidth(50000, 1), 100000); // Example 5.3 → N = 50 kbps
  assert.equal(F.mfskBandwidth(8, 1e6), 8e6); // Example 5.6
  assert.equal(F.lineCodingBaud(100000, 1, 0.5), 50000); // Example 4.1
});
test('PCM and quantization', () => {
  assert.equal(F.pcmBitRate(4000, 8), 64000);
  close(F.quantizationSnrDb(3), 19.82);
});
test('Mesh, FDM, TDM examples', () => {
  assert.equal(F.meshLinks(5), 10);
  assert.equal(F.fdmBandwidth(5, 100e3, 10e3), 540e3); // Example 6.2
  const t = F.synchronousTdm(4, 1000, 1); // Example 6.7
  assert.equal(t.linkRate, 4000);
  close(t.outputSlotDuration, 250e-6);
  close(t.frameDuration, 1e-3);
  const t2 = F.synchronousTdm(4, 2000, 8, 1); // Example 6.10: 250 chars/s × 8 bits
  assert.equal(t2.frameBits, 33);
  assert.equal(t2.frameRate, 250);
  assert.equal(t2.linkRate, 8250);
});
test('Invalid inputs throw RangeError', () => {
  assert.throws(() => F.nyquistBitRate(0, 2), RangeError);
  assert.throws(() => F.nyquistBitRate(3000, 1), RangeError);
  assert.throws(() => F.toDb(0), RangeError);
  assert.throws(() => F.transmissionTime(10, 0), RangeError);
  assert.throws(() => F.meshLinks(1), RangeError);
  assert.throws(() => F.askBandwidth(100, 2), RangeError);
  assert.throws(() => F.compositeBandwidth([]), RangeError);
});
test('Number parsing and unit-aware matching', () => {
  assert.equal(F.parseNumber('33,554,431'), 33554431);
  close(F.parseNumber('3.36×10^7'), 3.36e7);
  close(F.parseNumber('3.36e7'), 3.36e7);
  assert.equal(F.parseNumber('1/3'), 1 / 3);
  assert.ok(F.matchQuantity('Max bit rate = 12 kbps', 12000, { dim: 'rate' }).ok);
  assert.ok(F.matchQuantity('= 12000 bps', 12000, { dim: 'rate' }).unitOk);
  const noUnit = F.matchQuantity('answer 12000', 12000, { dim: 'rate' });
  assert.ok(noUnit.ok && !noUnit.unitOk);
  assert.ok(F.matchQuantity('t = 150 ms', 0.15, { dim: 'time' }).ok);
  assert.ok(!F.matchQuantity('t = 150 s', 0.15, { dim: 'time' }).ok, 'seconds vs milliseconds must differ');
  assert.ok(F.matchQuantity('B = 4 kHz', 4000, { dim: 'freq' }).ok);
  assert.ok(!F.matchQuantity('B = 4 kbps', 4000, { dim: 'freq' }).ok, 'Hz and bps are different dimensions');
  assert.ok(F.matchQuantity('SNR_dB ≈ 75.26 dB', 75.257, { dim: 'db', relTol: 0.005 }).ok);
  assert.ok(F.matchQuantity('1 byte', 8, { dim: 'data' }).ok, 'bytes convert to bits');
});
test('Every generator produces self-consistent, checkable problems', () => {
  for (const topic of Object.keys(TOPICS)) {
    for (let seed = 1; seed <= 25; seed += 1) {
      const p = generate(topic, seed * 7919);
      assert.ok(p.prompt && p.parts.length && p.steps.length, topic);
      for (const part of p.parts) {
        assert.ok(Number.isFinite(part.expected), `${topic} expected finite`);
        const typed = `${part.expected}${part.unit ? ` ${part.unit}` : ''}`;
        assert.ok(checkPart(part, typed).correct, `${topic} seed ${seed}: “${typed}” should be accepted`);
        assert.ok(!checkPart(part, `${part.expected * 3 + 7}`).correct, `${topic}: wrong value rejected`);
      }
    }
  }
});
test('Generators are deterministic for a seed', () => {
  assert.deepEqual(generate('nyquist', 42), generate('nyquist', 42));
});
test('Superscript powers of ten are understood', () => {
  assert.ok(F.matchQuantity('SNR ≈ 3.36 × 10⁷', 33554431, { relTol: 0.005 }).ok);
});
