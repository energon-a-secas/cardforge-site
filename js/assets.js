// ── Local asset library ──────────────────────────────────────
// IndexedDB store shared across ALL templates: reusable images
// (data URIs) and SVG markup. Survives resets; independent of the
// per-template assets that ship inside exported bundles.

const DB_NAME = 'cardforge';
const STORE = 'assets';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/** Save or replace an asset. kind: 'image' (data URI) | 'svg' (markup). */
export async function putAsset(name, kind, data) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').put({ name, kind, data, addedAt: Date.now() });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

/** All assets, optionally filtered by kind, newest first. */
export async function listAssets(kind) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').getAll();
    req.onsuccess = () => {
      let out = req.result || [];
      if (kind) out = out.filter((a) => a.kind === kind);
      out.sort((a, b) => b.addedAt - a.addedAt);
      resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAsset(name) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').get(name);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAsset(name) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').delete(name);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
