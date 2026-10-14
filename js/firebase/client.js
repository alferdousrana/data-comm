// Firebase is loaded lazily from the pinned CDN build only when a config exists.
// Every function degrades gracefully: if Firebase is not configured or not reachable,
// the app keeps working in local (guest) mode.
import { firebaseConfig, appCheckSiteKey, FIREBASE_SDK_VERSION } from './config.js';
import { state, setState } from '../state.js';

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
let fb = null; // { app, auth, db, mod: {app, auth, firestore} }
let initPromise = null;

export const isConfigured = () => !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

export function initFirebase() {
  if (!isConfigured()) { setState({ firebaseConfigured: false }); return Promise.resolve(null); }
  setState({ firebaseConfigured: true });
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const [appMod, authMod, fsMod] = await Promise.all([
        import(`${CDN}/firebase-app.js`),
        import(`${CDN}/firebase-auth.js`),
        import(`${CDN}/firebase-firestore.js`),
      ]);
      const app = appMod.initializeApp(firebaseConfig);
      if (appCheckSiteKey) {
        try {
          const ac = await import(`${CDN}/firebase-app-check.js`);
          ac.initializeAppCheck(app, { provider: new ac.ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
        } catch (e) { console.warn('App Check not initialised', e); }
      }
      const auth = authMod.getAuth(app);
      let firestore;
      try {
        // Firestore's own offline cache is complementary; our IndexedDB queue is the source of truth.
        firestore = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }) });
      } catch { firestore = fsMod.getFirestore(app); }
      fb = { app, auth, db: firestore, mod: { app: appMod, auth: authMod, fs: fsMod } };
      setState({ firebaseReady: true });
      return fb;
    } catch (e) {
      console.warn('Firebase failed to load (offline or blocked):', e);
      initPromise = null; // allow retry on reconnect
      setState({ firebaseReady: false, syncError: 'Firebase could not be loaded. You can keep studying offline.' });
      return null;
    }
  })();
  return initPromise;
}

export async function onAuth(cb) {
  const f = await initFirebase();
  if (!f) return () => {};
  return f.mod.auth.onAuthStateChanged(f.auth, (u) => cb(u ? { uid: u.uid, email: u.email, displayName: u.displayName || u.email } : null));
}

export async function signInGoogle() {
  const f = await initFirebase();
  if (!f) throw new Error('Firebase is not configured or not reachable.');
  const provider = new f.mod.auth.GoogleAuthProvider();
  try { return await f.mod.auth.signInWithPopup(f.auth, provider); }
  catch (e) {
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') return f.mod.auth.signInWithRedirect(f.auth, provider);
    throw e;
  }
}
export async function signInEmail(email, password, create = false) {
  const f = await initFirebase();
  if (!f) throw new Error('Firebase is not configured or not reachable.');
  return create ? f.mod.auth.createUserWithEmailAndPassword(f.auth, email, password) : f.mod.auth.signInWithEmailAndPassword(f.auth, email, password);
}
export async function signOutUser() { const f = await initFirebase(); if (f) await f.mod.auth.signOut(f.auth); }
export async function idToken() { const f = await initFirebase(); return f?.auth.currentUser ? f.auth.currentUser.getIdToken() : null; }

// Firestore helpers scoped to users/{uid}/{collection}/{docId}
export async function putUserDoc(collection, docId, data) {
  const f = await initFirebase();
  if (!f || !state.user) throw new Error('not-signed-in');
  const { doc, setDoc, serverTimestamp } = f.mod.fs;
  await setDoc(doc(f.db, 'users', state.user.uid, collection, docId), { ...sanitize(data), _syncedAt: serverTimestamp() }, { merge: true });
}
export async function listUserDocs(collection) {
  const f = await initFirebase();
  if (!f || !state.user) throw new Error('not-signed-in');
  const { collection: col, getDocs } = f.mod.fs;
  const snap = await getDocs(col(f.db, 'users', state.user.uid, collection));
  return snap.docs.map((d) => { const v = d.data(); delete v._syncedAt; return v; });
}
export async function ensureUserProfile() {
  const f = await initFirebase();
  if (!f || !state.user) return;
  const { doc, setDoc, serverTimestamp } = f.mod.fs;
  await setDoc(doc(f.db, 'users', state.user.uid), { displayName: state.user.displayName || '', lastSeenAt: serverTimestamp() }, { merge: true });
}

// Firestore rejects undefined values and very deep objects; strip them.
function sanitize(v, depth = 0) {
  if (depth > 12) return null;
  if (Array.isArray(v)) return v.map((x) => sanitize(x, depth + 1));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined && typeof x !== 'function') o[k] = sanitize(x, depth + 1);
    return o;
  }
  return Number.isNaN(v) ? null : v;
}
