// frontend/src/utils/posOfflineQueue.js
//
// Minimal IndexedDB wrapper for queueing POS sales rung up while offline.
// Deliberately not using a library — this is small enough (one object
// store, three operations) that a dependency would cost more than it
// saves, and it means nothing here depends on npm install having run
// successfully in whatever environment this gets built in.
//
// Ported from Jedida-market_com_phase11 (see INTEGRATION_DECISION_REPORT.md
// section 4) — the adopted POS foundation had no offline queue at all.
//
// A queued sale is exactly the body createSale (posController.js) expects,
// plus the clientSaleUuid it requires for offline-safe retry — the backend
// treats a resynced sale with a UUID it's already seen as a no-op replay,
// not a duplicate. See schema_phase98_pos_sale_idempotency.sql / posController.js.

const DB_NAME = 'jedida_pos';
const DB_VERSION = 2;
const STORE = 'pending_sales';
const PRODUCT_STORE = 'product_cache';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clientSaleUuid' });
      }
      if (!db.objectStoreNames.contains(PRODUCT_STORE)) {
        db.createObjectStore(PRODUCT_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueSale(sale) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...sale, queuedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listQueuedSales() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedSale(clientSaleUuid) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(clientSaleUuid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Local product catalog cache — refreshed whenever the register is online,
// so barcode/name search still works when it isn't. Whole-catalog
// replace-on-refresh (not incremental sync) is deliberate: a shop's
// product count is small enough that this is simpler and can't drift into
// a stale partial state.
export async function replaceProductCache(products) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRODUCT_STORE, 'readwrite');
    const store = tx.objectStore(PRODUCT_STORE);
    store.clear();
    for (const p of products) store.put(p);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function searchProductCache(queryText) {
  const db = await openDb();
  const all = await new Promise((resolve, reject) => {
    const tx = db.transaction(PRODUCT_STORE, 'readonly');
    const req = tx.objectStore(PRODUCT_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const q = queryText.trim().toLowerCase();
  if (!q) return [];
  return all.filter((p) =>
    p.title?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode === queryText.trim()
  ).slice(0, 20);
}

export async function findProductByBarcodeInCache(barcode) {
  const db = await openDb();
  const all = await new Promise((resolve, reject) => {
    const tx = db.transaction(PRODUCT_STORE, 'readonly');
    const req = tx.objectStore(PRODUCT_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return all.find((p) => p.barcode === barcode) || null;
}
