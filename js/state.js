// Global app state with a tiny pub/sub. Persistent data lives in IndexedDB;
// this object only mirrors what the UI needs right now.

export const DEFAULT_SETTINGS = {
  theme: 'system',            // 'light' | 'dark' | 'system'
  uiLang: 'bn',               // interface labels: 'bn' | 'en'
  textScale: 1,               // 0.9 – 1.3
  dailyGoalMin: 30,
  examDates: { midterm: '', final: '' },
  sound: false,
  animations: true,
  gamification: true,
  streaks: true,
  intervals: [0, 1, 3, 7, 14],
  syllabusOverrides: {},      // chapterId -> 'midterm' | 'final' | 'additional'
  aiEndpoint: '',             // optional secure server endpoint (never an API key)
  onboarded: false,
  updatedAt: 0,
};

const listeners = new Set();
export const state = {
  settings: { ...DEFAULT_SETTINGS },
  user: null,                 // { uid, email, displayName } when signed in
  firebaseReady: false,
  firebaseConfigured: false,
  online: navigator.onLine,
  pendingSync: 0,
  syncStatus: 'idle',         // idle | syncing | error | offline | signed-out
  syncError: '',
  manifest: null,
  syllabus: null,
};

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } });
}
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function uid(prefix = '') {
  const rnd = crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return prefix ? `${prefix}_${rnd}` : rnd;
}

export const t = (bn, en) => (state.settings.uiLang === 'en' ? en : bn);
