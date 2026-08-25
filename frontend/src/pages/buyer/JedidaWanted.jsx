import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MarketplaceHeader from '../../components/MarketplaceHeader';
import * as wantedApi from '../../api/wantedApi';
import { getUser } from '../../utils/auth';
import WantedNegotiationThread from '../../components/WantedNegotiationThread';

const REQUEST_STATUS_LABELS = {
  submitted: 'Matching you with businesses…',
  matching: 'Matching you with businesses…',
  matched: 'Matched — awaiting quotes',
  quoted: 'Quotes received',
  closed: 'Closed',
  cancelled: 'Cancelled'
};

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function PostForm({ onPosted }) {
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
  const [visibility, setVisibility] = useState('public'); // brief §15
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
      setTitle(''); setDescription(''); setQuantity(''); setUnit('');
      setBudgetMax(''); setDestinationCountry(''); setDestinationCity('');
      setRequiredByDate(''); setSampleRequired(false); setCustomizationRequired(false);
      onPosted(data.wantedRequest);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not post your request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-surface" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Post What I Want</h3>
      <p className="product-card-meta" style={{ marginBottom: 12 }}>
        Describe what you need — Jedida will classify it and invite matching suppliers, manufacturers and farmers to quote.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="field-group">
        <label>What do you need?</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 10,000 school uniforms" />
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

      <div className="field-group" style={{ maxWidth: 260, marginBottom: 12 }}>
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

const B2B_ROLES = ['manufacturer', 'supplier', 'farmer'];

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
      // Contact-protection block (brief §3/§6/§7) surfaces here verbatim.
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

function OfferComparison({ quotes, isOwner, onAccept, onDecline }) {
  const [sortBy, setSortBy] = useState('recommended');
  const [negotiatingId, setNegotiatingId] = useState(null);

  const sorted = [...quotes].sort((a, b) => {
    if (sortBy === 'price') return Number(a.unit_price) - Number(b.unit_price);
    if (sortBy === 'delivery') return (a.lead_time_days ?? Infinity) - (b.lead_time_days ?? Infinity);
    if (sortBy === 'trust') return (b.trust_score ?? -1) - (a.trust_score ?? -1);
    // 'recommended': recommended offer first, then price.
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    return Number(a.unit_price) - Number(b.unit_price);
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h4 style={{ margin: 0 }}>Offers ({quotes.length})</h4>
        {quotes.length > 1 && (
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ maxWidth: 160 }}>
            <option value="recommended">Sort: Recommended</option>
            <option value="price">Sort: Price</option>
            <option value="delivery">Sort: Delivery time</option>
            <option value="trust">Sort: Trust score</option>
          </select>
        )}
      </div>
      {quotes.length === 0 && <div className="empty-state">No offers yet — invited businesses are reviewing your request.</div>}
      {sorted.map((q) => (
        <div key={q.id} className="card-surface" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700 }}>{q.business_name} {q.shop_name ? `— ${q.shop_name}` : ''}</span>
                {q.business_verified && <span className="product-card-badge" title="Verified business">✓ Verified</span>}
                {q.recommended && <span className="product-card-badge" style={{ background: '#F0B429', color: '#1a1a1a' }}>★ Jedida Recommended</span>}
              </div>
              <div className="product-card-meta">
                {q.currency} {q.unit_price} / unit
                {q.moq ? ` · MOQ ${q.moq}` : ''}
                {q.lead_time_days ? ` · ${q.lead_time_days}d delivery` : ''}
                {q.availability ? ` · ${q.availability.replace('_', ' ')}` : ''}
              </div>
              {q.trust_score != null && (
                <div className="product-card-meta">
                  Trust score {Math.round(q.trust_score)}/100
                  {q.completed_orders_count ? ` · ${q.completed_orders_count} completed orders` : ''}
                </div>
              )}
              {q.warranty && <div className="product-card-meta">Warranty: {q.warranty}</div>}
              {q.specifications && <p style={{ fontSize: '0.85rem', marginTop: 4 }}>{q.specifications}</p>}
              {q.expires_at && <div className="product-card-meta">Offer expires {new Date(q.expires_at).toLocaleDateString()}</div>}
              {q.message && <p style={{ fontSize: '0.85rem', marginTop: 4 }}>"{q.message}"</p>}
            </div>
            <span className="product-card-badge">{q.status}</span>
          </div>
          {isOwner && q.status === 'submitted' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-primary" onClick={() => onAccept(q.id)}>Accept</button>
              <button className="btn-link" onClick={() => onDecline(q.id)}>Decline</button>
              <button className="btn-link" onClick={() => setNegotiatingId(negotiatingId === q.id ? null : q.id)}>
                {negotiatingId === q.id ? 'Hide negotiation' : 'Negotiate'}
              </button>
            </div>
          )}
          {negotiatingId === q.id && <WantedNegotiationThread quoteId={q.id} />}
        </div>
      ))}
    </div>
  );
}

function ReplyThread({ requestId, replies, onReplyPosted, isPublicView }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    try {
      await wantedApi.postWantedReply(requestId, body.trim());
      setBody('');
      onReplyPosted();
    } catch (err) {
      // Contact-protection block (brief §3/§6/§7) surfaces here verbatim.
      setError(err.response?.data?.error || 'Could not post your reply.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <h4>Replies ({replies.length})</h4>
      {replies.length === 0 && <div className="empty-state">No replies yet.</div>}
      {replies.map((r) => (
        <div key={r.id} className="card-surface" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{r.author_name}</div>
            <div className="product-card-meta">{timeAgo(r.created_at)}</div>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '0.9rem' }}>{r.body}</p>
          {r.quote_id && <span className="product-card-badge" style={{ marginTop: 6, display: 'inline-block' }}>Offer submitted</span>}
        </div>
      ))}

      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          style={{ flex: 1 }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={isPublicView ? 'Write a reply…' : 'Reply to this request…'}
        />
        <button className="btn-primary" disabled={busy}>{busy ? '…' : 'Reply'}</button>
      </form>
      {error && <div className="alert alert-error" style={{ marginTop: 6 }}>{error}</div>}
      <p className="product-card-meta" style={{ marginTop: 4 }}>
        For your protection, phone numbers, WhatsApp/social handles and off-platform payment requests can't be shared here.
      </p>
    </div>
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
      <p className="product-card-meta">
        Directly invite a verified supplier/manufacturer/farmer to see and quote on this request —
        useful on top of, or instead of, Jedida's automatic matching.
      </p>
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

function RequestDetail({ id, onClose, currentUserId }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await wantedApi.getWantedRequest(id);
      setDetail(data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [id]);

  // Accepting a quote never ends in "coordinate with the business
  // directly" — it hands back a Jedida checkout product so the order,
  // payment and escrow all stay on-platform (see wantedController.js).
  const accept = async (quoteId) => {
    setError('');
    try {
      const { data } = await wantedApi.acceptWantedQuote(quoteId);
      const { productId, quantity } = data.checkout || {};
      if (productId) {
        navigate(`/checkout/${productId}?qty=${quantity || 1}`);
        return;
      }
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not accept this quote.');
    }
  };
  const decline = async (quoteId) => {
    await wantedApi.declineWantedQuote(quoteId);
    load();
  };

  if (loading || !detail) return <div className="empty-state">Loading…</div>;
  const { wantedRequest, matches, quotes, replies } = detail;
  const isOwner = currentUserId && currentUserId === wantedRequest.buyer_id;

  return (
    <div className="card-surface" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{wantedRequest.title}</h3>
        <button className="btn-link" onClick={onClose}>Close</button>
      </div>
      <p className="product-card-meta">{REQUEST_STATUS_LABELS[wantedRequest.status] || wantedRequest.status} · category: {wantedRequest.category}</p>
      <p style={{ fontSize: '0.9rem' }}>{wantedRequest.description}</p>
      {error && <div className="alert alert-error">{error}</div>}

      {isOwner && (
        <>
          <OfferComparison quotes={quotes} isOwner={isOwner} onAccept={accept} onDecline={decline} />

          <h4>Invited businesses ({matches.length})</h4>
          {matches.map((m) => (
            <div key={m.id} className="product-card-meta" style={{ marginBottom: 4 }}>
              {m.business_name} — {m.status} (match score {Math.round(m.match_score)})
              {m.invited_by && ' · invited by you'}
            </div>
          ))}

          <InviteSupplierPanel requestId={id} />
        </>
      )}

      {!isOwner && currentUserId && B2B_ROLES.includes(getUser()?.primary_role) && (
        <OfferForm requestId={id} onSubmitted={load} />
      )}

      <ReplyThread requestId={id} replies={replies || []} onReplyPosted={load} isPublicView={!isOwner} />
    </div>
  );
}

function WantedPostCard({ post, onOpen, onToggleLike }) {
  return (
    <div className="card-surface" style={{ marginBottom: 10, cursor: 'pointer' }} onClick={() => onOpen(post.id)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700 }}>{post.buyer_name}</span>
            {post.buyer_verified && <span className="product-card-badge" title="Verified buyer">✓ Verified</span>}
          </div>
          <div className="product-card-meta">{timeAgo(post.created_at)}</div>
        </div>
        <span className="product-card-badge">WANTED</span>
      </div>

      <h4 style={{ margin: '8px 0 4px' }}>{post.title}</h4>
      <p style={{ fontSize: '0.9rem', margin: '0 0 8px', color: '#5B6760' }}>{post.description}</p>

      <div className="product-card-meta" style={{ marginBottom: 8 }}>
        {post.destination_city ? `${post.destination_city}, ` : ''}{post.destination_country || ''}
        {post.required_by_date ? ` · Before ${new Date(post.required_by_date).toLocaleDateString()}` : ''}
        {post.budget_max ? ` · Budget ${post.currency} ${post.budget_max}` : ''}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <button className="btn-link" onClick={(e) => { e.stopPropagation(); onToggleLike(post.id); }}>
          {post.liked_by_me ? '♥' : '♡'} {post.like_count || 0} Likes
        </button>
        <span className="product-card-meta">💬 {post.reply_count || 0} Replies</span>
        <span className="product-card-meta">🏷 {post.quote_count || 0} Offers</span>
      </div>
    </div>
  );
}

function WantedFeed({ onOpen }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState(null);

  const load = async (cursor) => {
    setLoading(true);
    try {
      const { data } = await wantedApi.getWantedFeed(cursor ? { cursor } : {});
      setPosts((prev) => (cursor ? [...prev, ...data.posts] : data.posts));
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(null); }, []);

  const toggleLike = async (postId) => {
    const { data } = await wantedApi.toggleWantedLike(postId);
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, like_count: data.likeCount, liked_by_me: data.liked } : p)));
  };

  return (
    <div>
      {loading && posts.length === 0 && <div className="empty-state">Loading…</div>}
      {!loading && posts.length === 0 && <div className="empty-state">No public requests yet — be the first to post what you want.</div>}
      {posts.map((p) => <WantedPostCard key={p.id} post={p} onOpen={onOpen} onToggleLike={toggleLike} />)}
      {nextCursor && (
        <button className="btn-link" onClick={() => load(nextCursor)} disabled={loading}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

export default function JedidaWanted() {
  const [tab, setTab] = useState('feed'); // 'feed' | 'mine'
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [showPostForm, setShowPostForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await wantedApi.myWantedRequests();
      setRequests(data.wantedRequests || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (tab === 'mine') load(); }, [tab]);

  // Social engagement only — a like never creates an order or reserves
  // anything (brief §22). Updates the count optimistically from the
  // server's actual returned total.
  const toggleLike = async (e, requestId) => {
    e.stopPropagation();
    const { data } = await wantedApi.toggleWantedLike(requestId);
    setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, like_count: data.likeCount, liked_by_me: data.liked } : r)));
  };

  return (
    <div>
      <MarketplaceHeader />
      <div className="dash-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Jedida Wanted</h2>
            <p style={{ color: '#5B6760', margin: 0 }}>Post what you need — Jedida finds and invites the right businesses to quote.</p>
          </div>
          <button className="btn-primary" onClick={() => setShowPostForm((v) => !v)}>
            {showPostForm ? 'Cancel' : '+ Post Wanted'}
          </button>
        </div>

        {showPostForm && (
          <div style={{ marginTop: 12 }}>
            <PostForm onPosted={() => { setShowPostForm(false); setTab('mine'); load(); }} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, margin: '16px 0', borderBottom: '1px solid #E4E9E6' }}>
          <button
            className={tab === 'feed' ? 'btn-primary' : 'btn-link'}
            style={{ borderRadius: '8px 8px 0 0' }}
            onClick={() => setTab('feed')}
          >
            Wanted Feed
          </button>
          <button
            className={tab === 'mine' ? 'btn-primary' : 'btn-link'}
            style={{ borderRadius: '8px 8px 0 0' }}
            onClick={() => setTab('mine')}
          >
            My Requests
          </button>
        </div>

        {openId && (
          <RequestDetail
            id={openId}
            currentUserId={getUser()?.id}
            onClose={() => { setOpenId(null); if (tab === 'mine') load(); }}
          />
        )}

        {tab === 'feed' && <WantedFeed onOpen={setOpenId} />}

        {tab === 'mine' && (
          <>
            {loading && <div className="empty-state">Loading…</div>}
            {!loading && requests.length === 0 && <div className="empty-state">You haven't posted a request yet.</div>}
            {requests.map((r) => (
              <div key={r.id} className="card-surface" style={{ marginBottom: 10, cursor: 'pointer' }} onClick={() => setOpenId(r.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{r.title}</div>
                    <div className="product-card-meta">
                      {new Date(r.created_at).toLocaleDateString()} · {r.match_count} matched · {r.live_quote_count} quote(s)
                      {r.visibility === 'private' ? ' · Private' : ''}
                    </div>
                  </div>
                  <span className="product-card-badge">{REQUEST_STATUS_LABELS[r.status] || r.status}</span>
                </div>
                <button className="btn-link" style={{ marginTop: 6 }} onClick={(e) => toggleLike(e, r.id)}>
                  {r.liked_by_me ? '♥' : '♡'} {r.like_count || 0}
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
