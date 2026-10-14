import { state, t } from '../../state.js';
import { computeStats, allProgress, allAttempts, revisionItems, examScopeOf } from '../../storage/repo.js';
import { db } from '../../storage/db.js';
import { levelFromXp, streakFromDays, dayKey, BADGES } from '../../gamification/rules.js';
import { buildQueue } from '../../revision/scheduler.js';
import { esc, fmtDuration, pct } from '../dom.js';

// Signature element: the last 14 days drawn as an NRZ-L-style trace (high = studied).
function studyTrace(activeDays) {
  const set = new Set(activeDays);
  const days = Array.from({ length: 14 }, (_, i) => dayKey(Date.now() - (13 - i) * 86400000));
  const w = 26, H = 64, hi = 14, lo = 48;
  let d = '';
  days.forEach((k, i) => { const y = set.has(k) ? hi : lo; d += `${i ? 'L' : 'M'}${i * w + 8},${y}L${(i + 1) * w + 8},${y}`; });
  const labels = days.map((k, i) => `<text x="${i * w + 8 + w / 2}" y="${H - 2}" text-anchor="middle" font-size="9" fill="var(--ink-2)">${k.slice(8)}</text>`).join('');
  const studied = days.filter((k) => set.has(k)).length;
  return `<svg viewBox="0 0 ${14 * w + 16} ${H}" width="100%" role="img" aria-label="Study activity for the last 14 days: studied on ${studied} days">
    <line x1="8" y1="${lo}" x2="${14 * w + 8}" y2="${lo}" stroke="var(--line)"/>
    <path d="${d}" fill="none" stroke="var(--trace)" stroke-width="3" stroke-linejoin="round"/>${labels}</svg>`;
}

export default async function dashboard(view) {
  const m = state.manifest;
  const [stats, progress, attempts, revs, todayRow] = await Promise.all([computeStats(), allProgress(), allAttempts(), revisionItems(), db.get('activity', dayKey())]);
  const pmap = Object.fromEntries(progress.map((p) => [p.lessonId, p]));
  const complete = m.lessons.filter((l) => l.status === 'complete');
  const done = (l) => pmap[l.id]?.completed;
  const scopePct = (scope) => {
    const ls = complete.filter((l) => examScopeOf(l.chapterId) === scope);
    return ls.length ? { pct: Math.round((ls.filter(done).length / ls.length) * 100), n: ls.length, d: ls.filter(done).length } : null;
  };
  const inProgress = progress.filter((p) => !p.completed && p.readPct > 0).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const next = inProgress ? m.lessons.find((l) => l.id === inProgress.lessonId) : complete.find((l) => !done(l));
  const due = buildQueue(revs);
  const lvl = levelFromXp(stats.xp);
  const goalSec = state.settings.dailyGoalMin * 60;
  const today = todayRow?.seconds || 0;
  const streak = streakFromDays(stats.activeDays);

  // Personal weakness: lessons with evidence, ranked by their weakest measured score.
  const weak = complete.map((l) => {
    const q = pmap[l.id]?.quizBest;
    const ws = attempts.filter((a) => a.kind === 'written' && a.lessonId === l.id).map((a) => a.result?.percent ?? 0);
    const wAvg = ws.length ? ws.reduce((s, x) => s + x, 0) / ws.length : null;
    const vals = [q, wAvg].filter((x) => x != null);
    return vals.length ? { l, score: Math.round(Math.min(...vals)) } : null;
  }).filter(Boolean).filter((x) => x.score < 70).sort((a, b) => a.score - b.score).slice(0, 4);

  // Official priority: very important and not yet completed, in the upcoming exam scope.
  const examDate = state.settings.examDates.final;
  const days = examDate ? Math.ceil((new Date(examDate) - Date.now()) / 86400000) : null;
  const priority = complete.filter((l) => l.importance.level === 'very-important' && !done(l)).slice(0, 5);
  const mid = scopePct('midterm'), fin = scopePct('final');

  view.innerHTML = `
  <div class="page-head"><h1>${t('আজকের পড়া', 'Today')}</h1><p>CSE 311 · ${t('তোমার প্রকৃত সংরক্ষিত অগ্রগতি থেকে', 'from your saved progress')}</p></div>
  <div class="grid two">
    <div class="card raised accent">
      ${next ? `<p class="small muted">${inProgress ? t('চালিয়ে যাও', 'Continue learning') : t('পরের লেসন', 'Next lesson')}</p><h3>${esc(next.titleBn)}</h3><p class="small muted">${esc(next.title)}</p>
      ${inProgress ? `<div class="progress" aria-label="Read ${inProgress.readPct}%"><i style="width:${inProgress.readPct}%"></i></div>` : ''}
      <p style="margin-top:.8rem"><a class="btn primary" href="#/lesson/${next.id}">${inProgress ? t('লেসন চালিয়ে যাও', 'Continue lesson') : t('লেসন শুরু করো', 'Start lesson')}</a>
      ${due.length ? ` <a class="btn" href="#/revision">${t('রিভিশন', 'Revise')} (${due.length})</a>` : ''}</p>`
      : `<h3>${t('প্রকাশিত সব লেসন শেষ!', 'All published lessons done!')}</h3><p><a class="btn primary" href="#/exam">${t('মক পরীক্ষা দাও', 'Take a mock exam')}</a></p>`}
    </div>
    <div class="card">
      <div class="row between"><h3>${t('গত ১৪ দিন', 'Last 14 days')}</h3>${state.settings.streaks ? `<span class="chip info">${streak} ${t('দিনের ধারা', 'day streak')}</span>` : ''}</div>
      ${studyTrace(stats.activeDays)}
      <p class="small muted">${t('আজ', 'Today')}: ${fmtDuration(today)} / ${state.settings.dailyGoalMin}m ${t('লক্ষ্য', 'goal')}</p>
      <div class="progress"><i style="width:${Math.min(100, Math.round((today / goalSec) * 100))}%"></i></div>
    </div>
  </div>

  <div class="grid three" style="margin-top:1rem">
    <div class="card stat"><b>${complete.filter(done).length}/${complete.length}</b><span>${t('লেসন সম্পন্ন', 'lessons completed')} (${m.contentStatus.outline} ${t('আউটলাইন বাকি', 'outline-only pending')})</span></div>
    <div class="card stat"><b>${pct(stats.mcqAccuracy)}</b><span>${t('MCQ নির্ভুলতা', 'MCQ accuracy')} · ${stats.mcqAnswered} ${t('উত্তর', 'answered')}</span></div>
    <div class="card stat"><b>${pct(stats.writtenAvg)}</b><span>${t('লিখিত উত্তরের গড়', 'written-answer average')} · ${stats.writtenSubmitted}</span></div>
    <div class="card stat"><b>${fmtDuration(stats.studySeconds)}</b><span>${t('মোট পড়ার সময় (অ্যাপ খোলা ও সক্রিয়)', 'total study time (app open and active)')}</span></div>
    <div class="card stat"><b>${stats.totalQuestions}</b><span>${t('মোট প্রশ্ন চেষ্টা', 'questions attempted')}</span></div>
    <div class="card stat"><b>${state.settings.gamification ? `Lv ${lvl.level} · ${stats.xp} XP` : '—'}</b><span>${state.settings.gamification ? `${stats.badges.length}/${BADGES.length} ${t('ব্যাজ', 'badges')}` : t('গেমিফিকেশন বন্ধ', 'gamification off')}</span></div>
  </div>

  <div class="grid two" style="margin-top:1rem">
    <div class="card">
      <h3>${t('পরীক্ষার প্রস্তুতি', 'Exam preparation')}</h3>
      ${days != null ? `<p><b>${days >= 0 ? days : 0}</b> ${t('দিন বাকি ফাইনালে', 'days to the final')} (${esc(examDate)})</p>` : `<p class="small muted"><a href="#/settings">${t('ফাইনালের তারিখ যোগ করো', 'Add your final exam date')}</a></p>`}
      <p class="small">${t('মিডটার্ম স্কোপ', 'Midterm scope')}: ${mid ? `${mid.d}/${mid.n}` : '—'}</p><div class="progress"><i style="width:${mid?.pct || 0}%"></i></div>
      <p class="small" style="margin-top:.6rem">${t('ফাইনাল স্কোপ', 'Final scope')}: ${fin ? `${fin.d}/${fin.n}` : t('এখনো পূর্ণ লেসন নেই', 'no full lessons yet')}</p><div class="progress"><i style="width:${fin?.pct || 0}%"></i></div>
      <h4 style="margin-top:1rem">${t('আগে পড়ো (কোর্সের গুরুত্ব)', 'Study first (course importance)')}</h4>
      ${priority.length ? `<ul class="list">${priority.map((l) => `<li><a href="#/lesson/${l.id}">${esc(l.title)}</a><br><span class="small muted">${esc(l.importance.reasons[0])}</span></li>`).join('')}</ul>` : `<p class="small muted">${t('সব গুরুত্বপূর্ণ লেসন শেষ।', 'All very-important lessons completed.')}</p>`}
      <p class="small muted">${t('এটি কোনো প্রশ্ন আসার নিশ্চয়তা নয়।', 'This is not a prediction of what will appear in the exam.')}</p>
    </div>
    <div class="card">
      <h3>${t('তোমার দুর্বল বিষয়', 'Your weakest topics')}</h3>
      ${weak.length ? `<ul class="list">${weak.map((w) => `<li class="row between"><a href="#/lesson/${w.l.id}">${esc(w.l.title)}</a><span class="chip vi">${w.score}%</span></li>`).join('')}</ul><a class="btn small" href="#/revision">${t('দুর্বল বিষয় অনুশীলন', 'Practice weak topics')}</a>`
        : `<p class="small muted">${t('কুইজ বা লিখিত উত্তর দিলে এখানে তোমার দুর্বল বিষয় দেখাবে।', 'Take quizzes or written questions and your weak topics will appear here.')}</p>`}
      <h4 style="margin-top:1rem">${t('রিভিশন দরকার', 'Needs revision')}: ${due.length}</h4>
      <h4>${t('সাম্প্রতিক কাজ', 'Recent activity')}</h4>
      ${attempts.length ? `<ul class="list small">${attempts.slice(0, 5).map((a) => `<li><a href="#/results/${a.id}">${esc(a.title || a.kind)}</a> — ${a.kind === 'mcq-quiz' ? `${a.correct}/${a.total}` : a.kind === 'numeric' ? (a.allCorrect ? '✓' : '✗') : `${a.result?.score ?? a.score ?? ''}/${a.result?.total ?? a.total ?? ''}`} <span class="muted">${new Date(a.createdAt).toLocaleDateString()}</span></li>`).join('')}</ul>` : `<p class="small muted">${t('এখনো কোনো চেষ্টা নেই।', 'No attempts yet.')}</p>`}
      <p class="small muted">${state.online ? t('অনলাইন', 'Online') : t('অফলাইন — সব কাজ এই ডিভাইসে সংরক্ষিত হচ্ছে', 'Offline — everything is saved on this device')}${state.user ? ` · ${state.pendingSync} ${t('টি সিঙ্ক বাকি', 'pending sync')}` : ''}</p>
    </div>
  </div>`;
}
