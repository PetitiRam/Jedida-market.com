import { useEffect, useState } from 'react';
import client from '../api/client';

// Silently resolves the buyer's coordinates from the browser's Geolocation
// API — there is no "set your location" field anywhere in the product.
// If the browser doesn't support it, or the person dismisses the native
// permission prompt, we just fall back to the normal (non-proximity) feed;
// nothing in the UI ever asks them to type or pick a location manually.
//
// Coordinates are cached in sessionStorage so we don't re-prompt on every
// page within the same tab, and are pushed to the backend in the
// background (best-effort) so a signed-in buyer's shop-matching stays
// current across sessions too.
export default function useAutoLocation() {
  const [coords, setCoords] = useState(() => {
    try {
      const cached = sessionStorage.getItem('jedida_coords');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [status, setStatus] = useState(coords ? 'ready' : 'idle'); // idle | pending | ready | denied | unsupported

  useEffect(() => {
    if (coords) return; // already have it this session
    if (!navigator.geolocation) { setStatus('unsupported'); return; }

    setStatus('pending');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        setCoords(next);
        setStatus('ready');
        try { sessionStorage.setItem('jedida_coords', JSON.stringify(next)); } catch { /* storage unavailable */ }
        client.patch('/auth/me/location', next).catch(() => {}); // best-effort, ignore if not signed in
      },
      () => setStatus('denied'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 15 * 60 * 1000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { coords, status };
}
