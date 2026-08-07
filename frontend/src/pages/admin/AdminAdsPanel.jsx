import { useEffect, useMemo, useState } from 'react';
import client, { normalizeError } from '../../api/client';
import MediaUploader from '../../components/MediaUploader';

const PLACEMENTS = [
  { value: 'hero', label: 'Hero banner (homepage top)', ratio: '21 / 9', hint: 'Wide banner — 1600×680px works best.' },
  { value: 'deals', label: 'Deals strip', ratio: '4 / 3', hint: 'Square-ish card — 800×600px works best.' },
  { value: 'sidebar', label: 'Sidebar spot (Live Ads)', ratio: '16 / 10', hint: 'Shown in the homepage right rail — 640×400px works best.' },
  { value: 'category', label: 'Category page', ratio: '21 / 9', hint: 'Wide banner shown at the top of a category page.' },
  { value: 'header_strip', label: 'Header announcement strip', ratio: '32 / 5', hint: 'Thin strip — image is optional, text carries this one.' },
];

const emptyForm = {
  title: '', subtitle: '', imageUrl: '', videoUrl: '', linkUrl: '', ctaText: '', badgeText: '',
  placement: 'hero', priority: 0, startsAt: '', endsAt: '', targetCategory: ''
};

function isValidUrl(value) {
  if (!value) return true; // optional fields are allowed to be empty
  try {
    // Accept absolute URLs and root-relative in-app paths ("/marketplace?...")
    if (value.startsWith('/')) return true;
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function StatPill({ label, value }) {
  return (
    <span className="jd-ads-stat-pill">
      <strong>{value}</strong> {label}
    </span>
  );
}

export default function AdminAdsPanel() {
  const [ads, setAds] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [filterPlacement, setFilterPlacement] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [listError, setListError] = useState('');
  const [successFlash, setSuccessFlash] = useState('');

  const load = async () => {
    try {
      setListError('');
      const { data } = await client.get('/admin/ads', { params: filterPlacement ? { placement: filterPlacement } : {} });
      setAds(data.ads || []);
    } catch (err) {
      setListError(normalizeError(err).friendlyMessage);
    }
  };
  useEffect(() => { load(); }, [filterPlacement]);

  const activePlacement = PLACEMENTS.find((p) => p.value === form.placement) || PLACEMENTS[0];

  const urlErrors = useMemo(() => {
    const errs = {};
    if (!isValidUrl(form.linkUrl)) errs.linkUrl = 'Enter a full link (https://…) or an in-app path starting with /.';
    return errs;
  }, [form.linkUrl]);

  const canSubmit = Boolean(form.title.trim()) && Boolean(form.imageUrl) && Object.keys(urlErrors).length === 0 && !submitting;

  const create = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitError('');
    setSubmitting(true);
    try {
      await client.post('/admin/ads', form);
      setForm(emptyForm);
      setSuccessFlash('Ad published and live in that placement.');
      setTimeout(() => setSuccessFlash(''), 4000);
      await load();
    } catch (err) {
      setSubmitError(normalizeError(err).friendlyMessage);
    } finally {
      setSubmitting(false);
    }
  };
  const remove = async (id) => {
    try {
      await client.delete(`/admin/ads/${id}`);
      load();
    } catch (err) {
      setListError(normalizeError(err).friendlyMessage);
    }
  };
  const toggleActive = async (ad) => {
    try {
      await client.patch(`/admin/ads/${ad.id}`, { active: !ad.active });
      load();
    } catch (err) {
      setListError(normalizeError(err).friendlyMessage);
    }
  };

  const totals = ads.reduce((acc, a) => ({
    clicks: acc.clicks + (a.clicks_count || 0),
    impressions: acc.impressions + (a.impressions_count || 0),
    live: acc.live + (a.active ? 1 : 0),
  }), { clicks: 0, impressions: 0, live: 0 });

  return (
    <div className="jd-ads-admin">
      <div className="card-surface" style={{ marginBottom: 20 }}>
        <h4>Publish a new ad</h4>
        <p className="product-card-meta" style={{ marginBottom: 16 }}>
          Ads are placement-aware — hero banners rotate at the top of the homepage, deal-strip ads
          appear in the Deals section, sidebar ads power the homepage &ldquo;Live Ads&rdquo; box, and
          header-strip ads show as an announcement bar. Schedule with a start/end date and order
          with priority (higher shows first).
        </p>

        <div className="jd-ads-form-grid">
          <form onSubmit={create}>
            <div className="field-row">
              <div className="field-group"><label>Title</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Top Deals. Unbeatable Prices." required /></div>
              <div className="field-group"><label>Subtitle (optional)</label><input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="One short supporting line" /></div>
            </div>

            <div className="field-group">
              <label>Placement</label>
              <select value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value })}>
                {PLACEMENTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <p className="jd-ads-hint">{activePlacement.hint}</p>
            </div>

            <div className="field-group">
              <label>Ad image</label>
              <div className="jd-ads-uploader-row">
                <MediaUploader label="Upload ad image" accept="image/*" onUploaded={(m) => setForm((f) => ({ ...f, imageUrl: m.url }))} />
                <span className="jd-ads-uploader-or">or</span>
                <input
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="Paste an image URL"
                  style={{ flex: 1, minWidth: 180 }}
                />
              </div>
              {!form.imageUrl && (
                <p className="jd-ads-hint">An image is required to publish. Recommended shape for this placement: {activePlacement.ratio.replace(' / ', ':')}.</p>
              )}
            </div>

            <div className="field-group">
              <label>Ad video (optional)</label>
              <div className="jd-ads-uploader-row">
                <MediaUploader label="Upload ad video" accept="video/*" onUploaded={(m) => setForm((f) => ({ ...f, videoUrl: m.url }))} />
                <span className="jd-ads-uploader-or">or</span>
                <input
                  value={form.videoUrl}
                  onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                  placeholder="Paste an mp4/webm/mov URL"
                  style={{ flex: 1, minWidth: 180 }}
                />
                {form.videoUrl && (
                  <button type="button" className="btn-link" onClick={() => setForm((f) => ({ ...f, videoUrl: '' }))}>Remove video</button>
                )}
              </div>
              <p className="jd-ads-hint">
                {form.videoUrl
                  ? 'This ad will autoplay (muted, looping) on hero, deals and sidebar spots. The image above is still used as its poster frame.'
                  : 'Leave blank for a static image ad. Supported on hero, deals and sidebar placements.'}
              </p>
            </div>

            <div className="field-row">
              <div className="field-group">
                <label>Link URL (optional)</label>
                <input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="https://... or /marketplace?category=electronics" />
                {urlErrors.linkUrl && <p className="jd-ads-error-text">{urlErrors.linkUrl}</p>}
              </div>
              <div className="field-group"><label>Button text (optional)</label><input value={form.ctaText} onChange={(e) => setForm({ ...form, ctaText: e.target.value })} placeholder="e.g. Shop now" /></div>
            </div>

            <div className="field-row">
              <div className="field-group"><label>Badge text (optional)</label><input value={form.badgeText} onChange={(e) => setForm({ ...form, badgeText: e.target.value })} placeholder="e.g. Limited time" /></div>
              <div className="field-group"><label>Priority</label><input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></div>
              <div className="field-group"><label>Target category (optional)</label>
                <input value={form.targetCategory} onChange={(e) => setForm({ ...form, targetCategory: e.target.value })} placeholder="e.g. electronics" />
              </div>
            </div>

            <div className="field-row">
              <div className="field-group"><label>Starts at (optional)</label><input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></div>
              <div className="field-group"><label>Ends at (optional)</label><input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></div>
            </div>

            {submitError && <p className="jd-ads-error-text" style={{ marginBottom: 8 }}>{submitError}</p>}
            {successFlash && <p className="jd-ads-success-text" style={{ marginBottom: 8 }}>{successFlash}</p>}

            <button className="btn-primary" disabled={!canSubmit}>
              {submitting ? 'Publishing…' : 'Publish ad'}
            </button>
            {!form.title.trim() && <p className="product-card-meta" style={{ marginTop: 6 }}>Add a title to enable publishing.</p>}
            {form.title.trim() && !form.imageUrl && (
              <p className="product-card-meta" style={{ marginTop: 6 }}>
                Add an image (upload or paste a URL) to enable publishing.
              </p>
            )}
          </form>

          <div className="jd-ads-preview">
            <span className="jd-ads-preview-label">Live preview — {activePlacement.label}</span>
            <div className="jd-ads-preview-frame" style={{ aspectRatio: activePlacement.ratio }}>
              {form.videoUrl ? (
                <video src={form.videoUrl} poster={form.imageUrl || undefined} autoPlay muted loop playsInline />
              ) : form.imageUrl ? (
                <img src={form.imageUrl} alt="Ad preview" />
              ) : (
                <div className="jd-ads-preview-empty">Image preview appears here</div>
              )}
              <div className="jd-ads-preview-scrim" />
              <div className="jd-ads-preview-caption">
                {form.badgeText && <span className="jd-ads-preview-badge">{form.badgeText}</span>}
                <strong>{form.title || 'Ad title'}</strong>
                {form.subtitle && <span>{form.subtitle}</span>}
                {form.ctaText && <span className="jd-ads-preview-cta">{form.ctaText}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {listError && (
        <p className="jd-ads-error-text" style={{ marginBottom: 12 }}>{listError}</p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h4 style={{ margin: 0 }}>All ads</h4>
          <StatPill label="live" value={totals.live} />
          <StatPill label="views" value={totals.impressions} />
          <StatPill label="clicks" value={totals.clicks} />
        </div>
        <select value={filterPlacement} onChange={(e) => setFilterPlacement(e.target.value)}>
          <option value="">All placements</option>
          {PLACEMENTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {ads.length === 0 ? <div className="empty-state">No ads published yet.</div> : ads.map((a) => (
        <div key={a.id} className="card-surface jd-ads-row">
          <div className="jd-ads-row-info">
            {a.image_url && (
              <div className="jd-ads-row-thumb-wrap">
                <img src={a.image_url} alt={a.title} className="jd-ads-row-thumb" />
                {a.video_url && <span className="jd-ads-row-video-badge">▶ Video</span>}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                {a.title}
                <span className={`jd-ads-status-dot ${a.active ? 'is-live' : ''}`}>{a.active ? 'Live' : 'Paused'}</span>
              </div>
              <div className="product-card-meta">
                {PLACEMENTS.find((p) => p.value === a.placement)?.label || a.placement} · priority {a.priority}
                {' · '}{a.clicks_count || 0} clicks · {a.impressions_count || 0} views
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button className="btn-link" onClick={() => toggleActive(a)}>{a.active ? 'Pause' : 'Activate'}</button>
            <button className="btn-link" onClick={() => remove(a.id)}>Remove</button>
          </div>
        </div>
      ))}
    </div>
  );
}
