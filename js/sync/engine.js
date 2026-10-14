// Offline-first synchronisation.
// * Every write is stored locally first and queued (repo.enqueue) with a stable key.
// * The queue is flushed on startup, on reconnect, on sign-in, when the tab becomes
//   visible, and on a timer while the app is open. Background sync is NOT assumed.
// * Writes are idempotent: Firestore doc id = record id, setDoc(merge).
// * Failed writes stay in the queue with exponential backoff; local data is never deleted.
// Conflict policy (documented in README):
//   attempts  — append-only, union by id (never overwritten)
//   progress  — field merge: completed = OR, readPct/quizBest = max, latest updatedAt wins for the rest
//   notes     — last-writer-wins by updatedAt; the losing text is kept in note.history
//   bookmarks, revision, settings, activity — last-writer-wins by updatedAt (activity: max of counters)
//   ledger    — union by key (XP never awarded twice)
import { db } from '../storage/db.js';
import { state, setState } from '../state.js';
import { putUserDoc, listUserDocs, ensureUserProfile, initFirebase } from '../firebase/client.js';
import { refreshPending, SYNCED, getMeta, setMeta, enqueue } from '../storage/repo.js';

let running = false;
let timer = null;
const BACKOFF_MAX = 5 * 60 * 1000;

export function startSyncLoop() {
  window.addEventListener('online', () => { setState({ online: true }); flush(); });
  window.addEventListener('offline', () => setState({ online: false, syncStatus: 'offline' }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flush(); });
  clearInterval(timer);
  timer = setInterval(flush, 30000);
  flush();
}

export async function flush() {
  await refreshPending();
  if (running) return;
  if (!state.user) { setState({ syncStatus: state.firebaseConfigured ? 'signed-out' : 'local' }); return; }
  if (!navigator.onLine) { setState({ syncStatus: 'offline' }); return; } // hint only; real check is the write itself
  running = true;
  setState({ syncStatus: 'syncing', syncError: '' });
  try {
    const f = await initFirebase();
    if (!f) throw new Error('Firebase not reachable');
    const now = Date.now();
    const items = (await db.all('syncQueue')).filter((i) => (i.nextAt || 0) <= now).sort((a, b) => a.ts - b.ts);
    let failures = 0;
    for (const item of items) {
      try {
        // Drawings stay on the device (Firestore documents are size-limited).
        const { drawing, ...data } = item.data || {};
        await withTimeout(putUserDoc(item.collection, item.docId, data), 15000);
        // Remove only if no newer write for the same key arrived meanwhile.
        const current = await db.get('syncQueue', item.key);
        if (current && current.opId === item.opId) await db.del('syncQueue', item.key);
      } catch (e) {
        failures += 1;
        const tries = (item.tries || 0) + 1;
        const current = await db.get('syncQueue', item.key);
        if (current && current.opId === item.opId) {
          await db.put('syncQueue', { ...item, tries, nextAt: Date.now() + Math.min(BACKOFF_MAX, 2000 * 2 ** tries), error: String(e?.code || e?.message || e) });
        }
        if (isFatal(e)) break;
      }
    }
    await refreshPending();
    setState({ syncStatus: failures ? 'error' : 'idle', syncError: failures ? `${failures} item(s) will retry automatically.` : '' });
  } catch (e) {
    setState({ syncStatus: 'error', syncError: String(e?.message || e) });
  } finally {
    running = false;
  }
}

const isFatal = (e) => ['permission-denied', 'unauthenticated'].includes(e?.code);
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// Called after sign-in. Returns { needsConsent, boundUid } when guest data exists.
export async function onSignedIn(user, { uploadGuestData } = {}) {
  const bound = await getMeta('boundUid');
  if (bound && bound !== user.uid) {
    // This device's data belongs to another account: do not upload it silently.
    return { conflictAccount: true };
  }
  if (!bound) {
    const hasLocal = (await db.count('attempts')) + (await db.count('progress')) + (await db.count('notes')) > 0;
    if (hasLocal && uploadGuestData === undefined) return { needsConsent: true };
    if (hasLocal && uploadGuestData) await enqueueAllLocal();
    await setMeta('boundUid', user.uid);
  }
  try { await ensureUserProfile(); await pullAndMerge(); } catch (e) { console.warn('Pull failed; will retry later', e); }
  await flush();
  return { ok: true };
}

async function enqueueAllLocal() {
  for (const coll of SYNCED) {
    if (coll === 'settings') { const s = await getMeta('settings'); if (s) await enqueue('settings', { id: 'settings', ...s }); continue; }
    for (const rec of await db.all(coll)) await enqueue(coll, rec);
  }
}

export async function pullAndMerge() {
  for (const coll of SYNCED) {
    let remote;
    try { remote = await listUserDocs(coll); } catch (e) { if (isFatal(e)) throw e; continue; }
    if (coll === 'settings') {
      const r = remote[0];
      const local = await getMeta('settings');
      if (r && (!local || (r.updatedAt || 0) > (local.updatedAt || 0))) {
        const { id, ...rest } = r;
        await setMeta('settings', rest);
        setState({ settings: { ...state.settings, ...rest } });
      }
      continue;
    }
    for (const r of remote) {
      const key = coll === 'progress' ? r.lessonId : coll === 'ledger' ? r.key : coll === 'activity' ? r.day : r.id;
      if (key == null) continue;
      const local = await db.get(coll, key);
      const merged = mergeRecord(coll, local, r);
      if (merged) await db.put(coll, merged);
    }
  }
}

export function mergeRecord(coll, local, remote) {
  const merged = mergeRaw(coll, local, remote);
  // Identical result → nothing to write (avoids needless sync traffic).
  return merged && local && JSON.stringify(merged) === JSON.stringify(local) ? null : merged;
}

function mergeRaw(coll, local, remote) {
  if (!local) return remote;
  switch (coll) {
    case 'attempts': case 'ledger': return null; // union: keep local, nothing to overwrite
    case 'progress': return {
      ...((remote.updatedAt || 0) > (local.updatedAt || 0) ? { ...local, ...remote } : { ...remote, ...local }),
      completed: !!(local.completed || remote.completed),
      readPct: Math.max(local.readPct || 0, remote.readPct || 0),
      quizBest: Math.max(local.quizBest ?? -1, remote.quizBest ?? -1) < 0 ? null : Math.max(local.quizBest ?? 0, remote.quizBest ?? 0),
      quizAttempts: Math.max(local.quizAttempts || 0, remote.quizAttempts || 0),
    };
    case 'notes': {
      if ((remote.updatedAt || 0) <= (local.updatedAt || 0)) return null;
      const history = [...(remote.history || []), ...(local.text && local.text !== remote.text ? [{ text: local.text, updatedAt: local.updatedAt, reason: 'replaced by newer version from another device' }] : [])].slice(-10);
      return { ...remote, history };
    }
    case 'activity': return { ...local, seconds: Math.max(local.seconds || 0, remote.seconds || 0), actions: Math.max(local.actions || 0, remote.actions || 0), updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0) };
    default: return (remote.updatedAt || 0) > (local.updatedAt || 0) ? remote : null;
  }
}
