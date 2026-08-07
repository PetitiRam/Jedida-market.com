import { useEffect, useRef, useState } from 'react';
import { listPartnerApplications } from '../../api/partnersApi';

// The API & Integration Command Centre is a large, self-contained design
// (its own CSS system distinct from the rest of the admin dashboard), so it's
// served as a static page and embedded here rather than ported line-by-line
// into JSX — porting it would mean re-scoping ~500 lines of CSS with generic
// class names (.shell, .card, .grid, .pill…) against the rest of the app's
// global stylesheet, for no functional benefit. This wrapper's job is just
// to bridge in the one section that has a real backend today: Partner Apps.
//
// Everything else in the page (API Explorer, API Keys, OAuth Applications,
// Webhooks, SDK Downloads, Documentation, Analytics, Logs) has no backend
// yet, so it stays as illustrative demo data until those systems exist.
const IFRAME_SRC = '/admin-tools/api-centre.html';

function toTitle(s) {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminApiCentrePanel() {
  const iframeRef = useRef(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [apps, setApps] = useState(null);
  const [error, setError] = useState('');

  // Fetch the real partner-app list (approved partnerships) using the same
  // authenticated endpoint AdminPartnersPanel uses — the iframe itself never
  // touches the API or the auth token.
  useEffect(() => {
    listPartnerApplications({ status: 'approved', pageSize: 24, sortBy: 'company_name', sortDir: 'asc' })
      .then(({ data }) => {
        const mapped = (data.applications || []).map((a) => ({
          name: a.company_name,
          dev: toTitle(a.partner_type) || 'Partner',
          cat: a.country || '—',
          installs: toTitle(a.status),
          metaLabel: ' status',
          live: a.status === 'approved',
        }));
        setApps(mapped);
      })
      .catch(() => setError('Could not load live partner apps — showing demo data instead.'));
  }, []);

  // Push the real data in once both the iframe has loaded AND the fetch has
  // resolved (whichever finishes second triggers the post).
  useEffect(() => {
    if (!iframeReady || !apps || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({ type: 'jedida:partnerApps', apps }, window.location.origin);
  }, [iframeReady, apps]);

  return (
    <div style={{ height: 'calc(100vh - 160px)', minHeight: 640, borderRadius: 16, overflow: 'hidden', border: '1px solid #23302a' }}>
      {error && (
        <div style={{ padding: '6px 12px', background: '#3a2a10', color: '#E0A93E', fontSize: 13 }}>
          {error}
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="API & Integration Command Centre"
        src={IFRAME_SRC}
        onLoad={() => setIframeReady(true)}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      />
    </div>
  );
}
