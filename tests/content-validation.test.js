import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { evaluate, validateRubric } from '../js/evaluation/rubric-evaluator.js';
import { encode, toNotation } from '../js/simulators/linecoding.js';

const load = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const manifest = load('course-manifest.json');
const syllabus = load('syllabus.json');
const bankFiles = readdirSync(new URL('../data/question-banks/', import.meta.url)).filter((f) => !f.startsWith('exam-'));

test('Manifest lessons reference real files and valid chapters', () => {
  const chapterIds = new Set(manifest.chapters.map((c) => c.id));
  const ids = new Set();
  for (const l of manifest.lessons) {
    assert.ok(chapterIds.has(l.chapterId), l.id);
    assert.ok(!ids.has(l.id), `duplicate ${l.id}`); ids.add(l.id);
    assert.ok(existsSync(new URL(`../data/lessons/${l.id}.json`, import.meta.url)), `lesson file ${l.id}`);
    if (l.status === 'complete') assert.ok(existsSync(new URL(`../data/question-banks/${l.id}.json`, import.meta.url)), `bank ${l.id}`);
  }
  for (const ch of Object.keys(syllabus.assignments)) assert.ok(chapterIds.has(ch), ch);
});

test('Duplicate Kurose file is flagged, not silently merged', () => {
  assert.ok(manifest.sources.some((s) => s.status === 'mismatch' && s.file.includes('Chapter_6_Kurose')));
  assert.ok(manifest.chapters.find((c) => c.id === 'kr-ch6').missingSource);
  assert.equal(manifest.lessons.filter((l) => l.chapterId === 'kr-ch6').length, 0);
});

test('Complete lessons have every teaching section', () => {
  for (const l of manifest.lessons.filter((x) => x.status === 'complete')) {
    const L = load(`lessons/${l.id}.json`);
    for (const k of ['intro', 'explain', 'slideDefs', 'realLife', 'visuals', 'solved', 'examAnswers', 'keywords', 'mistakes', 'revision']) assert.ok(L[k], `${l.id} missing ${k}`);
    assert.ok(L.explain.length >= 3, `${l.id} explain`);
    assert.ok(L.revision.takeaways.length >= 5, `${l.id} takeaways`);
    assert.ok(L.source.slides.length, `${l.id} slide refs`);
  }
});

for (const f of bankFiles) {
  test(`Question bank ${f}: MCQs and rubrics are valid`, () => {
    const b = load(`question-banks/${f}`);
    assert.equal(b.mcqs.length, 10);
    assert.equal(new Set(b.mcqs.map((m) => m.q)).size, 10, 'no duplicate questions');
    for (const m of b.mcqs) {
      assert.equal(m.options.length, 4, m.id);
      assert.equal(new Set(m.options).size, 4, `${m.id} distinct options`);
      assert.ok(Number.isInteger(m.answer) && m.answer >= 0 && m.answer < 4, m.id);
      assert.ok(m.explainBn, `${m.id} Bangla explanation`);
    }
    for (const w of b.written) {
      assert.deepEqual(validateRubric(w.rubric), [], w.id);
      assert.equal(w.rubric.totalMarks, w.marks, w.id);
      assert.ok(w.rubric.modelAnswer, `${w.id} model answer`);
    }
  });
}

// The model answer must earn full marks on every auto-marked criterion.
test('Model answers score full marks on auto-marked criteria', () => {
  for (const f of bankFiles) {
    const b = load(`question-banks/${f}`);
    for (const w of b.written) {
      const levelsBy = {};
      let levels = '';
      for (const c of w.rubric.criteria.filter((x) => x.type === 'sequence')) {
        if (c.field) levelsBy[c.field] = c.expected; else levels = c.expected;
      }
      const spikesC = w.rubric.criteria.find((x) => x.type === 'spikes');
      const spikes = spikesC ? spikesC.freqs.map((fr) => `${fr}:${spikesC.amps[String(fr)] ?? 10}`).join(',') : '';
      const selfcheck = w.rubric.criteria.filter((x) => x.type === 'selfcheck').flatMap((c) => c.items.map((i) => i.id));
      const r = evaluate({ text: w.rubric.modelAnswer, levels, levelsBy, spikes, selfcheck }, { ...w.rubric, minWords: 0 });
      assert.equal(r.score, w.marks, `${w.id}: model answer scored ${r.score}/${w.marks} — ${JSON.stringify(r.criteria.map((c) => [c.id, c.earned, c.marks]))}`);
    }
  }
});

test('Sequence answer keys agree with the line-coding engine', () => {
  const lc = load('question-banks/ch4-line-coding.json').written.find((w) => w.id === 'lc-w1');
  const want = Object.fromEntries(lc.rubric.criteria.map((c) => [c.field, c.expected.replace(/-/g, '−')]));
  assert.equal(toNotation(encode('10110001', 'nrz-l')), want['nrz-l']);
  assert.equal(toNotation(encode('10110001', 'nrz-i', { initialLevel: 1 })), want['nrz-i']);
  assert.equal(toNotation(encode('10110001', 'rz'), true), want.rz);
  const sc = load('question-banks/ch4-scrambling.json').written;
  assert.equal(toNotation(encode('00001000000001000', 'b8zs', { lastPulse: 1 })), sc[0].rubric.criteria[0].expected.replace(/-/g, '−'));
  assert.equal(toNotation(encode('110000100000000', 'hdb3', { lastPulse: -1 })), sc[1].rubric.criteria[0].expected.replace(/-/g, '−'));
});

test('Exam paper replica totals 30 marks and every option exists with matching marks', () => {
  const paper = load('question-banks/exam-midterm-summer-2026.json');
  assert.equal(paper.items.reduce((s, i) => s + i.marks, 0), 30);
  for (const it of paper.items) for (const o of it.options) {
    const w = load(`question-banks/${o.lessonId}.json`).written.find((x) => x.id === o.qid);
    assert.ok(w, `${it.label} → ${o.qid}`);
    assert.equal(w.marks, it.marks, `${it.label} marks`);
  }
});

test('Service worker precaches every app file and only files that exist', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const sw = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  const list = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  for (const f of list) assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), `listed but missing: ${f}`);
  const walk = (d) => readdirSync(new URL(`../${d}`, import.meta.url)).flatMap((n) => statSync(new URL(`../${d}/${n}`, import.meta.url)).isDirectory() ? walk(`${d}/${n}`) : [`${d}/${n}`]);
  for (const f of [...walk('js'), ...walk('css')]) assert.ok(list.includes(f), `not precached: ${f}`);
});
test('No absolute root paths that would break on a GitHub Pages sub-path', () => {
  const idx = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!/(href|src)="\/(?!\/)/.test(idx), 'index.html uses a root-absolute path');
  const man = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.ok(man.start_url.startsWith('./') && man.scope === './');
});
test('No secrets committed in the frontend', async () => {
  const cfg = readFileSync(new URL('../js/firebase/config.js', import.meta.url), 'utf8');
  assert.ok(!/sk-ant-|-----BEGIN PRIVATE KEY|private_key/.test(cfg));
});
