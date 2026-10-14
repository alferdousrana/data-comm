import { state, t } from '../../state.js';
import { computeStats, allProgress, allAttempts, ledger } from '../../storage/repo.js';
import { BADGES, levelFromXp, streakFromDays } from '../../gamification/rules.js';
import { esc } from '../dom.js';

const RULE = {
  'first-lesson': 'Complete 1 lesson', 'first-10-mcq': 'Answer 10 MCQs', 'mcq-100': 'Answer 100 MCQs', 'waveform-explorer': 'Try 5 different line-coding schemes in the simulator',
  'numeric-solver': 'Solve 10 numerical problems correctly', scrambler: 'Get full marks on a scrambling question', writer: 'Submit 5 written answers', improver: 'Improve your score on a retried written question',
  'chapter-master': 'Complete every full lesson of a chapter with quiz ≥ 80%', 'revision-champion': 'Do 25 revision reviews', 'mock-exam': 'Submit a mock exam', 'exam-ready': 'Mock exam ≥ 70% and 80% of midterm lessons completed',
};

export default async function achievements(view) {
  if (!state.settings.gamification) { view.innerHTML = `<div class="empty"><h2>${t('গেমিফিকেশন বন্ধ', 'Gamification is off')}</h2><a class="btn" href="#/settings">${t('সেটিংসে চালু করো', 'Turn on in Settings')}</a></div>`; return; }
  const [stats, progress, attempts, led] = await Promise.all([computeStats(), allProgress(), allAttempts(), ledger()]);
  const lv = levelFromXp(stats.xp);
  const earnedAt = Object.fromEntries(led.filter((l) => l.kind === 'badge').map((l) => [l.badgeId, l.at]));
  const pmap = Object.fromEntries(progress.map((p) => [p.lessonId, p]));
  const mastery = state.manifest.lessons.filter((l) => l.status === 'complete').map((l) => {
    const ws = attempts.filter((a) => a.kind === 'written' && a.lessonId === l.id).map((a) => a.result.percent);
    const q = pmap[l.id]?.quizBest;
    const parts = [q, ws.length ? Math.max(...ws) : null].filter((x) => x != null);
    const m = parts.length ? Math.round(parts.reduce((s, x) => s + x, 0) / parts.length) : null;
    return { l, m, done: pmap[l.id]?.completed };
  });
  view.innerHTML = `<div class="page-head"><h1>${t('অর্জন', 'Achievements')}</h1><p>${t('প্রতিটি অর্জন বাস্তব কাজ থেকে।', 'Every achievement comes from real, recorded actions.')}</p></div>
  <div class="grid three">
    <div class="card stat"><b>Level ${lv.level}</b><span>${stats.xp} XP · ${lv.into}/${lv.span} to next</span><div class="progress" style="margin-top:.5rem"><i style="width:${Math.round((lv.into / lv.span) * 100)}%"></i></div></div>
    <div class="card stat"><b>${stats.badges.length}/${BADGES.length}</b><span>${t('ব্যাজ', 'badges')}</span></div>
    <div class="card stat"><b>${state.settings.streaks ? streakFromDays(stats.activeDays) : '—'}</b><span>${state.settings.streaks ? t('দিনের ধারা (একদিন বাদ গেলে নতুন করে শুরু — কোনো সমস্যা নেই)', 'day streak (missing a day just starts a new one)') : t('স্ট্রিক বন্ধ', 'streaks off')}</span></div>
  </div>
  <h2 style="margin-top:1.5rem">${t('ব্যাজ', 'Badges')}</h2>
  <div class="grid three">${BADGES.map((b) => `<div class="card" style="${earnedAt[b.id] ? '' : 'opacity:.6'}"><h3>${earnedAt[b.id] ? '🏅' : '🔒'} ${esc(b.name)}</h3><p class="bn small">${esc(b.bn)}</p><p class="small muted">${esc(RULE[b.id])}${earnedAt[b.id] ? ` · ${new Date(earnedAt[b.id]).toLocaleDateString()}` : ''}</p></div>`).join('')}</div>
  <h2 style="margin-top:1.5rem">${t('টপিক মাস্টারি', 'Topic mastery')}</h2>
  <div class="card"><ul class="list">${mastery.map(({ l, m, done }) => `<li><div class="row between"><a href="#/lesson/${l.id}">${esc(l.title)}</a><span class="chip ${m == null ? '' : m >= 80 ? 'ok' : m >= 50 ? 'im' : 'vi'}">${m == null ? t('ডেটা নেই', 'no data') : `${m}%`}${done ? ' · ✓' : ''}</span></div>${m != null ? `<div class="progress" style="margin-top:.35rem"><i style="width:${m}%"></i></div>` : ''}</li>`).join('')}</ul>
  <p class="small muted">${t('মাস্টারি = সেরা কুইজ স্কোর ও সেরা লিখিত স্কোরের গড়।', 'Mastery = average of best quiz score and best written score.')}</p></div>
  <h2 style="margin-top:1.5rem">${t('XP ইতিহাস', 'XP history')}</h2>
  <div class="card"><ul class="list small">${led.filter((l) => l.kind === 'xp').sort((a, b) => b.at - a.at).slice(0, 20).map((l) => `<li class="row between"><span>${esc(l.label)}</span><b>+${l.amount}</b></li>`).join('') || `<li class="muted">${t('এখনো XP নেই', 'No XP yet')}</li>`}</ul></div>`;
}
