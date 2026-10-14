// Loads bundled course data with relative URLs (works under /repo-name/ on GitHub Pages).
// The service worker caches what has been fetched; downloadForOffline() pre-fetches everything.
import { state, setState } from '../state.js';

export const CONTENT_CACHE = 'dca-content-v1';
const base = new URL('../../data/', import.meta.url);
const memo = new Map();

async function getJson(rel) {
  if (memo.has(rel)) return memo.get(rel);
  const p = fetch(new URL(rel, base)).then((r) => {
    if (!r.ok) throw new Error(`Could not load ${rel} (${r.status})`);
    return r.json();
  });
  memo.set(rel, p);
  p.catch(() => memo.delete(rel));
  return p;
}

export async function loadManifest() {
  const [manifest, syllabus] = await Promise.all([getJson('course-manifest.json'), getJson('syllabus.json')]);
  setState({ manifest, syllabus });
  return manifest;
}
export const loadLesson = (id) => getJson(`lessons/${encodeURIComponent(id)}.json`);
export const loadBank = (id) => getJson(`question-banks/${encodeURIComponent(id)}.json`);
export const loadExamPaper = (id) => getJson(`question-banks/exam-${encodeURIComponent(id)}.json`);

export function lessonMeta(id) { return state.manifest?.lessons.find((l) => l.id === id); }
export function chapterOf(id) { return state.manifest?.chapters.find((c) => c.id === id); }

export async function findWritten(qid) {
  for (const l of state.manifest.lessons.filter((x) => x.status === 'complete')) {
    const b = await loadBank(l.id);
    const w = b.written.find((q) => q.id === qid);
    if (w) return { ...w, lessonId: l.id };
  }
  return null;
}

export function allContentUrls() {
  const m = state.manifest;
  const urls = ['course-manifest.json', 'syllabus.json', 'question-banks/exam-midterm-summer-2026.json'];
  for (const l of m.lessons) {
    urls.push(`lessons/${l.id}.json`);
    if (l.status === 'complete') urls.push(`question-banks/${l.id}.json`);
  }
  return urls.map((u) => new URL(u, base).href);
}

export async function downloadForOffline(onProgress) {
  if (!('caches' in self)) throw new Error('This browser does not support offline caching.');
  const cache = await caches.open(CONTENT_CACHE);
  const urls = allContentUrls();
  let done = 0;
  const failed = [];
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      await cache.put(u, res);
    } catch { failed.push(u); }
    done += 1;
    onProgress?.(done, urls.length);
  }
  // Also ask the service worker to make sure the app shell is cached.
  navigator.serviceWorker?.controller?.postMessage({ type: 'precache-shell' });
  return { total: urls.length, failed };
}

export async function offlineStatus() {
  if (!('caches' in self)) return { available: new Set(), total: 0 };
  const cache = await caches.open(CONTENT_CACHE);
  const keys = new Set((await cache.keys()).map((r) => r.url));
  const available = new Set(state.manifest.lessons.filter((l) => keys.has(new URL(`lessons/${l.id}.json`, base).href)).map((l) => l.id));
  return { available, total: state.manifest.lessons.length };
}
