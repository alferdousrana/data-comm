// Minimal promise wrapper around IndexedDB. All structured study data lives here.
const DB_NAME = 'datacomm-academy';
const DB_VERSION = 1;

export const STORES = {
  attempts: { keyPath: 'id', indexes: [['lessonId', 'lessonId'], ['kind', 'kind'], ['createdAt', 'createdAt']] },
  progress: { keyPath: 'lessonId' },
  bookmarks: { keyPath: 'id' },
  notes: { keyPath: 'id' },
  revision: { keyPath: 'id', indexes: [['dueAt', 'dueAt']] },
  ledger: { keyPath: 'key' },
  drafts: { keyPath: 'id' },
  activity: { keyPath: 'day' },
  syncQueue: { keyPath: 'key' },
  meta: { keyPath: 'key' },
};

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) { reject(new Error('IndexedDB is not available in this browser')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const os = db.createObjectStore(name, { keyPath: def.keyPath });
        (def.indexes || []).forEach(([idx, path]) => os.createIndex(idx, path));
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database upgrade blocked: close other tabs of this app'));
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    let result;
    Promise.resolve(fn(os)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted (storage may be full)'));
  }));
}
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const db = {
  get: (store, key) => tx(store, 'readonly', (os) => wrap(os.get(key))),
  all: (store) => tx(store, 'readonly', (os) => wrap(os.getAll())),
  put: (store, value) => tx(store, 'readwrite', (os) => wrap(os.put(value))),
  putMany: (store, values) => tx(store, 'readwrite', (os) => Promise.all(values.map((v) => wrap(os.put(v))))),
  del: (store, key) => tx(store, 'readwrite', (os) => wrap(os.delete(key))),
  clear: (store) => tx(store, 'readwrite', (os) => wrap(os.clear())),
  count: (store) => tx(store, 'readonly', (os) => wrap(os.count())),
  byIndex: (store, index, value) => tx(store, 'readonly', (os) => wrap(os.index(index).getAll(value))),
};

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try { return await navigator.storage.estimate(); } catch { return null; }
}
export async function requestPersistence() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}
