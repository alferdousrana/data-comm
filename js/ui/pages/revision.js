import { state, t } from '../../state.js';
import { revisionItems, reviewItem, bookmarks, allAttempts } from '../../storage/repo.js';
import { buildQueue, overdueDays } from '../../revision/scheduler.js';
import { loadLesson } from '../../lessons/content.js';
import { esc, $, $$, toast } from '../dom.js';
import { render } from '../../router.js';

export default async function revision(view) {
  const [items, bms, attempts] = await Promise.all([revisionItems(), bookmarks(), allAttempts()]);
  const now = Date.now();
  const queue = buildQueue(items, now);
  const upcoming = items.filter((i) => i.dueAt > now && i.status !== 'mastered').sort((a, b) => a.dueAt - b.dueAt).slice(0, 8);
  const wrongMcq = queue.filter((i) => i.kind === 'mcq');
  const lowWritten = Object.values(attempts.filter((a) => a.kind === 'written').reduce((m, a) => { const prev = m[a.questionId]; if (!prev || a.createdAt > prev.createdAt) m[a.questionId] = a; return m; }, {})).filter((a) => a.result.percent < 60);
  const complete = state.manifest.lessons.filter((l) => l.status === 'complete');
  const lessons = await Promise.all(complete.map((l) => loadLesson(l.id)));
  const href = (i) => i.kind === 'lesson' ? `#/lesson/${i.refId}` : i.kind === 'written' ? `#/written/${i.refId}` : i.kind === 'numeric' ? `#/practice/numeric/${i.refId}` : `#/quiz/${i.lessonId}`;

  view.innerHTML = `<div class="page-head"><h1>${t('রিভিশন কেন্দ্র', 'Revision centre')}</h1><p>${t('পরামর্শকৃত বিরতি: ০, ১, ৩, ৭, ১৪ দিন — ভুল হলে আগে আসবে। এটি নির্দেশিকা, বৈজ্ঞানিক নিশ্চয়তা নয়।', 'Suggested intervals 0, 1, 3, 7, 14 days; mistakes come back sooner. A guide, not a guarantee.')}</p></div>
  <div class="tabs" role="tablist">${['queue', 'mcq', 'written', 'formulas', 'short', 'bookmarks'].map((k, i) => `<button role="tab" data-t="${k}" aria-selected="${i === 0}">${{ queue: t('আজকের তালিকা', 'Due today'), mcq: t('ভুল MCQ', 'Incorrect MCQs'), written: t('কম নম্বরের উত্তর', 'Low-scoring answers'), formulas: t('সূত্র', 'Formulas'), short: t('ছোট প্রশ্ন', 'Short-answer recall'), bookmarks: t('বুকমার্ক', 'Bookmarks') }[k]}</button>`).join('')}</div>
  <div data-p="queue">${queue.length ? `<div class="card"><ul class="list">${queue.map((i) => `<li><div class="row between"><a href="${href(i)}">${esc(i.label || i.refId)}</a><span class="chip ${i.lapses > 1 ? 'vi' : ''}">${i.kind}${overdueDays(i, now) ? ` · ${overdueDays(i, now)}d overdue` : ''}${i.lapses ? ` · ${i.lapses}× missed` : ''}</span></div>
      <div class="row small" style="margin-top:.4rem"><button class="btn small" data-r="${i.id}" data-o="understood">${t('বুঝেছি', 'Understood')}</button><button class="btn small" data-r="${i.id}" data-o="correct">${t('মনে আছে', 'Remembered')}</button><button class="btn small" data-r="${i.id}" data-o="difficult">${t('কঠিন', 'Difficult')}</button><button class="btn small" data-r="${i.id}" data-o="practice">${t('আরো অনুশীলন', 'More practice')}</button></div></li>`).join('')}</ul></div>`
    : `<div class="empty"><p>${t('আজ রিভিশনের কিছু নেই। 🎉', 'Nothing due today.')}</p></div>`}
    ${upcoming.length ? `<h3 style="margin-top:1rem">${t('আসছে', 'Coming up')}</h3><ul class="list small">${upcoming.map((i) => `<li>${esc(i.label || i.refId)} — ${new Date(i.dueAt).toLocaleDateString()}</li>`).join('')}</ul>` : ''}</div>
  <div data-p="mcq" hidden>${wrongMcq.length ? `<p>${wrongMcq.length} ${t('টি MCQ আবার অনুশীলন করতে হবে।', 'MCQs to practise again.')}</p><a class="btn primary" href="#/quiz/revision">${t('ভুল MCQ গুলো আবার দাও', 'Practise incorrect MCQs')}</a>` : `<p class="muted">${t('কোনো ভুল MCQ বাকি নেই।', 'No incorrect MCQs due.')}</p>`}</div>
  <div data-p="written" hidden>${lowWritten.length ? `<div class="card"><ul class="list">${lowWritten.map((a) => `<li class="row between"><a href="#/written/${a.questionId}">${esc(a.title)}</a><span class="chip vi">${a.result.percent}%</span></li>`).join('')}</ul></div>` : `<p class="muted">${t('৬০% এর নিচে কোনো সাম্প্রতিক উত্তর নেই।', 'No recent answers below 60%.')}</p>`}</div>
  <div data-p="formulas" hidden>${lessons.filter((L) => L.formulas.length).map((L) => `<div class="card" style="margin-bottom:.8rem"><h3>${esc(L.title)}</h3>${L.formulas.map((f) => `<p><b>${esc(f.name)}</b><br><code>${esc(f.expr)}</code> <span class="small muted">${esc(f.source)}</span></p>`).join('')}</div>`).join('')}</div>
  <div data-p="short" hidden>${lessons.map((L) => `<details class="card" style="margin-bottom:.6rem"><summary><b>${esc(L.revision.recall.q)}</b> <span class="small muted">— ${esc(L.title)}</span></summary><p style="margin-top:.5rem">${esc(L.revision.recall.a)}</p><p class="small"><code>${esc(L.revision.card)}</code></p></details>`).join('')}</div>
  <div data-p="bookmarks" hidden>${bms.length ? `<ul class="list">${bms.map((b) => `<li><a href="#/lesson/${b.lessonId}">${esc(b.title)}</a></li>`).join('')}</ul>` : `<p class="muted">${t('কোনো বুকমার্ক নেই।', 'No bookmarks yet.')}</p>`}</div>`;

  $$('[data-t]', view).forEach((b) => b.addEventListener('click', () => {
    $$('[data-t]', view).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $$('[data-p]', view).forEach((p) => { p.hidden = p.dataset.p !== b.dataset.t; });
  }));
  $$('[data-r]', view).forEach((b) => b.addEventListener('click', async () => { await reviewItem(b.dataset.r, b.dataset.o); toast(t('পরবর্তী রিভিশন নির্ধারিত হয়েছে', 'Next review scheduled')); render(); }));
}
