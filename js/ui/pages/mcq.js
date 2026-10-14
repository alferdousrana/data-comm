import { state, t, uid } from '../../state.js';
import { loadBank } from '../../lessons/content.js';
import { prepare, scoreQuiz } from '../../quizzes/mcq-engine.js';
import { saveAttempt, updateProgress, getProgress, awardXp, markWrong, markRight, checkBadges, saveDraft, getDraft, deleteDraft, revisionItems } from '../../storage/repo.js';
import { XP, xpKey } from '../../gamification/rules.js';
import { isDue } from '../../revision/scheduler.js';
import { esc, $, $$, toast, confirmDialog, beep } from '../dom.js';
import { render } from '../../router.js';

const KEYS = ['A', 'B', 'C', 'D'];

async function collect(lessonId) {
  if (lessonId !== 'revision') {
    const bank = await loadBank(lessonId);
    return bank.mcqs.map((q) => ({ ...q, lessonId }));
  }
  // Weak-topic practice: MCQs in the revision queue that are due.
  const items = (await revisionItems()).filter((r) => r.kind === 'mcq' && isDue(r));
  const out = [];
  for (const it of items.slice(0, 15)) {
    const bank = await loadBank(it.lessonId).catch(() => null);
    const q = bank?.mcqs.find((x) => x.id === it.refId);
    if (q) out.push({ ...q, lessonId: it.lessonId });
  }
  return out;
}

export default async function mcq(view, { lessonId, mode = 'exam' }) {
  const review = mode === 'review';
  const meta = state.manifest.lessons.find((l) => l.id === lessonId);
  const title = lessonId === 'revision' ? t('দুর্বল প্রশ্নের অনুশীলন', 'Weak-question practice') : meta?.title || lessonId;
  const qs = await collect(lessonId);
  if (!qs.length) { view.innerHTML = `<div class="empty"><h2>${esc(title)}</h2><p>${t('এখন অনুশীলনের জন্য কোনো প্রশ্ন নেই।', 'No questions to practise right now.')}</p><a class="btn" href="#/revision">${t('রিভিশন', 'Revision')}</a></div>`; return; }

  const draftId = `quiz:${lessonId}`;
  const draft = review ? null : await getDraft(draftId);
  const prepared = draft?.order ? draft.order.map((o) => { const q = qs.find((x) => x.id === o.id); return q ? { ...q, order: o.order, options: o.order.map((i) => q.options[i]), answer: o.order.indexOf(q.answer) } : null; }).filter(Boolean) : qs.map((q) => prepare(q));
  const chosen = draft?.chosen && draft.chosen.length === prepared.length ? draft.chosen : prepared.map(() => null);
  let submitted = false;

  const qHtml = (q, i) => `<fieldset class="card" style="margin-bottom:1rem" data-q="${i}"><legend>${t('প্রশ্ন', 'Question')} ${i + 1} <span class="chip">${esc(q.type)}</span> <span class="chip">${esc(q.difficulty)}</span></legend>
    <p><b>${esc(q.q)}</b></p>
    ${q.options.map((o, j) => `<button type="button" class="option" data-q="${i}" data-o="${j}" aria-pressed="${chosen[i] === j}"><span class="key">${KEYS[j]}</span><span>${esc(o)}</span></button>`).join('')}
    <div data-exp="${i}" ${review ? '' : 'hidden'}>${review ? explain(q, null) : ''}</div></fieldset>`;

  view.innerHTML = `<div class="page-head"><h1>${esc(title)}</h1><p>${review ? t('রিভিউ মোড: উত্তর ও ব্যাখ্যা দেখানো হচ্ছে, স্কোর সংরক্ষিত হবে না।', 'Review mode: answers and explanations are shown; no score is saved.') : t('পরীক্ষা মোড: জমা দেওয়ার পর উত্তর দেখাবে।', 'Exam mode: answers are revealed after you submit.')}</p></div>
    ${draft && !review ? `<div class="callout info small">${t('আগের অসমাপ্ত উত্তর ফিরিয়ে আনা হয়েছে।', 'Your unfinished answers were restored.')}</div>` : ''}
    <div id="qs">${prepared.map(qHtml).join('')}</div>
    ${review ? `<a class="btn primary" href="#/quiz/${lessonId}">${t('পরীক্ষা মোডে চেষ্টা করো', 'Try in exam mode')}</a>` : `<div class="row"><button class="btn primary" data-submit>${t('জমা দাও', 'Submit answers')}</button><span class="small muted" data-count></span></div>`}
    <div id="result" aria-live="polite"></div>`;

  const count = () => { const el = $('[data-count]', view); if (el) el.textContent = `${chosen.filter((c) => c != null).length}/${prepared.length} ${t('উত্তর দেওয়া', 'answered')}`; };
  count();
  if (review) { prepared.forEach((q, i) => markOptions(i, q, null)); return; }

  view.addEventListener('click', async (e) => {
    const b = e.target.closest('.option');
    if (b && !submitted) {
      const i = Number(b.dataset.q), j = Number(b.dataset.o);
      chosen[i] = j;
      $$(`.option[data-q="${i}"]`, view).forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.o) === j)));
      count();
      saveDraft(draftId, { order: prepared.map((q) => ({ id: q.id, order: q.order })), chosen });
    }
  });

  $('[data-submit]', view).addEventListener('click', async (e) => {
    if (submitted) return;
    const missing = chosen.filter((c) => c == null).length;
    if (missing && !(await confirmDialog(t(`${missing}টি প্রশ্নের উত্তর দেওয়া হয়নি। তবুও জমা দেবে?`, `${missing} question(s) unanswered. Submit anyway?`), t('জমা দাও', 'Submit'), t('ফিরে যাও', 'Go back')))) return;
    submitted = true; e.target.disabled = true; // guards against double submission
    const sc = scoreQuiz(prepared, chosen);
    const attempt = await saveAttempt({ id: uid('quiz'), kind: 'mcq-quiz', lessonId, title: `MCQ: ${title}`, correct: sc.correct, total: sc.total, percent: sc.percent,
      items: prepared.map((q, i) => ({ qid: q.id, lessonId: q.lessonId, chosen: sc.items[i].chosenOriginal, answer: q.order[q.answer], correct: sc.items[i].correct })) });
    let xp = 0;
    for (let i = 0; i < prepared.length; i += 1) {
      const q = prepared[i];
      if (sc.items[i].correct) { xp += await awardXp(xpKey.mcqFirstCorrect(q.id), XP.mcqFirstCorrect, 'First correct MCQ'); await markRight('mcq', q.id); }
      else await markWrong('mcq', q.id, q.lessonId, q.q.slice(0, 90));
      markOptions(i, q, chosen[i]);
      const ex = $(`[data-exp="${i}"]`, view); ex.hidden = false; ex.innerHTML = explain(q, chosen[i]);
    }
    if (lessonId !== 'revision') {
      const p = await getProgress(lessonId);
      await updateProgress(lessonId, { quizBest: Math.max(p.quizBest ?? 0, sc.percent), quizAttempts: (p.quizAttempts || 0) + 1, lastQuizAt: Date.now() });
      xp += await awardXp(xpKey.quizFirstComplete(lessonId), XP.quizFirstComplete, `Quiz completed: ${title}`);
    }
    await deleteDraft(draftId);
    const badges = await checkBadges();
    $('#result', view).innerHTML = `<div class="card raised"><p class="score-big">${sc.correct} / ${sc.total} (${sc.percent}%)</p>
      <p>${sc.total - sc.correct ? t(`${sc.total - sc.correct}টি ভুল প্রশ্ন রিভিশন তালিকায় যোগ হয়েছে।`, `${sc.total - sc.correct} incorrect question(s) added to your revision queue.`) : t('সব ঠিক! চমৎকার।', 'All correct — excellent.')}</p>
      ${xp ? `<p class="small">+${xp} XP</p>` : ''}${badges.length ? `<p>🏅 ${badges.map((b) => esc(b.name)).join(', ')}</p>` : ''}
      <div class="row"><a class="btn primary" href="#/quiz/${lessonId}" data-retry>${t('আবার চেষ্টা করো', 'Retake')}</a>${lessonId !== 'revision' ? `<a class="btn" href="#/lesson/${lessonId}">${t('লেসনে ফিরে যাও', 'Back to lesson')}</a>` : ''}<a class="btn" href="#/results/${attempt.id}">${t('ফলাফল সংরক্ষিত', 'Saved result')}</a></div></div>`;
    $('[data-retry]', view).addEventListener('click', (ev) => { ev.preventDefault(); render(); });
    $('#result', view).scrollIntoView({ behavior: 'smooth' });
    beep(sc.percent >= 60, state.settings.sound);
    toast(`${sc.correct}/${sc.total}`);
  });

  function markOptions(i, q, ch) {
    $$(`.option[data-q="${i}"]`, view).forEach((x) => {
      const j = Number(x.dataset.o);
      x.disabled = true;
      if (j === q.answer) { x.classList.add('correct'); x.querySelector('.key').textContent = '✓'; x.setAttribute('aria-label', `Correct answer: ${q.options[j]}`); }
      else if (j === ch) { x.classList.add('wrong'); x.querySelector('.key').textContent = '✗'; x.setAttribute('aria-label', `Your answer (incorrect): ${q.options[j]}`); }
    });
  }
}

function explain(q, ch) {
  const ok = ch === q.answer;
  return `<p class="verdict ${ch == null ? '' : ok ? 'ok' : 'bad'}">${ch == null ? (q.answer != null ? t('সঠিক উত্তর', 'Correct answer') : '') : ok ? t('✓ সঠিক', '✓ Correct') : t('✗ ভুল', '✗ Incorrect')}: ${KEYS[q.answer]}. ${esc(q.options[q.answer])}</p>
    <p class="bn">${esc(q.explainBn)}</p>${q.explainEn ? `<p class="small muted">${esc(q.explainEn)}</p>` : ''}${q.source ? `<p class="small muted">Source: ${esc(q.source)}</p>` : ''}`;
}
