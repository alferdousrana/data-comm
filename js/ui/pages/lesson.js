import { state, t } from '../../state.js';
import { loadLesson, loadBank, chapterOf } from '../../lessons/content.js';
import { getProgress, updateProgress, completeLesson, toggleBookmark, bookmarks, getNote, saveNote, ensureRevisionItem, reviewItem } from '../../storage/repo.js';
import { esc, md, $, $$, toast } from '../dom.js';
import { diagram } from '../diagrams.js';
import { mountSim } from '../../simulators/widgets.js';
import { onLeave } from '../../router.js';

const supp = '<span class="label-supp">Supplementary — not from the slides</span>';

export default async function lesson(view, { id }) {
  const m = state.manifest;
  const meta = m.lessons.find((l) => l.id === id);
  if (!meta) { view.innerHTML = `<div class="empty">${t('লেসন পাওয়া যায়নি', 'Lesson not found')}</div>`; return; }
  const [L, prog, bms, note] = await Promise.all([loadLesson(id), getProgress(id), bookmarks(), getNote(id)]);
  const bank = L.status === 'complete' ? await loadBank(id) : null;
  const ch = chapterOf(L.chapterId);
  const idx = m.lessons.indexOf(meta);
  const prev = m.lessons[idx - 1], next = m.lessons[idx + 1];
  const bookmarked = bms.some((b) => b.lessonId === id);
  const src = `${esc(L.source.file)} · ${esc(L.source.bookChapter)} · slides ${esc(L.source.slides.join(', '))}`;

  let body;
  if (L.status !== 'complete') {
    body = `<div class="callout info">${t('এটি এখনো শুধু স্লাইড-আউটলাইন। পূর্ণ বাংলা ব্যাখ্যা, MCQ ও লিখিত প্রশ্ন পরের কনটেন্ট ব্যাচে আসবে।', 'This is a slide outline only. The full Bangla lesson, MCQs and written questions arrive in a later content batch.')}</div>
      <section><h2>Key points from the slides</h2><ul>${L.keyPoints.map((k) => `<li>${esc(k)}</li>`).join('')}</ul></section>`;
  } else {
    const sec = (n, idAttr, title, html) => `<section id="${idAttr}"><h2><span class="part">${n}</span>${title}</h2>${html}</section>`;
    body = [
      sec('01', 'intro', t('ভূমিকা', 'Introduction'), `<p>${esc(L.intro.why)}</p><h3>${t('এই লেসনের পর তুমি পারবে', 'After this lesson you can')}</h3><ul>${L.intro.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>${L.intro.prerequisites.length ? `<p class="small muted">${t('পূর্বজ্ঞান', 'Prerequisites')}: ${esc(L.intro.prerequisites.join('; '))}</p>` : ''}`),
      sec('02', 'explain', t('সহজ বাংলায় ব্যাখ্যা', 'Easy Bangla explanation'), `<div class="explain bn">${L.explain.map((e) => `<h3>${esc(e.h)}</h3><p>${md(e.bn)}</p>`).join('')}</div>`),
      sec('03', 'slides', t('স্লাইডের সংজ্ঞা', 'Original slide definitions'), L.slideDefs.map((d) => `<blockquote class="slide-def">${esc(d.text)}<cite>— ${esc(L.source.file)}, slide ${d.slide}</cite></blockquote>`).join('')),
      sec('04', 'real', t('বাস্তব উদাহরণ', 'Real-life example'), `<p class="small">${supp} <span class="muted">${t('উদাহরণটি ব্যাখ্যার জন্য, স্লাইডের তথ্য নয়।', 'Illustrative example, not a slide fact.')}</span></p><h3>${esc(L.realLife.title)}</h3><p class="bn">${esc(L.realLife.bn)}</p><p><b>${t('সম্পর্ক', 'How it relates')}:</b> ${esc(L.realLife.link)}</p>`),
      sec('05', 'visual', t('চিত্রে শেখা', 'Visual learning'), L.visuals.map((v, i) => `<figure class="figure">${v.kind === 'diagram' ? `<div class="scroll-x">${diagram(v.id)}</div>` : `<div data-sim="${v.id}" data-i="${i}"></div>`}<figcaption>${esc(v.caption)}</figcaption><p class="sr-only">${esc(v.alt)}</p></figure>`).join('')),
      L.formulas.length ? sec('06', 'formulas', t('সূত্র', 'Formula cards'), L.formulas.map((f) => `<div class="formula-card"><b>${esc(f.name)}</b><br><span class="expr">${esc(f.expr)}</span>${f.vars.length ? `<ul class="small">${f.vars.map(([s, mn]) => `<li><code>${esc(s)}</code> — ${esc(mn)}</li>`).join('')}</ul>` : ''}<p class="small muted">Units: ${esc(f.units || '—')} · ${esc(f.source)}${/supplementary/i.test(f.source) ? ` ${supp}` : ''}</p></div>`).join('')) : '',
      sec('07', 'solved', t('সমাধান করা উদাহরণ', 'Solved examples'), L.solved.map((s) => `<div class="card solved" style="margin:.7rem 0"><h3>${esc(s.title)}</h3><ol>
        <li><b>Given:</b> ${esc(s.given.join('; '))}</li><li><b>Required:</b> ${esc(s.required)}</li><li><b>Formula / rule:</b> ${esc(s.rule)}</li>
        ${s.substitution.length ? `<li><b>Substitution:</b> ${esc(s.substitution.join('; '))}</li>` : ''}<li><b>Working:</b><br>${s.calc.map(esc).join('<br>')}</li><li><b>Answer:</b> ${esc(s.answer)}</li></ol>
        ${s.bn ? `<p class="bn small">💡 ${esc(s.bn)}</p>` : ''}</div>`).join('')),
      sec('08', 'exam', t('পরীক্ষায় এটা লেখো', 'Write This in the Exam'), L.examAnswers.map((a) => `<div class="exam-answer"><span class="marks">[${a.marks} mark${a.marks > 1 ? 's' : ''}]</span> <b>${esc(a.question)}</b><br><br>${md(a.answer)}</div>`).join('')),
      sec('09', 'keywords', t('গুরুত্বপূর্ণ কীওয়ার্ড', 'Important keywords'), `<div class="kw-list">${L.keywords.map((k) => `<span class="kw"><b>${esc(k.term)}</b><small class="bn">${esc(k.bn)}</small></span>`).join('')}</div>`),
      sec('10', 'mistakes', t('সাধারণ ভুল', 'Common mistakes'), `<ul>${L.mistakes.map((x) => `<li><b>✗ ${esc(x.m)}</b><br>✓ ${esc(x.fix)}</li>`).join('')}</ul>`),
      (L.flags || []).length ? sec('⚑', 'flags', t('নিশ্চিত করার বিষয়', 'Points to confirm'), L.flags.map((f) => `<div class="callout warn small">${esc(f.text)}</div>`).join('')) : '',
      sec('11', 'revise', t('দ্রুত রিভিশন', 'Quick revision'), `<ol>${L.revision.takeaways.map((x) => `<li>${esc(x)}</li>`).join('')}</ol><div class="revision-card">${esc(L.revision.card)}</div>
        <details class="card" style="margin-top:.8rem"><summary><b>${t('মনে করে দেখো', 'Recall')}:</b> ${esc(L.revision.recall.q)}</summary><p style="margin-top:.5rem">${esc(L.revision.recall.a)}</p></details>`),
      sec('12', 'check', t('যাচাই করো', 'Learning check'), `<p>${bank.mcqs.length} MCQs · ${bank.written.length} ${t('লিখিত প্রশ্ন', 'written questions')}</p>
        <div class="row"><a class="btn primary" href="#/quiz/${id}">${t('১০টি MCQ (পরীক্ষা মোড)', '10 MCQs (exam mode)')}</a><a class="btn" href="#/quiz/${id}/review">${t('রিভিউ মোড (উত্তরসহ)', 'Review mode (answers shown)')}</a></div>
        <ul class="list" style="margin-top:.8rem">${bank.written.map((w) => `<li><a href="#/written/${w.id}">[${w.marks}] ${esc(w.question.split('\n')[0].slice(0, 140))}</a> <span class="chip">${esc(w.type)}</span>${/midterm/i.test(w.source) ? ' <span class="chip vi">From your midterm</span>' : ''}</li>`).join('')}</ul>`),
    ].join('');
  }

  view.innerHTML = `<div class="reader-progress" aria-hidden="true"><i></i></div>
  <article class="reader">
    <p class="small muted"><a href="#/course">${t('কোর্স', 'Course')}</a> › ${esc(ch.bookChapter)} — ${esc(ch.title)}</p>
    <h1>${esc(L.title)}</h1><p class="bn" style="font-size:var(--step-1)">${esc(L.titleBn)}</p>
    <p class="small muted">${src} · ${L.estMinutes} min · ${esc(L.difficulty)}</p>
    <div class="row">${L.importance.reasons.map((r) => `<span class="chip ${L.importance.level === 'very-important' ? 'vi' : 'im'}">${esc(r)}</span>`).join('')}</div>
    <div class="row" style="margin:.8rem 0"><button class="btn small" data-bm aria-pressed="${bookmarked}">${bookmarked ? '★ Bookmarked' : '☆ Bookmark'}</button>
      ${L.status === 'complete' ? `<nav class="toc" aria-label="Sections">${['explain', 'visual', 'solved', 'exam', 'revise', 'check'].map((s) => `<a href="#/lesson/${id}" data-jump="${s}">${s}</a>`).join('')}</nav>` : ''}</div>
    ${body}
    <section id="notes"><h2><span class="part">✎</span>${t('আমার নোট', 'My notes')}</h2>
      <label class="sr-only" for="note">Notes</label><textarea id="note" placeholder="${t('নিজের ভাষায় নোট লেখো…', 'Write notes in your own words…')}">${esc(note?.text || '')}</textarea><p class="small muted" data-note-status></p></section>
    <section><h2><span class="part">✓</span>${t('এই লেসন কেমন লাগল?', 'How well do you know this?')}</h2>
      <div class="row"><button class="btn" data-rate="understood">${t('বুঝেছি', 'Understood')}</button><button class="btn" data-rate="difficult">${t('কঠিন', 'Difficult')}</button><button class="btn" data-rate="practice">${t('আরো অনুশীলন দরকার', 'Needs more practice')}</button></div>
      <p style="margin-top:1rem"><button class="btn primary" data-complete ${prog.completed ? 'disabled' : ''}>${prog.completed ? t('✓ সম্পন্ন', '✓ Completed') : t('সম্পন্ন হিসেবে চিহ্নিত করো', 'Mark as completed')}</button></p></section>
    <nav class="lesson-nav">${prev ? `<a class="btn" href="#/lesson/${prev.id}">← ${esc(prev.title.slice(0, 40))}</a>` : '<span></span>'}${next ? `<a class="btn" href="#/lesson/${next.id}">${esc(next.title.slice(0, 40))} →</a>` : ''}</nav>
  </article>`;

  $$('[data-sim]', view).forEach((el) => { const v = L.visuals[Number(el.dataset.i)]; mountSim(el, v.id, v.params); });
  $$('[data-jump]', view).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); document.getElementById(a.dataset.jump)?.scrollIntoView({ behavior: 'smooth' }); }));

  // Reading progress (saved, monotonic)
  const bar = $('.reader-progress i', view);
  let maxPct = prog.readPct || 0, saveT = null;
  const onScroll = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    const p = h > 0 ? Math.min(100, Math.round((scrollY / h) * 100)) : 100;
    bar.style.width = `${p}%`;
    if (p > maxPct) { maxPct = p; clearTimeout(saveT); saveT = setTimeout(() => updateProgress(id, { readPct: maxPct, lastOpenedAt: Date.now() }), 1200); }
  };
  addEventListener('scroll', onScroll, { passive: true });
  onLeave(() => { removeEventListener('scroll', onScroll); clearTimeout(saveT); if (maxPct > (prog.readPct || 0)) updateProgress(id, { readPct: maxPct }); });
  updateProgress(id, { lastOpenedAt: Date.now() });

  $('[data-bm]', view).onclick = async (e) => { const on = await toggleBookmark(id, L.title); e.target.textContent = on ? '★ Bookmarked' : '☆ Bookmark'; e.target.setAttribute('aria-pressed', String(on)); };
  let noteT = null;
  $('#note', view).addEventListener('input', (e) => { clearTimeout(noteT); $('[data-note-status]', view).textContent = '…'; noteT = setTimeout(async () => { await saveNote(id, e.target.value); $('[data-note-status]', view).textContent = t('সংরক্ষিত', 'Saved'); }, 700); });
  $$('[data-rate]', view).forEach((b) => b.addEventListener('click', async () => {
    const it = await ensureRevisionItem({ kind: 'lesson', refId: id, lessonId: id, label: L.title });
    await reviewItem(it.id, b.dataset.rate);
    await updateProgress(id, { selfRating: b.dataset.rate });
    toast(t('রিভিশন সূচি আপডেট হয়েছে', 'Revision schedule updated'));
  }));
  $('[data-complete]', view).onclick = async (e) => {
    e.target.disabled = true;
    const r = await completeLesson(id, L.title);
    e.target.textContent = t('✓ সম্পন্ন', '✓ Completed');
    toast(`${r.xp ? `+${r.xp} XP · ` : ''}${t('লেসন সম্পন্ন', 'Lesson completed')}${r.badges.length ? ` · 🏅 ${r.badges.map((b) => b.name).join(', ')}` : ''}`);
  };
}
