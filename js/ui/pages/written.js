import { state, t, uid } from '../../state.js';
import { loadBank, findWritten } from '../../lessons/content.js';
import { evaluate } from '../../evaluation/rubric-evaluator.js';
import { aiEvaluate, aiAvailable } from '../../evaluation/ai-client.js';
import { saveAttempt, awardXp, markWrong, markRight, checkBadges, saveDraft, getDraft, deleteDraft, allAttempts } from '../../storage/repo.js';
import { XP, xpKey } from '../../gamification/rules.js';
import { SCHEMES } from '../../simulators/linecoding.js';
import { mountCanvas } from '../../simulators/widgets.js';
import { feedbackHtml } from '../feedback.js';
import { esc, md, $, $$, toast, confirmDialog } from '../dom.js';
import { render } from '../../router.js';

// Builds the answer form for any written question; used by practice and mock exams.
export function answerForm(q, prefix = 'a', saved = {}) {
  const parts = [];
  const sel = q.rubric.criteria.filter((c) => c.type === 'selfcheck');
  for (const inp of q.inputs) {
    if (inp === 'text') parts.push(`<label class="field"><span>${t('তোমার উত্তর (ইংরেজিতে)', 'Your answer (in English)')}</span><textarea name="${prefix}-text" data-k="text" spellcheck="true">${esc(saved.text || '')}</textarea></label>`);
    else if (inp === 'levels') parts.push(`<label class="field"><span>${t('সিগন্যাল লেভেল', 'Signal levels')} <span class="small muted">(+, −, 0; one per bit)</span></span><input type="text" class="levels" name="${prefix}-levels" data-k="levels" value="${esc(saved.levels || '')}" autocomplete="off" placeholder="0 0 0 0 − …"></label>`);
    else if (inp.startsWith('levels:')) {
      const f = inp.slice(7); const halves = SCHEMES[f]?.halves;
      parts.push(`<label class="field"><span>${esc(SCHEMES[f]?.name || f)} ${t('লেভেল', 'levels')} <span class="small muted">(${halves ? 'two symbols per bit, e.g. +0 −0 or +− −+' : 'one symbol per bit: + − 0'})</span></span><input type="text" class="levels" name="${prefix}-lv-${f}" data-k="lv:${f}" value="${esc(saved.levelsBy?.[f] || '')}" autocomplete="off"></label>`);
    } else if (inp === 'spikes') parts.push(`<label class="field"><span>${t('ফ্রিকোয়েন্সি ডোমেইন (periodic অংশ)', 'Frequency-domain spikes (periodic part)')} <span class="small muted">frequency:amplitude, e.g. 0:3, 4:10, …</span></span><input type="text" class="levels" name="${prefix}-spikes" data-k="spikes" value="${esc(saved.spikes || '')}" autocomplete="off"></label>`);
    else if (inp === 'canvas') parts.push(`<div class="field"><span style="font-weight:600">${t('আঁকার জায়গা (ঐচ্ছিক, এই ডিভাইসেই থাকে)', 'Drawing area (optional, kept on this device)')}</span><div data-canvas="${prefix}"></div></div>`);
  }
  if (sel.length) {
    parts.push(`<details class="card"><summary><b>${t('ডায়াগ্রামের স্ব-মূল্যায়ন চেকলিস্ট', 'Diagram self-assessment checklist')}</b> — ${t('আঁকা শেষ হলে খোলো', 'open after drawing')}</summary>
      <p class="small muted">${t('শুধু যা সত্যিই তোমার ডায়াগ্রামে আছে তাতে টিক দাও। এই অংশের নম্বর স্ব-মূল্যায়িত হিসেবে দেখানো হবে।', 'Tick only what your drawing really contains. These marks are reported as self-assessed.')}</p>
      ${sel.map((c) => `<fieldset><legend>${esc(c.label)} (${c.marks})</legend>${c.items.map((it) => `<label style="display:block;margin:.3rem 0"><input type="checkbox" name="${prefix}-sc" value="${esc(it.id)}" ${saved.selfcheck?.includes(it.id) ? 'checked' : ''}> ${esc(it.label)} <span class="muted small">(${it.marks})</span></label>`).join('')}</fieldset>`).join('')}</details>`);
  }
  return parts.join('');
}

export function readAnswer(root, prefix = 'a') {
  const a = { text: '', levels: '', levelsBy: {}, spikes: '', selfcheck: [] };
  $$(`[name^="${prefix}-"]`, root).forEach((el) => {
    const k = el.dataset.k;
    if (k === 'text') a.text = el.value;
    else if (k === 'levels') a.levels = el.value;
    else if (k?.startsWith('lv:')) a.levelsBy[k.slice(3)] = el.value;
    else if (k === 'spikes') a.spikes = el.value;
    else if (el.name === `${prefix}-sc` && el.checked) a.selfcheck.push(el.value);
  });
  return a;
}
const isEmpty = (a) => !a.text.trim() && !a.levels.trim() && !Object.values(a.levelsBy).some((v) => v.trim()) && !a.spikes.trim() && !a.selfcheck.length;

export default async function written(view, { qid }) {
  const q = await findWritten(qid);
  if (!q) { view.innerHTML = `<div class="empty">${t('প্রশ্ন পাওয়া যায়নি', 'Question not found')}</div>`; return; }
  const draftKey = `written:${qid}`;
  const saved = (await getDraft(draftKey)) || {};
  const prior = (await allAttempts()).filter((a) => a.kind === 'written' && a.questionId === qid);
  let submitting = false;

  view.innerHTML = `<div class="page-head"><p class="small"><a href="#/lesson/${q.lessonId}">${esc(state.manifest.lessons.find((l) => l.id === q.lessonId)?.title || '')}</a></p>
    <h1>${t('লিখিত উত্তর', 'Written answer')} <span class="chip info">${q.marks} ${t('নম্বর', 'marks')}${q.marksSplit && q.marksSplit !== String(q.marks) ? ` (${esc(q.marksSplit)})` : ''}</span></h1></div>
    <div class="card raised"><p style="white-space:pre-wrap"><b>${esc(q.question)}</b></p>
      <p class="small muted">${t('ধরন', 'Type')}: ${esc(q.type)} · ${esc(q.source)}${prior.length ? ` · ${t('আগের সেরা', 'previous best')}: ${Math.max(...prior.map((p) => p.result.score))}/${q.marks}` : ''}</p>
      ${q.hintBn ? `<p class="bn small">💡 ${esc(q.hintBn)}</p>` : ''}</div>
    <form id="ans" class="card" style="margin-top:1rem" novalidate>${answerForm(q, 'a', saved)}
      <div class="row"><button class="btn primary" type="submit" data-submit>${t('জমা দাও ও মূল্যায়ন করো', 'Submit and evaluate')}</button><button class="btn" type="button" data-draft>${t('ড্রাফট সংরক্ষণ', 'Save draft')}</button><button class="btn ghost" type="button" data-model>${t('মডেল উত্তর দেখো (স্টাডি মোড)', 'Show model answer (study mode)')}</button><span class="small muted" data-st></span></div>
    </form>
    <div id="out" aria-live="polite" style="margin-top:1rem"></div>`;

  const canvasEl = $('[data-canvas="a"]', view);
  const pad = canvasEl ? mountCanvas(canvasEl) : null;
  const form = $('#ans', view);
  let draftT = null;
  form.addEventListener('input', () => { clearTimeout(draftT); draftT = setTimeout(async () => { await saveDraft(draftKey, readAnswer(form)); $('[data-st]', view).textContent = t('ড্রাফট সংরক্ষিত', 'Draft saved'); }, 800); });
  $('[data-draft]', view).onclick = async () => { await saveDraft(draftKey, readAnswer(form)); toast(t('ড্রাফট সংরক্ষিত', 'Draft saved')); };
  $('[data-model]', view).onclick = async () => {
    if (!(await confirmDialog(t('মডেল উত্তর আগে দেখলে নিজের উত্তর যাচাইয়ের সুযোগ নষ্ট হয়। তবুও দেখবে?', 'Seeing the model answer first removes the chance to test yourself. Show it anyway?'), t('দেখাও', 'Show'), t('না', 'Cancel')))) return;
    $('#out', view).innerHTML = `<div class="card"><h3>${t('মডেল উত্তর', 'Model answer')}</h3><div class="exam-answer">${md(q.rubric.modelAnswer)}</div></div>`;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;
    const ans = readAnswer(form);
    if (isEmpty(ans)) { toast(t('আগে উত্তর লেখো', 'Write an answer first')); return; }
    submitting = true; $('[data-submit]', view).disabled = true;
    const result = evaluate(ans, q.rubric);
    const ai = aiAvailable() && ans.text.trim().split(/\s+/).length > 20 ? await aiEvaluate(q, ans.text, result) : null;
    const attempt = await saveAttempt({ id: uid('wr'), kind: 'written', questionId: qid, lessonId: q.lessonId, title: `Written: ${q.question.split('\n')[0].slice(0, 70)}`, answer: { ...ans }, drawing: pad?.get() || null, result, ai, tags: q.tags, marks: q.marks });
    let xp = await awardXp(xpKey.writtenFirstSubmit(qid), XP.writtenFirstSubmit, 'Written answer submitted');
    if (result.percent === 100) xp += await awardXp(xpKey.writtenFirstFullMarks(qid), XP.writtenFirstFullMarks, 'Full marks on a written answer');
    if (result.percent < 60) await markWrong('written', qid, q.lessonId, q.question.slice(0, 90)); else await markRight('written', qid);
    await deleteDraft(draftKey);
    const badges = await checkBadges();
    $('#out', view).innerHTML = feedbackHtml(q, result, { ai }) + `<div class="row" style="margin-top:1rem"><button class="btn primary" data-retry>${t('আবার চেষ্টা করো', 'Retry this question')}</button><a class="btn" href="#/lesson/${q.lessonId}">${t('লেসন রিভিশন', 'Revise the lesson')}</a><a class="btn ghost" href="#/results/${attempt.id}">${t('সংরক্ষিত ফলাফল', 'Saved result')}</a></div>
      ${xp || badges.length ? `<p class="small">${xp ? `+${xp} XP ` : ''}${badges.map((b) => `🏅 ${esc(b.name)}`).join(' ')}</p>` : ''}`;
    $('[data-retry]', view).onclick = () => render();
    $('#out', view).scrollIntoView({ behavior: 'smooth' });
  });
}

export async function list(view) {
  const ls = state.manifest.lessons.filter((l) => l.status === 'complete');
  const banks = await Promise.all(ls.map((l) => loadBank(l.id)));
  const attempts = await allAttempts();
  const best = {};
  attempts.filter((a) => a.kind === 'written').forEach((a) => { best[a.questionId] = Math.max(best[a.questionId] ?? 0, a.result.percent); });
  const types = [...new Set(banks.flatMap((b) => b.written.map((w) => w.type)))];
  view.innerHTML = `<div class="page-head"><h1>${t('লিখিত প্রশ্ন', 'Written questions')}</h1><p>${t('পরীক্ষার ধরনের ২–৫ নম্বরের প্রশ্ন, রুব্রিক অনুযায়ী মূল্যায়ন।', '2–5 mark exam-style questions marked against rubrics.')}</p></div>
    <label class="field" style="max-width:320px"><span>${t('ধরন', 'Type')}</span><select id="ty"><option value="">All</option>${types.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>
    <div id="wl"></div>`;
  const draw = () => {
    const ty = $('#ty', view).value;
    $('#wl', view).innerHTML = ls.map((l, i) => {
      const ws = banks[i].written.filter((w) => !ty || w.type === ty);
      return ws.length ? `<div class="card" style="margin-bottom:.8rem"><h3>${esc(l.title)}</h3><ul class="list">${ws.map((w) => `<li><a href="#/written/${w.id}">[${w.marks}] ${esc(w.question.split('\n')[0].slice(0, 150))}</a> ${best[w.id] != null ? `<span class="chip ${best[w.id] >= 80 ? 'ok' : 'im'}">best ${best[w.id]}%</span>` : ''} ${/midterm/i.test(w.source) ? '<span class="chip vi">midterm</span>' : ''}</li>`).join('')}</ul></div>` : '';
    }).join('');
  };
  $('#ty', view).onchange = draw;
  draw();
}
