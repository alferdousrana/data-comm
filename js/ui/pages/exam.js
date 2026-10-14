import { state, t, uid } from '../../state.js';
import { loadExamPaper, loadBank, findWritten } from '../../lessons/content.js';
import { evaluate } from '../../evaluation/rubric-evaluator.js';
import { saveAttempt, saveDraft, getDraft, deleteDraft, awardXp, checkBadges, markWrong, markRight, allAttempts, examScopeOf } from '../../storage/repo.js';
import { XP, xpKey } from '../../gamification/rules.js';
import { answerForm, readAnswer } from './written.js';
import { mountCanvas } from '../../simulators/widgets.js';
import { feedbackHtml } from '../feedback.js';
import { esc, $, $$, toast, confirmDialog } from '../dom.js';
import { onLeave, navigate } from '../../router.js';

export async function list(view) {
  const exams = (await allAttempts()).filter((a) => a.kind === 'exam');
  view.innerHTML = `<div class="page-head"><h1>${t('মক পরীক্ষা', 'Mock examinations')}</h1><p>${t('কঠোর পরীক্ষা মোড: জমা দেওয়ার আগে কোনো উত্তর দেখাবে না।', 'Strict exam mode: no answers are shown before you submit.')}</p></div>
  <div class="grid two">
    <div class="card raised accent"><h3>Mid Term Examination, Summer 2026 — replica</h3>
      <p class="small muted">${t('তোমার প্রশ্নপত্র থেকে হুবহু প্রশ্ন, OR-বিকল্পসহ।', 'Questions from your paper, with the same OR choices.')} 30 marks · 90 min</p>
      <a class="btn primary" href="#/exam/midterm-summer-2026">${t('শুরু / চালিয়ে যাও', 'Start / resume')}</a></div>
    <form class="card" id="mix"><h3>${t('মিশ্র মক পরীক্ষা', 'Mixed mock exam')}</h3>
      <label class="field"><span>${t('স্কোপ', 'Scope')}</span><select name="scope"><option value="midterm">Midterm chapters</option><option value="final">Final chapters</option><option value="all">All published lessons</option></select></label>
      <div class="grid two"><label class="field"><span>${t('মোট নম্বর', 'Total marks')}</span><input type="number" name="marks" min="6" max="40" value="20"></label>
      <label class="field"><span>${t('সময় (মিনিট, ০ = সীমা নেই)', 'Time (min, 0 = no limit)')}</span><input type="number" name="min" min="0" max="180" value="60"></label></div>
      <button class="btn primary">${t('পরীক্ষা তৈরি করো', 'Build exam')}</button><p class="small muted" data-msg></p></form>
  </div>
  <h2 style="margin-top:1.5rem">${t('আগের পরীক্ষা', 'Previous exams')}</h2>
  ${exams.length ? `<div class="card"><ul class="list">${exams.map((e) => `<li class="row between"><a href="#/results/${e.id}">${esc(e.title)}</a><span>${e.score}/${e.total} (${e.percent}%) · ${new Date(e.createdAt).toLocaleDateString()}</span></li>`).join('')}</ul></div>` : `<p class="muted">${t('এখনো কোনো পরীক্ষা দাওনি।', 'No exams taken yet.')}</p>`}`;
  $('#mix', view).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    navigate(`/exam/mixed-${f.get('scope')}-${Math.max(6, Math.min(40, Number(f.get('marks')) || 20))}-${Math.max(0, Math.min(180, Number(f.get('min')) || 0))}`);
  });
}

async function buildMixed(scope, target) {
  const ls = state.manifest.lessons.filter((l) => l.status === 'complete' && (scope === 'all' || examScopeOf(l.chapterId) === scope));
  const pool = [];
  for (const l of ls) (await loadBank(l.id)).written.forEach((w) => pool.push({ lessonId: l.id, qid: w.id, marks: w.marks }));
  pool.sort(() => Math.random() - 0.5);
  const items = []; let sum = 0;
  for (const p of pool) { if (sum + p.marks <= target) { items.push({ label: `Q${items.length + 1}`, marks: p.marks, options: [p] }); sum += p.marks; } if (sum === target) break; }
  return { items, total: sum };
}

export default async function exam(view, { id }) {
  const draftKey = `exam:${id}`;
  let session = await getDraft(draftKey);
  if (!session) {
    let paper;
    if (id.startsWith('mixed-')) {
      const [, scope, marks, min] = id.split('-');
      const built = await buildMixed(scope, Number(marks));
      if (!built.items.length) { view.innerHTML = `<div class="empty">${t('এই স্কোপে এখনো পূর্ণ লেসন নেই।', 'No full lessons in this scope yet.')} <a href="#/exam">${t('ফিরে যাও', 'Back')}</a></div>`; return; }
      paper = { id, title: `Mixed mock (${scope}, ${built.total} marks)`, durationMin: Number(min), totalMarks: built.total, items: built.items };
    } else {
      try { paper = await loadExamPaper(id); } catch { view.innerHTML = `<div class="empty">Exam not found</div>`; return; }
    }
    if (!(await confirmDialog(`${paper.title}: ${paper.totalMarks} marks${paper.durationMin ? `, ${paper.durationMin} minutes` : ''}. ${t('শুরু করবে? উত্তর স্বয়ংক্রিয়ভাবে সংরক্ষিত হবে।', 'Start now? Your answers are saved automatically.')}`, t('শুরু', 'Start'), t('বাতিল', 'Cancel')))) { navigate('/exam'); return; }
    session = { paper, startedAt: Date.now(), choice: paper.items.map(() => 0), answers: {} };
    await saveDraft(draftKey, session);
  }
  const { paper } = session;
  const qs = await Promise.all(paper.items.map((it) => Promise.all(it.options.map((o) => findWritten(o.qid)))));
  let submitted = false;

  view.innerHTML = `<div class="page-head"><h1>${esc(paper.title)}</h1><p>${paper.totalMarks} marks${paper.durationMin ? ` · ${paper.durationMin} min` : ''} · ${t('কঠোর মোড', 'strict mode')}</p></div>
    ${paper.durationMin ? `<div class="card" style="position:sticky;top:64px;z-index:10" role="timer" aria-live="off"><b data-timer></b></div>` : ''}
    <form id="ex">${paper.items.map((it, i) => `<div class="card" style="margin:1rem 0" data-item="${i}">
      <div class="row between"><h3>${esc(it.label)}</h3><span class="chip info">${it.marks} marks${it.co ? ` · ${esc(it.co)}` : ''}</span></div>
      ${it.options.length > 1 ? `<div class="row" role="radiogroup" aria-label="Choose one">${it.options.map((_, j) => `<label class="chip"><input type="radio" name="ch${i}" value="${j}" ${session.choice[i] === j ? 'checked' : ''}> ${j === 0 ? 'Option A' : '— OR — Option B'}</label>`).join('')}</div>` : ''}
      ${it.options.map((_, j) => { const q = qs[i][j]; return `<div data-opt="${i}-${j}" ${session.choice[i] === j ? '' : 'hidden'}><p style="white-space:pre-wrap"><b>${esc(q.question)}</b></p>${answerForm(q, `q${i}o${j}`, session.answers[`${i}-${j}`] || {})}</div>`; }).join('')}
      <div data-fb="${i}"></div></div>`).join('')}
      <button class="btn primary" type="submit" data-submit>${t('পরীক্ষা জমা দাও', 'Submit exam')}</button></form>
    <div id="exres" aria-live="polite"></div>`;

  $$('[data-canvas]', view).forEach((el) => mountCanvas(el));
  const form = $('#ex', view);
  const persist = async () => {
    paper.items.forEach((it, i) => it.options.forEach((_, j) => { session.answers[`${i}-${j}`] = readAnswer(form, `q${i}o${j}`); }));
    await saveDraft(draftKey, session);
  };
  let pt = null;
  form.addEventListener('input', (e) => {
    const m = e.target.name?.match(/^ch(\d+)$/);
    if (m) { const i = Number(m[1]); session.choice[i] = Number(e.target.value); paper.items[i].options.forEach((_, j) => { $(`[data-opt="${i}-${j}"]`, view).hidden = j !== session.choice[i]; }); }
    clearTimeout(pt); pt = setTimeout(persist, 600);
  });

  let timer = null;
  if (paper.durationMin) {
    const end = session.startedAt + paper.durationMin * 60000;
    const tick = () => {
      const left = Math.max(0, end - Date.now());
      const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
      const el = $('[data-timer]', view); if (el) el.textContent = `⏱ ${mm}:${String(ss).padStart(2, '0')} ${t('বাকি', 'left')}`;
      if (left === 0 && !submitted) { toast(t('সময় শেষ — স্বয়ংক্রিয়ভাবে জমা হচ্ছে', 'Time is up — submitting automatically')); doSubmit(true); }
    };
    tick(); timer = setInterval(tick, 1000);
  }
  onLeave(() => { clearInterval(timer); if (!submitted) persist(); });

  form.addEventListener('submit', (e) => { e.preventDefault(); doSubmit(false); });

  async function doSubmit(auto) {
    if (submitted) return;
    await persist();
    const answers = paper.items.map((_, i) => session.answers[`${i}-${session.choice[i]}`]);
    const blank = answers.filter((a) => !a || (!a.text?.trim() && !a.levels?.trim() && !Object.values(a.levelsBy || {}).some((v) => v.trim()) && !a.spikes?.trim() && !a.selfcheck?.length)).length;
    if (!auto && blank && !(await confirmDialog(t(`${blank}টি প্রশ্ন ফাঁকা। তবুও জমা দেবে?`, `${blank} question(s) are blank. Submit anyway?`), t('জমা দাও', 'Submit'), t('ফিরে যাও', 'Go back')))) return;
    if (!auto && !(await confirmDialog(t('জমা দেওয়ার পর আর বদলানো যাবে না।', 'You cannot change answers after submitting.'), t('জমা দাও', 'Submit'), t('ফিরে যাও', 'Go back')))) return;
    submitted = true; clearInterval(timer);
    $('[data-submit]', view).disabled = true;
    $$('input, textarea, select', form).forEach((el) => { el.disabled = true; });
    const results = paper.items.map((it, i) => {
      const q = qs[i][session.choice[i]];
      const r = evaluate(answers[i] || {}, q.rubric);
      $(`[data-fb="${i}"]`, view).innerHTML = feedbackHtml(q, r);
      return { label: it.label, qid: q.id, lessonId: q.lessonId, marks: it.marks, score: r.score, percent: r.percent, result: r, answer: answers[i] };
    });
    const score = results.reduce((s, r) => s + r.score, 0);
    const att = await saveAttempt({ id: uid('exam'), kind: 'exam', examId: paper.id, title: paper.title, score, total: paper.totalMarks, percent: Math.round((score / paper.totalMarks) * 100), durationSec: Math.round((Date.now() - session.startedAt) / 1000), items: results.map(({ result, ...r }) => ({ ...r, criteria: result.criteria })) });
    for (const r of results) { if (r.percent < 60) await markWrong('written', r.qid, r.lessonId, `${r.label} ${paper.title}`); else await markRight('written', r.qid); }
    const xp = await awardXp(xpKey.examSubmit(att.id), XP.examSubmit, `Submitted ${paper.title}`);
    await deleteDraft(draftKey);
    const badges = await checkBadges();
    const weak = [...new Set(results.filter((r) => r.percent < 60).map((r) => r.lessonId))].map((id) => state.manifest.lessons.find((l) => l.id === id));
    $('#exres', view).innerHTML = `<div class="card raised"><h2>${t('ফলাফল', 'Result')}</h2><p class="score-big">${score} / ${paper.totalMarks} (${att.percent}%)</p>
      <div class="table-wrap"><table><thead><tr><th>Question</th><th>Score</th></tr></thead><tbody>${results.map((r) => `<tr><td>${esc(r.label)}</td><td>${r.score}/${r.marks}${r.result.selfAssessed ? ' (part self-assessed)' : ''}</td></tr>`).join('')}</tbody></table></div>
      <h3>${t('দুর্বল এলাকা ও রিভিশন', 'Weak areas & revision')}</h3>${weak.length ? `<ul>${weak.map((l) => `<li><a href="#/lesson/${l.id}">${esc(l.title)}</a></li>`).join('')}</ul>` : `<p>${t('কোনো প্রশ্নে ৬০% এর নিচে নেই।', 'No question below 60%.')}</p>`}
      ${xp ? `<p class="small">+${xp} XP</p>` : ''}${badges.map((b) => `<p>🏅 ${esc(b.name)}</p>`).join('')}
      <p class="small muted">${t('প্রতিটি প্রশ্নের নিচে বিস্তারিত ফিডব্যাক ও মডেল উত্তর দেখো।', 'Detailed feedback and model answers appear under each question.')}</p></div>`;
    $('#exres', view).scrollIntoView({ behavior: 'smooth' });
  }
}
