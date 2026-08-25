import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as wantedApi from '../../api/wantedApi';
import { getUser } from '../../utils/auth';
import WantedNegotiationThread from '../../components/WantedNegotiationThread';
import WantedSidebar from '../../components/wanted/WantedSidebar';
import JdIcon from '../../components/layout/JdIcons';
import './jedida-wanted.css';

const REQUEST_STATUS_LABELS = {
  submitted: 'Matching you with businesses…',
  matching: 'Matching you with businesses…',
  matched: 'Matched — awaiting quotes',
  quoted: 'Quotes received',
  closed: 'Closed',
  cancelled: 'Cancelled'
};

const B2B_ROLES = ['manufacturer', 'supplier', 'farmer'];

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function initials(name) {
  return (name || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function money(currency, amount) {
  if (amount == null) return null;
  return `${currency || ''} ${Number(amount).toLocaleString()}`.trim();
}

/* ---------------------------------------------------------------------- */
/* Post a new Wanted request (modal form)                                  */
/* ---------------------------------------------------------------------- */

function PostForm({ onPosted, onCancel }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [destinationCountry, setDestinationCountry] = useState('');
  const [destinationCity, setDestinationCity] = useState('');
  const [requiredByDate, setRequiredByDate] = useState('');
  const [sampleRequired, setSampleRequired] = useState(false);
  const [customizationRequired, setCustomizationRequired] = useState(false);
  const [visibility, setVisibility] = useState('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Tell us what you need and describe it.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await wantedApi.createWantedRequest({
        title: title.trim(),
        description: description.trim(),
        quantity: quantity ? Number(quantity) : undefined,
        unit: unit || undefined,
        budgetMax: budgetMax ? Number(budgetMax) : undefined,
        currency,
        destinationCountry: destinationCountry || undefined,
        destinationCity: destinationCity || undefined,
        requiredByDate: requiredByDate || undefined,
        sampleRequired,
        customizationRequired,
        visibility
      });
      onPosted(data.wantedRequest);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not post your request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Post What I Want</h3>
        <button type="button" className="wt-icon-btn" onClick={onCancel} aria-label="Close">✕</button>
      </div>
      <p className="product-card-meta" style={{ marginBottom: 12 }}>
        Describe what you need — Jedida will classify it and invite matching suppliers, manufacturers and farmers to quote.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="field-group">
        <label>What do you need?</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 50 school uniforms" />
      </div>
      <div className="field-group">
        <label>Details</label>
        <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Specs, quality requirements, delivery timeline…" />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="field-group" style={{ flex: 1, minWidth: 120 }}>
          <label>Quantity</label>
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 120 }}>
          <label>Unit</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pieces, tons…" />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 120 }}>
          <label>Max budget</label>
          <input type="number" min="0" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 100 }}>
          <label>Currency</label>
          <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="field-group" style={{ flex: 1, minWidth: 140 }}>
          <label>Destination country</label>
          <input value={destinationCountry} onChange={(e) => setDestinationCountry(e.target.value)} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 140 }}>
          <label>Destination city</label>
          <input value={destinationCity} onChange={(e) => setDestinationCity(e.target.value)} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 140 }}>
          <label>Needed by</label>
          <input type="date" value={requiredByDate} onChange={(e) => setRequiredByDate(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, margin: '8px 0 12px', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
          <input type="checkbox" checked={sampleRequired} onChange={(e) => setSampleRequired(e.target.checked)} />
          I'd like a sample first
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
          <input type="checkbox" checked={customizationRequired} onChange={(e) => setCustomizationRequired(e.target.checked)} />
          I need customization
        </label>
      </div>

      <div className="field-group" style={{ maxWidth: 320, marginBottom: 12 }}>
        <label>Who can see this request?</label>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option value="public">Public — anyone on Jedida can see and reply</option>
          <option value="private">Private — only you and matched suppliers</option>
        </select>
      </div>

      <button className="btn-primary" disabled={busy}>{busy ? 'Posting…' : 'Post request'}</button>
    </form>
  );
}

/* ---------------------------------------------------------------------- */
/* Submit an offer (suppliers/manufacturers/farmers)                       */
/* ---------------------------------------------------------------------- */

function OfferForm({ requestId, onSubmitted }) {
  const [unitPrice, setUnitPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [moq, setMoq] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [availability, setAvailability] = useState('');
  const [warranty, setWarranty] = useState('');
  const [specifications, setSpecifications] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!unitPrice) { setError('Enter a unit price.'); return; }
    setBusy(true);
    setError('');
    try {
      await wantedApi.submitWantedOffer(requestId, {
        unitPrice: Number(unitPrice), currency,
        moq: moq ? Number(moq) : undefined,
        leadTimeDays: leadTimeDays ? Number(leadTimeDays) : undefined,
        availability: availability || undefined,
        warranty: warranty || undefined,
        specifications: specifications || undefined,
        expiresAt: expiresAt || undefined,
        message: message || undefined
      });
      setUnitPrice(''); setMoq(''); setLeadTimeDays(''); setWarranty('');
      setSpecifications(''); setExpiresAt(''); setMessage('');
      onSubmitted();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit your offer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-surface" style={{ marginTop: 12 }}>
      <h4 style={{ marginTop: 0 }}>Submit an Offer</h4>
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="field-group" style={{ flex: 1, minWidth: 100 }}>
          <label>Unit price</label>
          <input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 90 }}>
          <label>Currency</label>
          <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 90 }}>
          <label>MOQ</label>
          <input type="number" min="1" value={moq} onChange={(e) => setMoq(e.target.value)} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 120 }}>
          <label>Lead time (days)</label>
          <input type="number" min="0" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="field-group" style={{ flex: 1, minWidth: 160 }}>
          <label>Availability</label>
          <select value={availability} onChange={(e) => setAvailability(e.target.value)}>
            <option value="">—</option>
            <option value="in_stock">In stock</option>
            <option value="made_to_order">Made to order</option>
            <option value="limited">Limited availability</option>
          </select>
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 160 }}>
          <label>Offer expires</label>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
      </div>
      <div className="field-group">
        <label>Warranty</label>
        <input value={warranty} onChange={(e) => setWarranty(e.target.value)} placeholder="e.g. 12-month warranty" />
      </div>
      <div className="field-group">
        <label>Specifications</label>
        <textarea rows={2} value={specifications} onChange={(e) => setSpecifications(e.target.value)} />
      </div>
      <div className="field-group">
        <label>Message to buyer</label>
        <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit offer'}</button>
    </form>
  );
}

function InviteSupplierPanel({ requestId }) {
  const [search, setSearch] = useState('');
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [invited, setInvited] = useState({});
  const [error, setError] = useState('');

  const runSearch = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await wantedApi.searchEligibleSuppliers(requestId, search);
      setBusinesses(data.businesses || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { runSearch(); }, []);

  const invite = async (businessId) => {
    try {
      await wantedApi.inviteWantedSupplier(requestId, businessId);
      setInvited((prev) => ({ ...prev, [businessId]: true }));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not invite this supplier.');
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <h4>Invite a supplier</h4>
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="Search by company name…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} />
        <button className="btn-secondary" onClick={runSearch} disabled={loading}>{loading ? '…' : 'Search'}</button>
      </div>
      {businesses.length === 0 && !loading && <div className="empty-state">No eligible suppliers found.</div>}
      {businesses.map((b) => (
        <div key={b.business_id} className="card-surface" style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 700 }}>{b.company_name} {b.verified && <span className="product-card-badge">✓ Verified</span>}</div>
            <div className="product-card-meta">{b.business_type} · {b.company_country || 'location not set'}</div>
          </div>
          <button className="btn-primary" disabled={invited[b.business_id]} onClick={() => invite(b.business_id)}>
            {invited[b.business_id] ? 'Invited' : 'Invite'}
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Column 1 — Wanted Feed                                                  */
/* ---------------------------------------------------------------------- */

function FeedColumn({ posts, loading, nextCursor, onLoadMore, selectedId, onSelect, onToggleLike, filterTab, onFilterTab }) {
  return (
    <div className="wt-panel">
      <div className="wt-panel-header">
        <div>
          <div className="wt-panel-title">Wanted Feed</div>
          <p className="wt-panel-sub">Latest requests from buyers</p>
        </div>
        <button type="button" className="wt-icon-btn" aria-label="Search"><JdIcon name="search" size={16} /></button>
      </div>
      <div className="wt-tabs">
        {['All', 'Following', 'Nearby', 'Categories'].map((t) => (
          <button key={t} type="button" className={`wt-tab ${filterTab === t ? 'active' : ''}`} onClick={() => onFilterTab(t)}>{t}</button>
        ))}
      </div>
      <div className="wt-panel-body">
        {loading && posts.length === 0 && <div className="wt-empty">Loading…</div>}
        {!loading && posts.length === 0 && <div className="wt-empty">No public requests yet — be the first to post what you want.</div>}
        {posts.map((p) => (
          <div
            key={p.id}
            className={`wt-post-card ${selectedId === p.id ? 'selected' : ''}`}
            onClick={() => onSelect(p.id)}
          >
            <div className="wt-post-top">
              <div className="wt-post-who">
                <span className="wt-avatar">{initials(p.buyer_name)}</span>
                <div>
                  <div className="wt-post-name">{p.buyer_name}</div>
                  <div className="wt-post-meta">{[p.destination_city, p.destination_country].filter(Boolean).join(', ')}{p.destination_city || p.destination_country ? ' · ' : ''}{timeAgo(p.created_at)}</div>
                </div>
              </div>
              <span className="wt-badge-wanted">WANTED</span>
            </div>
            <div className="wt-post-title">{p.title}</div>
            <p className="wt-post-desc">{p.description}</p>
            <div className="wt-chip-row">
              {p.destination_city && <span className="wt-chip">📍 {p.destination_city}</span>}
              {p.required_by_date && <span className="wt-chip">📅 Before {new Date(p.required_by_date).toLocaleDateString()}</span>}
              {p.budget_max ? <span className="wt-chip">💰 {money(p.currency, p.budget_max)} (Est.)</span> : null}
            </div>
            <div className="wt-stat-row">
              <button type="button" className={p.liked_by_me ? 'liked' : ''} onClick={(e) => { e.stopPropagation(); onToggleLike(p.id); }}>
                {p.liked_by_me ? '♥' : '♡'} {p.like_count || 0}
              </button>
              <span>💬 {p.reply_count || 0}</span>
              <span>{p.quote_count || 0} Offers</span>
            </div>
          </div>
        ))}
        {nextCursor && (
          <button className="btn-link" onClick={onLoadMore} disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Column 2 — Wanted Post detail + replies                                 */
/* ---------------------------------------------------------------------- */

function DetailColumn({ post, detail, loading, currentUserId, onToggleLike, onReplyPosted, onFocusOffer }) {
  const [replyBody, setReplyBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!post) {
    return (
      <div className="wt-panel">
        <div className="wt-panel-header"><div className="wt-panel-title">Wanted Post</div></div>
        <div className="wt-empty">Select a request from the feed to see the full post and replies.</div>
      </div>
    );
  }

  const wantedRequest = detail?.wantedRequest || post;
  const replies = detail?.replies || [];
  const isOwner = currentUserId && wantedRequest.buyer_id && currentUserId === wantedRequest.buyer_id;

  const submitReply = async (e) => {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setBusy(true);
    setError('');
    try {
      await wantedApi.postWantedReply(post.id, replyBody.trim());
      setReplyBody('');
      onReplyPosted();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not post your reply.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wt-panel">
      <div className="wt-panel-header">
        <div className="wt-panel-title">Wanted Post</div>
        <button type="button" className="wt-icon-btn" aria-label="More">⋯</button>
      </div>
      <div className="wt-panel-body" style={{ paddingTop: 6 }}>
        <div className="wt-post-who">
          <span className="wt-avatar">{initials(wantedRequest.buyer_name)}</span>
          <div>
            <div className="wt-post-name">{wantedRequest.buyer_name}</div>
            <div className="wt-post-meta">@{(wantedRequest.buyer_name || 'buyer').toLowerCase().replace(/\s+/g, '')} · {timeAgo(wantedRequest.created_at)}</div>
          </div>
          <span className="wt-badge-wanted" style={{ marginLeft: 'auto' }}>WANTED</span>
        </div>

        <h3 style={{ margin: '12px 0 4px' }}>{wantedRequest.title}</h3>
        <p style={{ fontSize: '0.88rem', color: '#4B4F63' }}>{wantedRequest.description}</p>

        <div className="wt-chip-row">
          {(wantedRequest.destination_city || wantedRequest.destination_country) && (
            <span className="wt-chip">📍 {[wantedRequest.destination_city, wantedRequest.destination_country].filter(Boolean).join(', ')}</span>
          )}
          {wantedRequest.required_by_date && <span className="wt-chip">📅 Before {new Date(wantedRequest.required_by_date).toLocaleDateString()}</span>}
          {wantedRequest.budget_max ? <span className="wt-chip">💰 Budget: {money(wantedRequest.currency, wantedRequest.budget_max)} (Est.)</span> : null}
        </div>

        <p className="product-card-meta">{REQUEST_STATUS_LABELS[wantedRequest.status] || wantedRequest.status}</p>
        {error && <div className="alert alert-error">{error}</div>}
      </div>

      <div className="wt-detail-actions">
        <button type="button">↩ Reply<span>{replies.length}</span></button>
        <button type="button" className={post.liked_by_me ? 'liked' : ''} onClick={() => onToggleLike(post.id)}>
          {post.liked_by_me ? '♥' : '♡'} Like<span>{post.like_count || 0}</span>
        </button>
        <button type="button">⤴ Share</button>
        <button type="button">⌄ Save</button>
      </div>

      <div className="wt-panel-body" style={{ paddingTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '0.85rem' }}>Replies</strong>
          <span className="product-card-meta">Most recent</span>
        </div>
        {loading && <div className="wt-empty">Loading…</div>}
        {!loading && replies.length === 0 && <div className="wt-empty">No replies yet.</div>}
        {replies.map((r) => (
          <div key={r.id} className="wt-reply">
            <span className="wt-avatar" style={{ width: 30, height: 30, fontSize: '0.7rem' }}>{initials(r.author_name)}</span>
            <div style={{ flex: 1 }}>
              <span className="wt-reply-name">{r.author_name}</span>
              <span className="wt-reply-verified"> ✓ Verified Supplier</span>
              <span className="wt-reply-time">{timeAgo(r.created_at)}</span>
              <p className="wt-reply-body">{r.body}</p>
              <div className="wt-reply-row">
                <button type="button" className="btn-link" style={{ padding: 0 }}>Reply</button>
                {r.quote_id && (
                  <button type="button" className="wt-view-offer-btn" onClick={() => onFocusOffer(r.quote_id)}>
                    View Offer
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {isOwner && (
          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: '#6C5CE7', fontWeight: 700 }}>
              Invited businesses & invite a supplier
            </summary>
            {detail?.matches?.map((m) => (
              <div key={m.id} className="product-card-meta" style={{ marginBottom: 4, marginTop: 8 }}>
                {m.business_name} — {m.status} (match score {Math.round(m.match_score)})
              </div>
            ))}
            <InviteSupplierPanel requestId={post.id} />
          </details>
        )}

        {!isOwner && currentUserId && B2B_ROLES.includes(getUser()?.primary_role) && (
          <OfferForm requestId={post.id} onSubmitted={onReplyPosted} />
        )}
      </div>

      <form className="wt-reply-input-row" onSubmit={submitReply}>
        <input
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          placeholder="Write a reply…"
        />
        <button type="submit" className="wt-send-btn" disabled={busy} aria-label="Send">➤</button>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Column 3 — Offers                                                       */
/* ---------------------------------------------------------------------- */

function OffersColumn({ post, quotes, isOwner, likedIds, onToggleLikeOffer, onAccept, onDecline, focusedQuoteId }) {
  const [tab, setTab] = useState('all');
  const [chatQuoteId, setChatQuoteId] = useState(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState(null);

  useEffect(() => {
    if (focusedQuoteId) setSelectedQuoteId(focusedQuoteId);
  }, [focusedQuoteId]);

  if (!post) {
    return (
      <div className="wt-panel">
        <div className="wt-panel-header"><div className="wt-panel-title">Offers</div></div>
        <div className="wt-empty">Offers on the selected request will appear here.</div>
      </div>
    );
  }

  const visible = quotes.filter((q) => {
    if (tab === 'liked') return likedIds.has(q.id);
    return true;
  });

  const chosen = quotes.find((q) => q.id === selectedQuoteId) || null;

  return (
    <div className="wt-panel">
      <div className="wt-panel-header">
        <div>
          <div className="wt-panel-title">Offers ({quotes.length})</div>
        </div>
        <button type="button" className="wt-icon-btn" aria-label="Filter"><JdIcon name="settings" size={16} /></button>
      </div>
      <div className="wt-offer-tabs">
        <button type="button" className={`wt-offer-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All Offers</button>
        <button type="button" className={`wt-offer-tab ${tab === 'liked' ? 'active' : ''}`} onClick={() => setTab('liked')}>
          Liked {likedIds.size > 0 ? likedIds.size : ''}
        </button>
      </div>
      <div className="wt-panel-body">
        {visible.length === 0 && <div className="wt-empty">No offers yet — invited businesses are reviewing this request.</div>}
        {visible.map((q) => (
          <div key={q.id} className={`wt-offer-card ${selectedQuoteId === q.id ? 'selected' : ''}`} onClick={() => setSelectedQuoteId(q.id)}>
            <div className="wt-offer-top">
              <span className="wt-offer-logo">{initials(q.business_name)}</span>
              <div>
                <div className="wt-offer-name">{q.business_name}</div>
                {q.shop_name && <div className="wt-offer-shop">@{q.shop_name.toLowerCase().replace(/\s+/g, '')}</div>}
                {q.business_verified && <div className="wt-offer-verified">✓ Verified Supplier</div>}
              </div>
              {q.recommended && <span className="wt-top-rated" style={{ marginLeft: 'auto' }}>★ Top Rated</span>}
            </div>

            <dl className="wt-offer-grid">
              <dt>Price</dt><dd>{money(q.currency, q.unit_price)}{q.moq ? ` · MOQ ${q.moq}` : ''}</dd>
              <dt>Delivery</dt><dd>{q.lead_time_days ? `${q.lead_time_days} days` : '—'}</dd>
              <dt>Status</dt><dd style={{ textTransform: 'capitalize' }}>{q.status}</dd>
              <dt>Total</dt><dd>{money(q.currency, q.unit_price)}</dd>
            </dl>
            {q.warranty && <div className="product-card-meta">Warranty: {q.warranty}</div>}
            {q.message && <p style={{ fontSize: '0.82rem', margin: '4px 0' }}>"{q.message}"</p>}

            <div className="wt-offer-actions">
              <button
                type="button"
                className="wt-btn-outline"
                onClick={(e) => { e.stopPropagation(); setChatQuoteId(chatQuoteId === q.id ? null : q.id); }}
              >
                Chat
              </button>
              <button
                type="button"
                className={`wt-btn-solid ${likedIds.has(q.id) ? 'liked' : ''}`}
                onClick={(e) => { e.stopPropagation(); onToggleLikeOffer(q.id); }}
              >
                {likedIds.has(q.id) ? '♥ Liked' : '♡ Like'}
              </button>
            </div>

            {chatQuoteId === q.id && (
              <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
                <WantedNegotiationThread quoteId={q.id} />
              </div>
            )}

            {isOwner && q.status === 'submitted' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn-link" onClick={(e) => { e.stopPropagation(); onDecline(q.id); }}>Decline</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {isOwner && (
        <button
          type="button"
          className="wt-proceed-btn"
          disabled={!chosen || chosen.status !== 'submitted'}
          onClick={() => chosen && onAccept(chosen.id)}
        >
          Choose &amp; Proceed to Order ➜
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Bottom feature strip                                                    */
/* ---------------------------------------------------------------------- */

const FEATURES = [
  { icon: 'messages', title: 'Real-time Replies', desc: 'Suppliers reply instantly with their best offers.' },
  { icon: 'quality', title: 'Like & Compare', desc: 'Like your favorite offers and compare easily.' },
  { icon: 'help', title: 'Chat & Negotiate', desc: 'Discuss details, negotiate and get the best value.' },
  { icon: 'settings', title: 'Safe & Trusted', desc: 'All suppliers are vetted by Jedida.' },
  { icon: 'shipments', title: 'Order with Confidence', desc: 'Confirm, pay and get it delivered on time.' }
];

function FeatureStrip() {
  return (
    <div className="wt-feature-strip">
      {FEATURES.map((f) => (
        <div className="wt-feature" key={f.title}>
          <span className="wt-feature-icon"><JdIcon name={f.icon} size={16} /></span>
          <div>
            <div className="wt-feature-title">{f.title}</div>
            <div className="wt-feature-desc">{f.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Top-level page                                                          */
/* ---------------------------------------------------------------------- */

export default function JedidaWanted() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentUserId = getUser()?.id;

  const [posts, setPosts] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState(null);
  const [filterTab, setFilterTab] = useState('All');

  const [selectedId, setSelectedId] = useState(searchParams.get('id') || null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showPostForm, setShowPostForm] = useState(false);
  const [likedOfferIds, setLikedOfferIds] = useState(new Set());
  const [focusedQuoteId, setFocusedQuoteId] = useState(null);

  const loadFeed = async (cursor) => {
    setFeedLoading(true);
    try {
      const { data } = await wantedApi.getWantedFeed(cursor ? { cursor } : {});
      setPosts((prev) => (cursor ? [...prev, ...data.posts] : data.posts));
      setNextCursor(data.nextCursor);
      if (!cursor && !selectedId && data.posts?.length) {
        setSelectedId(data.posts[0].id);
      }
    } finally {
      setFeedLoading(false);
    }
  };
  useEffect(() => { loadFeed(null); /* eslint-disable-next-line */ }, []);

  const loadDetail = async (id) => {
    if (!id) return;
    setDetailLoading(true);
    try {
      const { data } = await wantedApi.getWantedRequest(id);
      setDetail(data);
    } finally {
      setDetailLoading(false);
    }
  };
  useEffect(() => { loadDetail(selectedId); }, [selectedId]);

  const toggleLike = async (postId) => {
    const { data } = await wantedApi.toggleWantedLike(postId);
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, like_count: data.likeCount, liked_by_me: data.liked } : p)));
  };

  const toggleLikeOffer = (quoteId) => {
    setLikedOfferIds((prev) => {
      const next = new Set(prev);
      if (next.has(quoteId)) next.delete(quoteId); else next.add(quoteId);
      return next;
    });
  };

  const accept = async (quoteId) => {
    try {
      const { data } = await wantedApi.acceptWantedQuote(quoteId);
      const { productId, quantity } = data.checkout || {};
      if (productId) {
        navigate(`/checkout/${productId}?qty=${quantity || 1}`);
        return;
      }
      loadDetail(selectedId);
    } catch (err) {
      // Errors here are non-fatal to the layout; the offer card status
      // still reflects the last successful load.
    }
  };
  const decline = async (quoteId) => {
    await wantedApi.declineWantedQuote(quoteId);
    loadDetail(selectedId);
  };

  const selectedPost = useMemo(
    () => posts.find((p) => p.id === selectedId) || (detail?.wantedRequest ? { ...detail.wantedRequest, liked_by_me: false } : null),
    [posts, selectedId, detail]
  );
  const isOwner = currentUserId && selectedPost && currentUserId === (detail?.wantedRequest?.buyer_id || selectedPost.buyer_id);
  const quotes = detail?.quotes || [];

  return (
    <div className="wt-shell">
      <WantedSidebar onPostWanted={() => setShowPostForm(true)} />

      <div className="wt-main">
        <div className="wt-topbar">
          <h1 className="wt-title">JEDIDA <span className="accent">WANTED</span></h1>
          <p className="wt-subtitle">Post what you need. Get replies, likes and choose the best offer.</p>
          <div className="wt-steps">
            <span><span className="dot">✓</span> Post</span>
            <span><span className="dot">✓</span> Get Replies</span>
            <span><span className="dot">✓</span> Like &amp; Compare</span>
            <span><span className="dot">✓</span> Chat &amp; Negotiate</span>
            <span><span className="dot">✓</span> Order with Confidence</span>
          </div>
        </div>

        <div className="wt-columns">
          <FeedColumn
            posts={posts}
            loading={feedLoading}
            nextCursor={nextCursor}
            onLoadMore={() => loadFeed(nextCursor)}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onToggleLike={toggleLike}
            filterTab={filterTab}
            onFilterTab={setFilterTab}
          />

          <DetailColumn
            post={selectedPost}
            detail={detail}
            loading={detailLoading}
            currentUserId={currentUserId}
            onToggleLike={toggleLike}
            onReplyPosted={() => loadDetail(selectedId)}
            onFocusOffer={setFocusedQuoteId}
          />

          <OffersColumn
            post={selectedPost}
            quotes={quotes}
            isOwner={isOwner}
            likedIds={likedOfferIds}
            onToggleLikeOffer={toggleLikeOffer}
            onAccept={accept}
            onDecline={decline}
            focusedQuoteId={focusedQuoteId}
          />
        </div>

        <FeatureStrip />
      </div>

      {showPostForm && (
        <div className="wt-modal-backdrop" onClick={() => setShowPostForm(false)}>
          <div className="wt-modal" onClick={(e) => e.stopPropagation()}>
            <PostForm
              onCancel={() => setShowPostForm(false)}
              onPosted={(req) => {
                setShowPostForm(false);
                loadFeed(null);
                if (req?.id) setSelectedId(req.id);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
