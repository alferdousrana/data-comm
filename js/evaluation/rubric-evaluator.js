// Local, rubric-based written-answer evaluator. Pure module (no DOM).
//
// IMPORTANT LIMITATION (shown to the student in the UI): this engine matches
// concepts, synonyms, formulas, numbers, units and symbol sequences defined in each
// question's rubric. It does not truly understand language, so an unusual but
// correct paraphrase can be missed. Feedback always names the criterion involved.
//
// Rubric shape:
// { totalMarks, minWords?, criteria: [Criterion], penalties?: [Penalty], modelAnswer }
// Criterion types:
//   concepts : { concepts:[{ name, any:[phrase...], bn? }], need:n }  — partial: marks × found/need
//   numeric  : { expected, dim, relTol?, displayUnits?, unitMarks? }   — value (+ unit share)
//   formula  : { patterns:[regex...] }                                   — any pattern present
//   choice   : { correct:[phrase...], wrong:[phrase...] }               — picks the right option
//   sequence : { expected:"+ − 0 …", halves:bool }                     — per-symbol partial credit
// Penalty: { any:[phrase...], deduct, message, bn? } — applied when a known misconception appears.

import { matchQuantity } from '../numerics/formulas.js';
import { parseNotation } from '../simulators/linecoding.js';

const NEG = new Set(['not', 'no', 'never', 'cannot', "can't", 'isnt', "isn't", 'without', 'doesnt', "doesn't", 'না', 'নয়', 'নেই']);

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[“”"'`’]/g, '')
    .replace(/[^\p{L}\p{N}\s\/+\-.=×*^()]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Light stemming so "switches", "switching", "switched" all reduce to "switch".
export function stem(word) {
  if (/[\u0980-\u09FF]/.test(word)) return word; // leave Bangla untouched
  let w = word;
  for (const suf of ['ations', 'ation', 'ings', 'ing', 'edly', 'ed', 'ies', 'es', 's']) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) {
      w = suf === 'ies' ? `${w.slice(0, -3)}y` : w.slice(0, -suf.length);
      break;
    }
  }
  return w;
}
export const tokens = (text) => normalize(text).split(' ').map((w) => w.replace(/^[().,=/+\-]+|[().,=/+\-]+$/g, '')).filter(Boolean).map(stem);

// Token equality with tolerant prefix matching for longer words (stemming leftovers).
const tokEq = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a)));

// Finds a phrase (sequence of stemmed tokens) and checks a 3-token negation window before it.
export function findPhrase(tokenList, phrase) {
  const p = tokens(phrase);
  if (!p.length) return { found: false };
  outer: for (let i = 0; i <= tokenList.length - p.length; i += 1) {
    for (let j = 0; j < p.length; j += 1) if (!tokEq(tokenList[i + j], p[j])) continue outer;
    const before = tokenList.slice(Math.max(0, i - 3), i);
    const negated = before.some((t) => NEG.has(t));
    return { found: true, negated, index: i };
  }
  return { found: false };
}

export function parseSpikes(text) {
  return String(text ?? '').split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^(-?\d*\.?\d+)\s*(?:hz)?\s*[:=@]\s*(-?\d*\.?\d+)/i);
    return m ? { f: parseFloat(m[1]), a: parseFloat(m[2]) } : null;
  }).filter(Boolean);
}

const roundQuarter = (x) => Math.round(x * 4) / 4;
export const defaultMinWords = (marks) => ({ 1: 8, 2: 15, 3: 25, 4: 35, 5: 45 }[Math.round(marks)] ?? marks * 9);

// Symbol sequences come from a dedicated "levels" field, or from lines that contain
// only level symbols (so prose letters/numbers are never misread as levels).
export function extractSequenceText(answer) {
  if (answer && typeof answer === 'object') return String(answer.levels ?? '');
  return String(answer ?? '').split(/\n/).filter((l) => /^[\s+\-−–0|,]+$/.test(l) && /[+\-−–]/.test(l)).join(' ');
}

export function evaluate(answer, rubric) {
  if (!rubric || !Array.isArray(rubric.criteria)) throw new TypeError('Invalid rubric');
  const text = String((answer && typeof answer === 'object') ? (answer.text ?? '') : (answer ?? ''));
  const seqText = extractSequenceText(answer);
  const toks = tokens(text);
  const wordCount = normalize(text).split(' ').filter(Boolean).length;
  const results = [];
  const missing = [];
  const correct = [];
  const mistakes = [];
  const improve = [];

  for (const c of rubric.criteria) {
    const r = { id: c.id, label: c.label, marks: c.marks, earned: 0, notes: [] };
    if (c.type === 'concepts') {
      const need = c.need ?? c.concepts.length;
      let found = 0;
      for (const concept of c.concepts) {
        let hit = null;
        for (const ph of concept.any) {
          const f = findPhrase(toks, ph);
          if (f.found) { hit = f; if (!f.negated) break; }
        }
        if (hit && !hit.negated) { found += 1; correct.push(concept.name); }
        else if (hit && hit.negated) { mistakes.push({ en: `“${concept.name}” appears in a negative statement`, bn: `“${concept.name}” ধারণাটি তুমি নেতিবাচকভাবে লিখেছ — অর্থ ঠিক আছে কিনা মিলিয়ে দেখো।` }); }
        else missing.push({ name: concept.name, bn: concept.bn || '' });
      }
      r.earned = c.marks * Math.min(1, found / need);
      r.notes.push(`${Math.min(found, need)}/${need} expected points found`);
    } else if (c.type === 'numeric') {
      const m = matchQuantity(text, c.expected, { dim: c.dim || null, relTol: c.relTol ?? 0.01, displayUnits: c.displayUnits || [] });
      const unitShare = c.dim ? (c.unitMarks ?? Math.min(0.5, c.marks * 0.25)) : 0;
      if (m.ok) {
        r.earned = m.unitOk ? c.marks : c.marks - unitShare;
        correct.push(`${c.label}: ${m.matched}`);
        if (!m.unitOk) { mistakes.push({ en: `${c.label}: correct value but unit missing or unclear`, bn: 'সংখ্যা ঠিক, কিন্তু একক (unit) লেখোনি বা ভুল একক লিখেছ।' }); improve.push(`Write the unit with the final answer for “${c.label}”.`); }
      } else {
        missing.push({ name: `${c.label} (expected ≈ ${c.display ?? c.expected})`, bn: c.bn || 'সঠিক সংখ্যাগত ফলাফল পাওয়া যায়নি।' });
      }
    } else if (c.type === 'formula') {
      const ok = c.patterns.some((p) => new RegExp(p, 'i').test(text.replace(/\s+/g, ' ')));
      r.earned = ok ? c.marks : 0;
      if (ok) correct.push(c.label); else missing.push({ name: c.label, bn: c.bn || 'সূত্রটি (formula) স্পষ্টভাবে লেখো।' });
    } else if (c.type === 'choice') {
      const hasRight = c.correct.some((p) => { const f = findPhrase(toks, p); return f.found && !f.negated; });
      const hasWrong = (c.wrong || []).some((p) => { const f = findPhrase(toks, p); return f.found && !f.negated; });
      if (hasRight && !hasWrong) { r.earned = c.marks; correct.push(c.label); }
      else if (hasRight && hasWrong) { r.earned = c.marks / 2; mistakes.push({ en: `${c.label}: both options are asserted — commit to one`, bn: 'দুটো বিকল্পই সমর্থন করেছ মনে হচ্ছে — স্পষ্টভাবে একটি বেছে নাও।' }); }
      else missing.push({ name: c.label, bn: c.bn || '' });
    } else if (c.type === 'sequence') {
      const halves = !!c.halves;
      const exp = parseNotation(c.expected, halves);
      const src = c.field ? String((answer && typeof answer === 'object' && answer.levelsBy?.[c.field]) || '') : seqText;
      const got = parseNotation(src, halves);
      let ok = 0;
      exp.forEach((e, i) => { const g = got[i]; if (g && g[0] === e[0] && (!halves || g[1] === e[1])) ok += 1; });
      r.earned = c.marks * (ok / exp.length);
      r.notes.push(`${ok}/${exp.length} signal elements correct`);
      if (ok === exp.length) correct.push(c.label);
      else {
        const firstWrong = exp.findIndex((e, i) => !got[i] || got[i][0] !== e[0] || (halves && got[i][1] !== e[1]));
        mistakes.push({ en: `${c.label}: first mismatch at position ${firstWrong + 1}`, bn: `${firstWrong + 1} নম্বর অবস্থান থেকে লেভেল মিলছে না — নিয়মটি আবার মিলিয়ে দেখো।` });
      }
      if (got.length > exp.length) mistakes.push({ en: 'More signal elements than bits were given', bn: 'বিটের চেয়ে বেশি লেভেল লিখেছ।' });
    } else if (c.type === 'spikes') {
      // Frequency-domain sketch entered as "f:amplitude" pairs, e.g. "0:3, 8:20, 16:5".
      const got = parseSpikes(answer && typeof answer === 'object' ? answer.spikes : '');
      const want = c.freqs;
      const freqHits = want.filter((f) => got.some((g) => Math.abs(g.f - f) < 1e-9)).length;
      const extra = got.filter((g) => !want.some((f) => Math.abs(g.f - f) < 1e-9)).length;
      const ampKeys = Object.keys(c.amps || {});
      const ampHits = ampKeys.filter((k) => got.some((g) => Math.abs(g.f - Number(k)) < 1e-9 && Math.abs(g.a - c.amps[k]) < 1e-9)).length;
      const fShare = c.ampWeight != null ? 1 - c.ampWeight : 0.6;
      const freqScore = Math.max(0, freqHits - extra) / want.length;
      const ampScore = ampKeys.length ? ampHits / ampKeys.length : 1;
      r.earned = c.marks * (fShare * freqScore + (1 - fShare) * ampScore);
      r.notes.push(`${freqHits}/${want.length} frequencies, ${ampHits}/${ampKeys.length} given amplitudes${extra ? `, ${extra} extra` : ''}`);
      if (r.earned >= c.marks - 1e-9) correct.push(c.label);
      else mistakes.push({ en: `${c.label}: check the component frequencies and the amplitudes given in the question`, bn: 'ফ্রিকোয়েন্সি কম্পোনেন্ট ও প্রশ্নে দেওয়া amplitude গুলো আবার মিলিয়ে দেখো।' });
    } else if (c.type === 'selfcheck') {
      // Drawn diagrams cannot be machine-marked reliably: the student ticks the rubric
      // items they genuinely included. Clearly reported as self-assessed.
      const ticked = new Set(answer && typeof answer === 'object' ? answer.selfcheck || [] : []);
      r.earned = c.items.filter((it) => ticked.has(it.id)).reduce((sum, it) => sum + it.marks, 0);
      r.selfAssessed = true;
      c.items.filter((it) => !ticked.has(it.id)).forEach((it) => missing.push({ name: it.label, bn: it.bn || '' }));
    } else {
      throw new TypeError(`Unknown criterion type: ${c.type}`);
    }
    r.earned = roundQuarter(Math.max(0, Math.min(c.marks, r.earned)));
    results.push(r);
  }

  // Brevity and keyword-stuffing guard (does not apply to pure numeric/sequence rubrics).
  const proseCriteria = rubric.criteria.filter((c) => c.type === 'concepts');
  let guardNote = null;
  if (proseCriteria.length) {
    const minWords = rubric.minWords ?? defaultMinWords(rubric.totalMarks);
    if (wordCount < minWords) {
      const factor = Math.max(0.4, wordCount / minWords);
      results.forEach((r, i) => { if (rubric.criteria[i].type === 'concepts') r.earned = roundQuarter(r.earned * factor); });
      guardNote = { en: `Answer is shorter than expected for ${rubric.totalMarks} marks (${wordCount} words; about ${minWords}+ expected). Concept marks were scaled down.`, bn: `${rubric.totalMarks} নম্বরের জন্য উত্তরটি খুব ছোট। শুধু কীওয়ার্ড লিখলে পুরো নম্বর পাওয়া যায় না — ব্যাখ্যা করে লেখো।` };
      improve.push('Explain each point in a full sentence instead of listing keywords.');
    }
  }

  let penalty = 0;
  for (const p of rubric.penalties || []) {
    const hit = p.any.some((ph) => { const f = findPhrase(toks, ph); return f.found && !f.negated; });
    if (hit) { penalty += p.deduct; mistakes.push({ en: p.message, bn: p.bn || '' }); }
  }

  const raw = results.reduce((s, r) => s + r.earned, 0) - penalty;
  const score = roundQuarter(Math.max(0, Math.min(rubric.totalMarks, raw)));
  if (missing.length) improve.push(...missing.slice(0, 4).map((m) => `Add: ${m.name}`));

  return {
    score,
    total: rubric.totalMarks,
    percent: Math.round((score / rubric.totalMarks) * 100),
    criteria: results,
    correct: [...new Set(correct)],
    missing,
    mistakes,
    improve: [...new Set(improve)],
    guardNote,
    penalty,
    wordCount,
    method: 'local-rubric',
    selfAssessed: results.some((r) => r.selfAssessed),
  };
}

export function validateRubric(rubric) {
  const errs = [];
  if (!rubric || typeof rubric.totalMarks !== 'number') errs.push('totalMarks missing');
  const sum = (rubric?.criteria || []).reduce((s, c) => s + (c.marks || 0), 0);
  if (Math.abs(sum - rubric?.totalMarks) > 1e-9) errs.push(`criteria marks (${sum}) ≠ totalMarks (${rubric?.totalMarks})`);
  for (const c of rubric?.criteria || []) {
    if (!['concepts', 'numeric', 'formula', 'choice', 'sequence', 'spikes', 'selfcheck'].includes(c.type)) errs.push(`bad criterion type ${c.type}`);
    if (c.type === 'concepts' && (!c.concepts?.length || (c.need ?? c.concepts.length) > c.concepts.length)) errs.push(`concept criterion ${c.id} invalid`);
    if (c.type === 'selfcheck' && Math.abs(c.items.reduce((x, i) => x + i.marks, 0) - c.marks) > 1e-9) errs.push(`selfcheck ${c.id} item marks ≠ criterion marks`);
    if (c.type === 'formula') c.patterns.forEach((p) => { try { new RegExp(p); } catch { errs.push(`bad regex ${p}`); } });
  }
  return errs;
}
