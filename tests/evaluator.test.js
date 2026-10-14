import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, toNotation, parseBits, gradeNotation, SCHEMES } from '../js/simulators/linecoding.js';
import { evaluate, validateRubric, tokens, findPhrase } from '../js/evaluation/rubric-evaluator.js';
import { newItem, review, buildQueue } from '../js/revision/scheduler.js';
import { newlyEarnedBadges, levelFromXp, streakFromDays, dayKey } from '../js/gamification/rules.js';

// ---------- Line coding (conventions from Forouzan Figs 4.6–4.9, 4.19, 4.20) ----------
test('Figure 4.6 NRZ-L for 01001110', () => {
  assert.equal(toNotation(encode('01001110', 'nrz-l')), '+ − + + − − − +');
});
test('Figure 4.6 NRZ-I for 01001110 (starting positive)', () => {
  assert.equal(toNotation(encode('01001110', 'nrz-i', { initialLevel: 1 })), '+ − − − + − + +');
});
test('Midterm Q1b-OR: 10110001 NRZ-L, NRZ-I, RZ', () => {
  assert.equal(toNotation(encode('10110001', 'nrz-l')), '− + − − + + + −');
  assert.equal(toNotation(encode('10110001', 'nrz-i', { initialLevel: 1 })), '− − + − − − − +');
  assert.equal(toNotation(encode('10110001', 'rz'), true), '+0 −0 +0 +0 −0 −0 −0 +0');
});
test('Figure 4.8 Manchester / Differential Manchester for 010011', () => {
  assert.equal(toNotation(encode('010011', 'manchester'), true), '+− −+ +− +− −+ −+');
  assert.equal(toNotation(encode('010011', 'diff-manchester', { initialLevel: -1 }), true), '+− −+ −+ −+ +− −+');
});
test('Figure 4.9 AMI / pseudoternary for 010010', () => {
  assert.equal(toNotation(encode('010010', 'ami')), '0 + 0 0 − 0');
  assert.equal(toNotation(encode('010010', 'pseudoternary')), '+ 0 − + 0 −');
});
test('Figure 4.19 B8ZS both cases', () => {
  assert.equal(toNotation(encode('100000000', 'b8zs', { lastPulse: -1 })), '+ 0 0 0 + − 0 − +');
  assert.equal(toNotation(encode('100000000', 'b8zs', { lastPulse: 1 })), '− 0 0 0 − + 0 + −');
});
test('Midterm Q3a: B8ZS of 00001000000001000, last pulse positive', () => {
  const enc = encode('00001000000001000', 'b8zs', { lastPulse: 1 });
  assert.equal(toNotation(enc), '0 0 0 0 − 0 0 0 − + 0 + − + 0 0 0');
  assert.deepEqual(enc.filter((e) => e.mark).map((e) => e.mark), ['V', 'B', 'V', 'B']);
});
test('Figure 4.20 HDB3: 110000100000000 (three substitutions)', () => {
  const enc = encode('110000100000000', 'hdb3', { lastPulse: -1, pulsesSinceSub: 0 });
  assert.equal(toNotation(enc), '+ − + 0 0 + − 0 0 0 − + 0 0 +');
  assert.equal(enc.map((e) => e.mark || '.').join(''), '..B..V....VB..V');
});
test('Encode→decode round trip for every scheme', () => {
  const samples = ['0', '1', '10110001', '00000000', '100000000001', '0000100000000100000000', '1100001000000000'];
  for (const s of Object.keys(SCHEMES)) {
    for (const bits of samples) {
      const opts = { initialLevel: 1, lastPulse: 1 };
      assert.equal(decode(encode(bits, s, opts), s, opts).join(''), bits, `${s} ${bits}`);
    }
  }
});
test('Bit parsing and grading', () => {
  assert.throws(() => parseBits('10a1'), RangeError);
  assert.throws(() => parseBits(''), RangeError);
  const enc = encode('1011', 'nrz-l');
  assert.equal(gradeNotation('- + - -', enc).correct, 4);
  assert.equal(gradeNotation('- + + -', enc).correct, 3);
});

// ---------- Rubric evaluator ----------
const switching = {
  totalMarks: 2,
  criteria: [
    { id: 'c', type: 'choice', label: 'Chooses circuit switching', marks: 0.5, correct: ['circuit switching', 'circuit-switched', 'circuit switched'], wrong: ['packet switching should', 'choose packet switching', 'use packet switching'] },
    { id: 'p', type: 'concepts', label: 'Working principle', marks: 1.5, need: 3, concepts: [
      { name: 'dedicated path/circuit', any: ['dedicated', 'reserved'] },
      { name: 'setup before transfer', any: ['setup', 'set up', 'established before', 'connection establishment'] },
      { name: 'guaranteed bandwidth / no queuing delay', any: ['guaranteed bandwidth', 'constant delay', 'no queuing', 'no delay', 'fixed bandwidth'] },
      { name: 'real-time voice suitability', any: ['real time', 'real-time', 'voice'] },
    ] },
  ],
  penalties: [{ any: ['packets share bandwidth on demand so guaranteed'], deduct: 0.5, message: 'Contradiction' }],
};
test('Rubric validates', () => assert.deepEqual(validateRubric(switching), []));
test('Strong answer earns full marks', () => {
  const r = evaluate('Circuit switching should be used. In circuit switching a dedicated path (circuit) is set up between the two callers before the call starts, so the bandwidth is reserved and guaranteed for the whole call. There is no queuing delay, which suits real-time voice.', switching);
  assert.equal(r.score, 2);
});
test('Keyword stuffing does not earn full marks', () => {
  const r = evaluate('circuit switching dedicated setup guaranteed bandwidth voice', switching);
  assert.ok(r.score < 2, `score ${r.score}`);
  assert.ok(r.guardNote);
});
test('Different but valid wording still earns credit', () => {
  const r = evaluate('I would pick a circuit-switched network. A reserved connection is established before the conversation, giving fixed bandwidth for the whole call and therefore a constant delay, which is what voice needs.', switching);
  assert.ok(r.score >= 1.75, `score ${r.score}`);
});
test('Wrong choice loses the choice mark', () => {
  const r = evaluate('We should use packet switching because packets are stored and forwarded by routers which have queues, so it is efficient for many users sharing a link.', switching);
  assert.ok(r.score <= 0.5, `score ${r.score}`);
});
test('Negated concept is not credited', () => {
  const t = tokens('the path is not dedicated');
  assert.equal(findPhrase(t, 'dedicated').negated, true);
});
test('Numeric criterion with units and missing unit', () => {
  const rub = { totalMarks: 3, criteria: [
    { id: 'f', type: 'formula', label: 'Nyquist formula', marks: 1, patterns: ['2\\s*[x×*]?\\s*B\\s*[x×*]?\\s*log', 'log\\s*2?\\s*\\(?L'] },
    { id: 'n', type: 'numeric', label: 'Max bit rate', marks: 2, expected: 12000, dim: 'rate' },
  ] };
  assert.equal(evaluate('N = 2 × B × log2 L = 2 × 3000 × log2 4 = 12 kbps', rub).score, 3);
  assert.equal(evaluate('N = 2 × B × log2 L = 12000', rub).score, 2.5);
  assert.equal(evaluate('bit rate is 6000 bps', rub).score, 0);
});
test('Sequence criterion uses the levels field, not prose', () => {
  const rub = { totalMarks: 3, criteria: [{ id: 's', type: 'sequence', label: 'B8ZS output', marks: 3, expected: '0 0 0 0 - 0 0 0 - + 0 + - + 0 0 0' }] };
  assert.equal(evaluate({ text: 'Used P and N notation; 1000 bps', levels: '0000-000-+0+-+000' }, rub).score, 3);
  assert.equal(evaluate({ text: '', levels: '0000-00000000+000' }, rub).score < 3, true);
  assert.equal(evaluate('Prose with numbers 1000000 only', rub).score, 0);
});

// ---------- Scheduler ----------
test('Spaced repetition moves through intervals and pulls back on errors', () => {
  const now = Date.UTC(2026, 9, 1);
  let it = newItem({ id: 'x', kind: 'mcq', refId: 'q1', now });
  it = review(it, 'correct', { now });
  assert.equal(it.stage, 1);
  assert.equal(it.dueAt, now + 86400000);
  it = review(it, 'correct', { now }); assert.equal(it.stage, 2);
  it = review(it, 'wrong', { now }); assert.equal(it.stage, 0); assert.equal(it.lapses, 1);
  it = review(it, 'wrong', { now }); assert.equal(it.lapses, 2);
  const queue = buildQueue([it, { ...newItem({ id: 'y', kind: 'mcq', refId: 'q2', now: now + 1 }) }], now + 10);
  assert.equal(queue[0].id, 'x');
});

// ---------- Gamification ----------
test('Badges only when earned; level curve; streak', () => {
  const none = newlyEarnedBadges({ lessonsCompleted: 0, mcqAnswered: 9 }, []);
  assert.equal(none.length, 0);
  const some = newlyEarnedBadges({ lessonsCompleted: 1, mcqAnswered: 10 }, ['first-lesson']);
  assert.deepEqual(some.map((b) => b.id), ['first-10-mcq']);
  assert.equal(levelFromXp(0).level, 1);
  assert.equal(levelFromXp(100).level, 2);
  const now = Date.UTC(2026, 9, 14, 12);
  const days = [0, 1, 2, 4].map((d) => dayKey(now - d * 86400000));
  assert.equal(streakFromDays(days, now), 3);
});

test('Spikes criterion (midterm Q2a frequency-domain sketch)', () => {
  const rub = { totalMarks: 2, criteria: [{ id: 'fd', type: 'spikes', label: 'Frequency domain', marks: 2, freqs: [0, 4, 8, 12, 16], amps: { 0: 3, 8: 20, 16: 5 } }] };
  assert.deepEqual(validateRubric(rub), []);
  assert.equal(evaluate({ spikes: '0:3, 4:10, 8:20, 12:10, 16:5' }, rub).score, 2);
  assert.ok(evaluate({ spikes: '0:3, 8:20, 16:5' }, rub).score < 2);
  assert.ok(evaluate({ spikes: '0:5, 4:1, 8:1, 12:1, 16:3' }, rub).score <= 1.25);
});
test('Self-check criterion counts only ticked items and is flagged', () => {
  const rub = { totalMarks: 2, criteria: [{ id: 'd', type: 'selfcheck', label: 'Diagram', marks: 2, items: [{ id: 'a', label: 'core', marks: 1 }, { id: 'b', label: 'cladding', marks: 1 }] }] };
  const r = evaluate({ text: '', selfcheck: ['a'] }, rub);
  assert.equal(r.score, 1);
  assert.equal(r.selfAssessed, true);
});
test('Sequence criterion can read a named levels field (multi-scheme questions)', () => {
  const rub = { totalMarks: 2, criteria: [
    { id: 'a', type: 'sequence', label: 'NRZ-L', marks: 1, expected: '- + - -', field: 'nrz-l' },
    { id: 'b', type: 'sequence', label: 'RZ', marks: 1, expected: '+0 -0 +0 +0', halves: true, field: 'rz' }] };
  assert.equal(evaluate({ levelsBy: { 'nrz-l': '-+--', rz: '+0-0+0+0' } }, rub).score, 2);
  assert.equal(evaluate({ levelsBy: { 'nrz-l': '-+--', rz: '+-+-+-+-' } }, rub).score, 1);
});
test('Trailing punctuation does not block matching', () => {
  const t = tokens('The logical addresses remain the same.');
  assert.equal(findPhrase(t, 'remain the same').found, true);
  assert.equal(findPhrase(tokens('(dedicated)'), 'dedicated').found, true);
});
