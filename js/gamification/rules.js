// XP and achievement rules. Pure module.
// XP is awarded through a ledger keyed by a unique action key, so the same
// action never pays twice (e.g. resubmitting the same quiz).

export const XP = {
  lessonComplete: 20,
  quizFirstComplete: 10,
  mcqFirstCorrect: 2,
  writtenFirstSubmit: 5,
  writtenFirstFullMarks: 10,
  numericSolved: 3,
  revisionReview: 1,
  examSubmit: 25,
};

export const xpKey = {
  lessonComplete: (lessonId) => `lesson:${lessonId}:complete`,
  quizFirstComplete: (lessonId) => `quiz:${lessonId}:complete`,
  mcqFirstCorrect: (qid) => `mcq:${qid}:correct`,
  writtenFirstSubmit: (qid) => `written:${qid}:submit`,
  writtenFirstFullMarks: (qid) => `written:${qid}:full`,
  numericSolved: (problemId) => `num:${problemId}`,
  revisionReview: (itemId, day) => `rev:${itemId}:${day}`,
  examSubmit: (examAttemptId) => `exam:${examAttemptId}`,
};

// Badge definitions: `test(stats)` must return true only when the condition is met.
export const BADGES = [
  { id: 'first-lesson', name: 'First Lesson Completed', bn: 'প্রথম লেসন শেষ', test: (s) => s.lessonsCompleted >= 1 },
  { id: 'first-10-mcq', name: 'First 10 MCQs Completed', bn: 'প্রথম ১০টি MCQ', test: (s) => s.mcqAnswered >= 10 },
  { id: 'mcq-100', name: '100 MCQs Answered', bn: '১০০টি MCQ', test: (s) => s.mcqAnswered >= 100 },
  { id: 'waveform-explorer', name: 'Waveform Explorer', bn: 'ওয়েভফর্ম অভিযাত্রী', test: (s) => s.schemesExplored >= 5 },
  { id: 'numeric-solver', name: 'Numerical Problem Solver', bn: 'গাণিতিক সমাধানকারী', test: (s) => s.numericCorrect >= 10 },
  { id: 'scrambler', name: 'Scrambling Specialist', bn: 'স্ক্র্যাম্বলিং বিশেষজ্ঞ', test: (s) => s.scramblingFullMarks >= 1 },
  { id: 'writer', name: 'Exam Writer', bn: 'উত্তর লেখক', test: (s) => s.writtenSubmitted >= 5 },
  { id: 'improver', name: 'Improvement Badge', bn: 'উন্নতির ব্যাজ', test: (s) => s.improvedRetries >= 1 },
  { id: 'chapter-master', name: 'Chapter Master', bn: 'চ্যাপ্টার মাস্টার', test: (s) => s.chaptersMastered >= 1 },
  { id: 'revision-champion', name: 'Revision Champion', bn: 'রিভিশন চ্যাম্পিয়ন', test: (s) => s.revisionsDone >= 25 },
  { id: 'mock-exam', name: 'Mock Exam Finisher', bn: 'মক পরীক্ষা সম্পন্ন', test: (s) => s.examsSubmitted >= 1 },
  { id: 'exam-ready', name: 'Exam Ready', bn: 'পরীক্ষার জন্য প্রস্তুত', test: (s) => s.examBestPercent >= 70 && s.midtermLessonsCompletedPct >= 80 },
];

export function newlyEarnedBadges(stats, alreadyEarnedIds) {
  const have = new Set(alreadyEarnedIds);
  return BADGES.filter((b) => !have.has(b.id) && b.test(stats));
}

// Level curve: level n needs 100·n·(n+1)/2 XP in total.
export function levelFromXp(xp) {
  let level = 0;
  while (100 * ((level + 1) * (level + 2)) / 2 <= xp) level += 1;
  const cur = (100 * level * (level + 1)) / 2;
  const next = (100 * (level + 1) * (level + 2)) / 2;
  return { level: level + 1, into: xp - cur, span: next - cur };
}

export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Current streak = consecutive days with activity ending today or yesterday (no shaming: a missed
// day simply starts a new streak).
export function streakFromDays(dayKeys, now = Date.now()) {
  const set = new Set(dayKeys);
  let d = new Date(now);
  if (!set.has(dayKey(d))) d = new Date(now - 86400000);
  let n = 0;
  while (set.has(dayKey(d))) { n += 1; d = new Date(d.getTime() - 86400000); }
  return n;
}
