import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';

// Deliberately simple — a static insertion into Marketplace.jsx rather
// than registered into the dynamic section-layout system
// (DynamicSection/getMarketplaceLayout) that other home sections use.
// That system's schema wasn't verified against real data in this pass, so
// this avoids guessing at it wrong the way a couple of other things in
// this project were guessed and had to be corrected — see
// LIVE_SHOPPING_PHASE1_NOTES.md. A deeper integration (making "Live now"
// a real configurable admin-orderable home section) is future work.
export default function LiveNowStrip() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    client.get('/live/events').then(({ data }) => setEvents(data.events || [])).catch(() => setEvents([]));
  }, []);

  if (events.length === 0) return null;

  return (
    <div className="jd-container" style={{ margin: '16px auto' }}>
      <h3 style={{ margin: '0 0 10px' }}>Live now</h3>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
        {events.map((e) => (
          <Link key={e.id} to={`/live/${e.id}`} style={{ flex: '0 0 auto', width: 220, textDecoration: 'none', color: 'inherit' }}>
            <div className="card-surface" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ height: 120, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', position: 'relative' }}>
                {e.thumbnailUrl ? <img src={e.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'LIVE'}
                <span className="status-chip status-active" style={{ position: 'absolute', top: 8, left: 8 }}>● LIVE</span>
              </div>
              <div style={{ padding: 10 }}>
                <strong style={{ display: 'block', fontSize: '0.9rem' }}>{e.title}</strong>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
