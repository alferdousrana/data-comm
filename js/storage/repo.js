// Repository: every user-data write goes through here so that it is
// (1) saved to IndexedDB first, and (2) queued for cloud sync with a stable key.
import { db } from './db.js';
import { state, setState, uid, DEFAULT_SETTINGS } from '../state.js';
import { XP, xpKey, newlyEarnedBadges, dayKey, BADGES } from '../gamification/rules.js';
import { newItem, review } from '../revision/scheduler.js';

export const SYNCED = ['attempts', 'progress', 'bookmarks', 'notes', 'revision', 'ledger', 'activity', 'settings'];
const docIdOf = (collection, rec) => (collection === 'progress' ? rec.lessonId : collection === 'ledger' ? rec.key.replace(/[\/]/g, '_') : collection === 'activity' ? rec.day : rec.id);

const listeners = new Set();
export const onDataChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (what) => listeners.forEach((fn) => { try { fn(what); } catch (e) { console.error(e); } });

export async function enqueue(collection, record) {
  const docId = docIdOf(collection, record);
  const item = { key: `${collection}/${docId}`, collection, docId, data: record, ts: Date.now(), opId: uid('op'), tries: 0, nextAt: 0, error: '' };
  await db.put('syncQueue', item);
  await refreshPending();
}
export async function refreshPending() { setState({ pendingSync: await db.count('syncQueue') }); }

async function save(store, record, { sync = true } = {}) {
  await db.put(store, record);
  if (sync && SYNCED.includes(store)) await enqueue(store, record);
  emit(store);
  return record;
}

// ---------- settings ----------
export async function loadSettings() {
  const row = await db.get('meta', 'settings');
  const s = { ...DEFAULT_SETTINGS, ...(row?.value || {}) };
  setState({ settings: s });
  return s;
}
export async function saveSettings(patch) {
  const s = { ...state.settings, ...patch, updatedAt: Date.now() };
  setState({ settings: s });
  await db.put('meta', { key: 'settings', value: s });
  try { localStorage.setItem('dca.theme', s.theme); localStorage.setItem('dca.textScale', String(s.textScale)); } catch { /* private mode */ }
  await enqueue('settings', { id: 'settings', ...s });
  emit('settings');
  return s;
}
export const getMeta = async (key) => (await db.get('meta', key))?.value;
export const setMeta = (key, value) => db.put('meta', { key, value });

// ---------- activity / study time ----------
export async function addStudyTime(seconds) {
  if (!(seconds > 0)) return;
  const day = dayKey();
  const row = (await db.get('activity', day)) || { day, seconds: 0, actions: 0 };
  row.seconds += Math.min(seconds, 1800); // ignore implausible gaps (tab left open)
  row.updatedAt = Date.now();
  await save('activity', row);
}
export async function touchActivity() {
  const day = dayKey();
  const row = (await db.get('activity', day)) || { day, seconds: 0, actions: 0 };
  row.actions += 1; row.updatedAt = Date.now();
  await save('activity', row);
}

// ---------- XP + badges (ledger) ----------
export async function awardXp(key, amount, label) {
  if (!state.settings.gamification) return 0;
  const existing = await db.get('ledger', key);
  if (existing) return 0; // never pay twice for the same action key
  await save('ledger', { key, kind: 'xp', amount, label, at: Date.now() });
  return amount;
}
export async function ledger() { return db.all('ledger'); }
export async function totalXp() { return (await ledger()).filter((l) => l.kind === 'xp').reduce((s, l) => s + l.amount, 0); }

export async function checkBadges() {
  if (!state.settings.gamification) return [];
  const stats = await computeStats();
  const earned = (await ledger()).filter((l) => l.kind === 'badge').map((l) => l.badgeId);
  const fresh = newlyEarnedBadges(stats, earned);
  for (const b of fresh) await save('ledger', { key: `badge:${b.id}`, kind: 'badge', badgeId: b.id, at: Date.now(), amount: 0 });
  return fresh;
}

// Exploration markers (e.g. simulator schemes tried) — counted for the Waveform Explorer badge.
export async function recordExplore(what) {
  const key = `explore:${what}`;
  if (await db.get('ledger', key)) return;
  await save('ledger', { key, kind: 'explore', amount: 0, at: Date.now() });
  await checkBadges();
}

// ---------- progress ----------
export async function getProgress(lessonId) { return (await db.get('progress', lessonId)) || { lessonId, completed: false, readPct: 0, quizBest: null, quizAttempts: 0, selfRating: null, updatedAt: 0 }; }
export async function allProgress() { return db.all('progress'); }
export async function updateProgress(lessonId, patch) {
  const p = { ...(await getProgress(lessonId)), ...patch, updatedAt: Date.now() };
  if (patch.readPct != null) p.readPct = Math.max(p.readPct || 0, patch.readPct);
  await save('progress', p);
  return p;
}
export async function completeLesson(lessonId, title) {
  const p = await updateProgress(lessonId, { completed: true, completedAt: Date.now(), readPct: 100 });
  const xp = await awardXp(xpKey.lessonComplete(lessonId), XP.lessonComplete, `Completed: ${title}`);
  await ensureRevisionItem({ kind: 'lesson', refId: lessonId, lessonId, label: title });
  await touchActivity();
  return { p, xp, badges: await checkBadges() };
}

// ---------- attempts (append-only) ----------
export async function saveAttempt(attempt) {
  const a = { id: attempt.id || uid('att'), createdAt: Date.now(), ...attempt };
  const existing = await db.get('attempts', a.id);
  if (existing) return existing; // idempotent: duplicate submit returns the stored one
  await save('attempts', a);
  await touchActivity();
  return a;
}
export async function allAttempts() { return (await db.all('attempts')).sort((a, b) => b.createdAt - a.createdAt); }
export async function getAttempt(id) { return db.get('attempts', id); }

// ---------- bookmarks + notes ----------
export async function toggleBookmark(lessonId, title) {
  const id = `bm_${lessonId}`;
  const ex = await db.get('bookmarks', id);
  if (ex && !ex.deleted) { await save('bookmarks', { ...ex, deleted: true, updatedAt: Date.now() }); return false; }
  await save('bookmarks', { id, lessonId, title, deleted: false, createdAt: ex?.createdAt || Date.now(), updatedAt: Date.now() });
  return true;
}
export async function bookmarks() { return (await db.all('bookmarks')).filter((b) => !b.deleted); }
export async function getNote(lessonId) { return db.get('notes', `note_${lessonId}`); }
export async function saveNote(lessonId, text) {
  const id = `note_${lessonId}`;
  const prev = await db.get('notes', id);
  return save('notes', { id, lessonId, text: String(text).slice(0, 20000), createdAt: prev?.createdAt || Date.now(), updatedAt: Date.now(), history: prev?.history || [] });
}

// ---------- drafts (local only, never synced) ----------
export const saveDraft = (id, value) => db.put('drafts', { id, value, updatedAt: Date.now() });
export const getDraft = async (id) => (await db.get('drafts', id))?.value;
export const deleteDraft = (id) => db.del('drafts', id);

// ---------- revision ----------
export async function ensureRevisionItem({ kind, refId, lessonId, label }) {
  const id = `rv_${kind}_${refId}`;
  const ex = await db.get('revision', id);
  if (ex) return ex;
  return save('revision', newItem({ id, kind, refId, lessonId, label }));
}
export async function reviewItem(id, outcome) {
  const it = await db.get('revision', id);
  if (!it) return null;
  const next = review(it, outcome, { intervals: state.settings.intervals });
  await save('revision', next);
  await awardXp(xpKey.revisionReview(id, dayKey()), XP.revisionReview, 'Revision review');
  return next;
}
export async function markWrong(kind, refId, lessonId, label) {
  const it = await ensureRevisionItem({ kind, refId, lessonId, label });
  return save('revision', review(it, 'wrong', { intervals: state.settings.intervals }));
}
export async function markRight(kind, refId) {
  const it = await db.get('revision', `rv_${kind}_${refId}`);
  if (it) await save('revision', review(it, 'correct', { intervals: state.settings.intervals }));
}
export async function revisionItems() { return db.all('revision'); }

// ---------- stats for dashboard + badges (always computed from stored data) ----------
export async function computeStats() {
  const [attempts, progress, led, activity, revs] = await Promise.all([db.all('attempts'), db.all('progress'), db.all('ledger'), db.all('activity'), db.all('revision')]);
  const mcq = attempts.filter((a) => a.kind === 'mcq-quiz');
  const mcqAnswered = mcq.reduce((s, a) => s + (a.items?.length || 0), 0);
  const mcqCorrect = mcq.reduce((s, a) => s + (a.items?.filter((i) => i.correct).length || 0), 0);
  const written = attempts.filter((a) => a.kind === 'written');
  const numeric = attempts.filter((a) => a.kind === 'numeric');
  const exams = attempts.filter((a) => a.kind === 'exam');
  const byQ = {};
  written.slice().sort((a, b) => a.createdAt - b.createdAt).forEach((w) => { (byQ[w.questionId] ||= []).push(w.result?.percent ?? 0); });
  const improvedRetries = Object.values(byQ).filter((arr) => arr.length > 1 && Math.max(...arr.slice(1)) > arr[0]).length;
  const manifest = state.manifest;
  const midIds = manifest ? manifest.lessons.filter((l) => examScopeOf(l.chapterId) === 'midterm').map((l) => l.id) : [];
  const completedSet = new Set(progress.filter((p) => p.completed).map((p) => p.lessonId));
  let chaptersMastered = 0;
  if (manifest) {
    for (const ch of manifest.chapters) {
      const ls = manifest.lessons.filter((l) => l.chapterId === ch.id && l.status === 'complete');
      if (ls.length && ls.every((l) => completedSet.has(l.id) && (progress.find((p) => p.lessonId === l.id)?.quizBest ?? 0) >= 80)) chaptersMastered += 1;
    }
  }
  return {
    lessonsCompleted: completedSet.size,
    mcqAnswered,
    mcqCorrect,
    mcqAccuracy: mcqAnswered ? Math.round((mcqCorrect / mcqAnswered) * 100) : null,
    writtenSubmitted: written.length,
    writtenAvg: written.length ? Math.round(written.reduce((s, w) => s + (w.result?.percent || 0), 0) / written.length) : null,
    numericAttempted: numeric.length,
    numericCorrect: numeric.filter((n) => n.allCorrect).length,
    schemesExplored: new Set(led.filter((l) => l.key.startsWith('explore:scheme:')).map((l) => l.key)).size,
    scramblingFullMarks: written.filter((w) => w.tags?.includes('scrambling') && w.result?.percent === 100).length,
    improvedRetries,
    chaptersMastered,
    revisionsDone: revs.reduce((s, r) => s + (r.reviews || 0), 0),
    examsSubmitted: exams.length,
    examBestPercent: exams.length ? Math.max(...exams.map((e) => e.percent || 0)) : 0,
    midtermLessonsCompletedPct: midIds.length ? Math.round((midIds.filter((id) => completedSet.has(id)).length / midIds.length) * 100) : 0,
    studySeconds: activity.reduce((s, a) => s + (a.seconds || 0), 0),
    activeDays: activity.filter((a) => (a.actions || 0) > 0 || (a.seconds || 0) >= 60).map((a) => a.day),
    totalQuestions: mcqAnswered + written.length + numeric.length,
    xp: led.filter((l) => l.kind === 'xp').reduce((s, l) => s + l.amount, 0),
    badges: led.filter((l) => l.kind === 'badge').map((l) => l.badgeId),
  };
}

export function examScopeOf(chapterId) {
  const o = state.settings.syllabusOverrides?.[chapterId];
  if (o) return o;
  return state.syllabus?.assignments?.[chapterId]?.scope || 'unassigned';
}

export { BADGES };
