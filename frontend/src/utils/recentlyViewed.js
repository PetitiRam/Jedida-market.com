// Tracks recently viewed products in localStorage.
//
// There's no backend endpoint for this yet, so we keep a small snapshot of
// each product at view-time (title/price/image/shop) instead of just an id
// list — that way the Recently Viewed section can render instantly without
// extra API calls, and still degrades gracefully if a product is later
// removed or changes.

const KEY = 'jedida_recently_viewed';
const MAX_ITEMS = 20;

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — fail silently
  }
}

function snapshot(product) {
  return {
    id: product.id,
    title: product.title,
    price: product.price,
    original_price: product.original_price,
    currency: product.currency,
    images: product.images,
    image_url: product.image_url,
    shop_name: product.shop_name,
    location_city: product.location_city,
    location_country: product.location_country,
    reviews_count: product.reviews_count,
    viewed_at: Date.now(),
  };
}

export function recordProductView(product) {
  if (!product?.id) return;
  const existing = readAll().filter((p) => p.id !== product.id);
  const updated = [snapshot(product), ...existing].slice(0, MAX_ITEMS);
  writeAll(updated);
}

export function getRecentlyViewed({ excludeId } = {}) {
  const items = readAll();
  return excludeId ? items.filter((p) => p.id !== excludeId) : items;
}

export function clearRecentlyViewed() {
  writeAll([]);
}
