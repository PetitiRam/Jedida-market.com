import { useEffect, useMemo, useRef, useState } from 'react';
import client, { normalizeError } from '../../api/client';
import '../../styles/command-center.css';

/* -------------------------------------------------------------------------
 * Jedida Marketplace Operations Command Center
 * ---------------------------------------------------------------------
 * Every number and record in this screen comes from the real chat-v2 API
 * (routes/chatV2.js) — admin conversations, participant trust profiles,
 * business summaries, escalations, risk users and reports. Nothing here
 * is a placeholder figure. Actions (send, escalate, toggle AI, pin,
 * archive, resolve, review) all call the matching real endpoint.
 * ------------------------------------------------------------------- */

const ROLE_META = {
  buyer: { label: 'Buyer', tone: 'sky' },
  seller: { label: 'Seller', tone: 'lime' },
  farmer: { label: 'Farmer', tone: 'lime' },
  manufacturer: { label: 'Manufacturer', tone: 'purple' },
  supplier: { label: 'Supplier', tone: 'amber' },
  dropshipper: { label: 'Dropshipper', tone: 'sky' },
  delivery: { label: 'Delivery Partner', tone: 'amber' },
};

function roleMeta(role) {
  return ROLE_META[role] || { label: role || 'User', tone: 'slate' };
}

function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function money(amount, currency) {
  if (amount == null) return '—';
  const n = Number(amount);
  return `${currency || ''} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`.trim();
}

function Pill({ tone = 'slate', children }) {
  return <span className={`jcc-pill jcc-pill-${tone}`}>{children}</span>;
}

/* ----------------------------------------------------------------------- */

export default function JedidaCommandCenter() {
  const [admin, setAdmin] = useState(null);

  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [participant, setParticipant] = useState(null);
  const [bizSummary, setBizSummary] = useState(null);

  const [escalations, setEscalations] = useState([]);
  const [riskUsers, setRiskUsers] = useState([]);
  const [reports, setReports] = useState([]);

  const [nav, setNav] = useState('inbox'); // inbox | escalations | risk | reports
  const [roleFilter, setRoleFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateArea, setEscalateArea] = useState('customer_support');
  const [escalateReason, setEscalateReason] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const scrollRef = useRef(null);
  const toastTimer = useRef(null);

  const showToast = (message, tone = 'ok') => {
    setToast({ message, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };
  const showError = (err) => showToast(normalizeError(err).friendlyMessage, 'error');

  /* ---- initial load ---- */
  useEffect(() => {
    client.get('/auth/me').then(({ data }) => setAdmin(data.user)).catch(() => {});
    loadConversations();
    loadEscalations();
    loadRiskUsers();
    loadReports();
  }, []);

  function loadConversations() {
    setConvLoading(true);
    client.get('/chat-v2/admin/conversations')
      .then(({ data }) => {
        const list = data.conversations || [];
        setConversations(list);
        if (!selectedId && list.length) setSelectedId(list[0].id);
      })
      .catch(showError)
      .finally(() => setConvLoading(false));
  }
  function loadEscalations() {
    client.get('/chat-v2/admin/escalations').then(({ data }) => setEscalations(data.escalations || [])).catch(() => {});
  }
  function loadRiskUsers() {
    client.get('/chat-v2/admin/risk-users').then(({ data }) => setRiskUsers(data.users || [])).catch(() => {});
  }
  function loadReports() {
    client.get('/chat-v2/admin/reports').then(({ data }) => setReports(data.reports || [])).catch(() => {});
  }

  /* ---- conversation detail load ---- */
  useEffect(() => {
    if (!selectedId) return;
    setMsgLoading(true);
    setParticipant(null);
    setBizSummary(null);
    Promise.all([
      client.get(`/chat-v2/${selectedId}/messages`),
      client.get(`/chat-v2/${selectedId}/participant`),
      client.get(`/chat-v2/${selectedId}/business-summary`),
    ])
      .then(([m, p, b]) => {
        setMessages(m.data.messages || []);
        setParticipant(p.data.participant || null);
        setBizSummary(b.data || null);
      })
      .catch(showError)
      .finally(() => setMsgLoading(false));
  }, [selectedId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const selectedConv = useMemo(() => conversations.find((c) => c.id === selectedId) || null, [conversations, selectedId]);

  const roleOptions = useMemo(() => {
    const roles = new Set(conversations.map((c) => c.primary_role).filter(Boolean));
    return Array.from(roles);
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    let list = conversations;
    if (roleFilter !== 'all') list = list.filter((c) => c.primary_role === roleFilter);
    if (search.trim()) list = list.filter((c) => (c.full_name || '').toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [conversations, roleFilter, search]);

  /* ---- actions ---- */
  async function sendMessage() {
    if (!text.trim() || !selectedId) return;
    setSending(true);
    try {
      const { data } = await client.post(`/chat-v2/${selectedId}/messages`, { body: text.trim() });
      setMessages((prev) => [...prev, data.message, ...(data.aiMessage ? [data.aiMessage] : [])]);
      setText('');
    } catch (err) {
      showError(err);
    } finally {
      setSending(false);
    }
  }

  async function toggleAi() {
    if (!selectedConv) return;
    try {
      const { data } = await client.post(`/chat-v2/${selectedId}/ai-toggle`, { enabled: !selectedConv.ai_enabled });
      setConversations((prev) => prev.map((c) => (c.id === selectedId ? { ...c, ai_enabled: data.conversation.ai_enabled } : c)));
      showToast(data.conversation.ai_enabled ? 'AI handling enabled' : 'AI handling turned off — human only');
    } catch (err) { showError(err); }
  }

  async function togglePin() {
    if (!selectedConv) return;
    try {
      await client.post(`/chat-v2/${selectedId}/pin`, { pinned: !selectedConv.pinned });
      setConversations((prev) => prev.map((c) => (c.id === selectedId ? { ...c, pinned: !c.pinned } : c)));
      showToast(selectedConv.pinned ? 'Unpinned' : 'Pinned to top');
    } catch (err) { showError(err); }
  }

  async function toggleArchive() {
    if (!selectedConv) return;
    try {
      await client.post(`/chat-v2/${selectedId}/archive`, { archived: !selectedConv.archived });
      setConversations((prev) => prev.map((c) => (c.id === selectedId ? { ...c, archived: !c.archived } : c)));
      showToast(selectedConv.archived ? 'Restored from archive' : 'Archived');
    } catch (err) { showError(err); }
  }

  async function submitEscalate() {
    if (!selectedId) return;
    try {
      await client.post(`/chat-v2/${selectedId}/escalate`, { area: escalateArea, reason: escalateReason || undefined });
      showToast('Escalated to ' + escalateArea.replace('_', ' '));
      setEscalateOpen(false);
      setEscalateReason('');
      loadEscalations();
      setConversations((prev) => prev.map((c) => (c.id === selectedId ? { ...c, escalated: true } : c)));
    } catch (err) { showError(err); }
  }

  async function resolveEscalation(id) {
    try {
      await client.post(`/chat-v2/admin/escalations/${id}/resolve`);
      showToast('Escalation resolved');
      loadEscalations();
    } catch (err) { showError(err); }
  }

  async function reviewReport(id, status) {
    try {
      await client.post(`/chat-v2/admin/reports/${id}/status`, { status });
      showToast(`Report marked ${status}`);
      loadReports();
    } catch (err) { showError(err); }
  }

  /* ---- derived stats (all real) ---- */
  const stats = [
    { icon: '💬', label: 'Open Conversations', value: conversations.length, tone: 'lime' },
    { icon: '🤖', label: 'AI Handling', value: conversations.filter((c) => c.ai_enabled).length, tone: 'sky' },
    { icon: '🚨', label: 'Open Escalations', value: escalations.length, tone: 'rose' },
    { icon: '⚠️', label: 'High-Risk Users', value: riskUsers.length, tone: 'amber' },
    { icon: '🚩', label: 'Pending Reports', value: reports.filter((r) => r.status === 'pending').length, tone: 'rose' },
    { icon: '📌', label: 'Pinned', value: conversations.filter((c) => c.pinned).length, tone: 'lime' },
  ];

  return (
    <div className="jcc">
      {/* ---------- top bar ---------- */}
      <div className="jcc-topbar">
        <div className="jcc-brand">
          <div className="jcc-brand-mark">🌿</div>
          <div>
            <div className="jcc-brand-title">Jedida</div>
            <div className="jcc-brand-sub">Operations Command Center</div>
          </div>
        </div>
        <div className="jcc-search">
          🔎
          <input placeholder="Search conversations by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="jcc-live-pill"><span className="jcc-live-dot" /> Live</span>
          <button className="jcc-ghost-btn" onClick={() => { loadConversations(); loadEscalations(); loadRiskUsers(); loadReports(); showToast('Refreshed'); }}>↻ Refresh</button>
          <div className="jcc-admin">
            <div className="jcc-admin-avatar">{initials(admin?.full_name)}</div>
            <div>
              <div className="jcc-admin-name">{admin?.full_name || 'Admin'}</div>
              <div className="jcc-admin-role">{(admin?.admin_role || 'admin').replace('_', ' ')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- stats ---------- */}
      <div className="jcc-stats jcc-scroll">
        {stats.map((s) => (
          <div className="jcc-stat" key={s.label}>
            <div className="jcc-stat-icon" style={{ background: `var(--jcc-${s.tone}-dim)` }}>{s.icon}</div>
            <div>
              <div className="jcc-stat-value">{s.value}</div>
              <div className="jcc-stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="jcc-body" style={{ position: 'relative' }}>
        {/* ---------- sidebar ---------- */}
        <div className="jcc-sidebar">
          <div className="jcc-sidebar-label">Operations</div>
          <button className={`jcc-nav-item ${nav === 'inbox' ? 'active' : ''}`} onClick={() => setNav('inbox')}>
            💬 <span>Conversations</span> <span className="jcc-nav-badge">{conversations.length}</span>
          </button>
          <button className={`jcc-nav-item ${nav === 'escalations' ? 'active' : ''}`} onClick={() => setNav('escalations')}>
            🚨 <span>Escalations</span> <span className="jcc-nav-badge">{escalations.length}</span>
          </button>
          <button className={`jcc-nav-item ${nav === 'risk' ? 'active' : ''}`} onClick={() => setNav('risk')}>
            ⚠️ <span>Risk Users</span> <span className="jcc-nav-badge">{riskUsers.length}</span>
          </button>
          <button className={`jcc-nav-item ${nav === 'reports' ? 'active' : ''}`} onClick={() => setNav('reports')}>
            🚩 <span>Reports</span> <span className="jcc-nav-badge">{reports.length}</span>
          </button>

          {roleOptions.length > 0 && (
            <>
              <div className="jcc-sidebar-label">Channels</div>
              {roleOptions.map((r) => {
                const meta = roleMeta(r);
                const count = conversations.filter((c) => c.primary_role === r).length;
                return (
                  <button key={r} className={`jcc-nav-item ${nav === 'inbox' && roleFilter === r ? 'active' : ''}`} onClick={() => { setNav('inbox'); setRoleFilter(r); }}>
                    <span style={{ fontSize: 10 }}>●</span> <span>{meta.label}s</span> <span className="jcc-nav-badge">{count}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* ---------- INBOX + CHAT + RIGHT PANEL ---------- */}
        {nav === 'inbox' && (
          <>
            <div className="jcc-inbox">
              <div className="jcc-inbox-head">
                <div className="jcc-inbox-title">Conversations</div>
                <div className="jcc-chips jcc-scroll">
                  <button className={`jcc-chip ${roleFilter === 'all' ? 'active' : ''}`} onClick={() => setRoleFilter('all')}>All</button>
                  {roleOptions.map((r) => (
                    <button key={r} className={`jcc-chip ${roleFilter === r ? 'active' : ''}`} onClick={() => setRoleFilter(r)}>{roleMeta(r).label}</button>
                  ))}
                </div>
              </div>
              <div className="jcc-inbox-list jcc-scroll">
                {convLoading && <div className="jcc-empty">Loading conversations…</div>}
                {!convLoading && filteredConversations.length === 0 && <div className="jcc-empty">No conversations match this filter.</div>}
                {filteredConversations.map((c) => {
                  const meta = roleMeta(c.primary_role);
                  const active = c.id === selectedId;
                  return (
                    <button key={c.id} className={`jcc-conv ${active ? 'active' : ''}`} onClick={() => setSelectedId(c.id)}>
                      <div className="jcc-avatar">{initials(c.full_name)}{!c.escalated && <span className="jcc-avatar-dot" />}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {c.pinned && <span style={{ marginRight: 4 }}>📌</span>}
                          <span className="jcc-conv-name">{c.full_name}</span>
                          <span className="jcc-conv-time">{timeAgo(c.created_at)}</span>
                        </div>
                        <div className="jcc-conv-meta">
                          <Pill tone={meta.tone}>{meta.label}</Pill>
                          {c.escalated && <Pill tone="rose">Escalated</Pill>}
                          {c.ai_enabled && <Pill tone="sky">AI</Pill>}
                        </div>
                        <div className="jcc-conv-msg">Conversation opened {new Date(c.created_at).toLocaleDateString()}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="jcc-chat">
              {!selectedConv && <div className="jcc-chat-empty">Select a conversation to open the thread.</div>}
              {selectedConv && (
                <>
                  <div className="jcc-chat-head">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="jcc-avatar">{initials(selectedConv.full_name)}</div>
                      <div>
                        <div style={{ fontWeight: 700, color: '#fff', fontSize: 13.5 }}>{selectedConv.full_name}</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                          <Pill tone={roleMeta(selectedConv.primary_role).tone}>{roleMeta(selectedConv.primary_role).label}</Pill>
                          {participant && <span style={{ fontSize: 11, color: 'var(--jcc-text-dim)' }}>Trust {participant.trustScore}%</span>}
                          {participant?.isOnline && <span style={{ fontSize: 11, color: 'var(--jcc-lime)' }}>● online</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className={`jcc-ghost-btn ${selectedConv.ai_enabled ? 'on' : ''}`} onClick={toggleAi}>🤖 AI {selectedConv.ai_enabled ? 'On' : 'Off'}</button>
                      <button className={`jcc-ghost-btn ${selectedConv.pinned ? 'on' : ''}`} onClick={togglePin}>📌 {selectedConv.pinned ? 'Pinned' : 'Pin'}</button>
                      <button className="jcc-ghost-btn" onClick={toggleArchive}>{selectedConv.archived ? '📤 Restore' : '🗄 Archive'}</button>
                    </div>
                  </div>

                  <div className="jcc-messages jcc-scroll" ref={scrollRef}>
                    {msgLoading && <div className="jcc-empty">Loading messages…</div>}
                    {!msgLoading && messages.length === 0 && <div className="jcc-empty">No messages yet in this conversation.</div>}
                    {messages.map((m) => {
                      const mine = admin && m.sender_id === admin.id;
                      const isAi = m.is_ai;
                      const blocked = m.moderation_status === 'blocked';
                      return (
                        <div key={m.id} className={`jcc-msg-row ${mine ? 'mine' : isAi ? 'ai' : ''}`}>
                          <div>
                            <div className={`jcc-bubble ${mine ? 'mine' : isAi ? 'ai-bubble' : 'theirs'} ${blocked ? 'blocked' : ''}`}>
                              {isAi && <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 3 }}>🤖 AI ASSISTANT</div>}
                              {m.body}
                              {m.moderation_status === 'masked' && <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>⚑ contact info masked by moderation</div>}
                            </div>
                            <div className="jcc-msg-time" style={{ textAlign: mine ? 'right' : 'left' }}>{fmtTime(m.created_at)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="jcc-composer">
                    <div className="jcc-composer-box">
                      <textarea
                        rows={2}
                        placeholder="Reply as Jedida admin…"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      />
                      <div className="jcc-composer-row">
                        <button className="jcc-ghost-btn" onClick={() => setEscalateOpen(true)}>⤴ Escalate</button>
                        <button className="jcc-send-btn" disabled={sending || !text.trim()} onClick={sendMessage}>
                          {sending ? 'Sending…' : '➤ Send'}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ---------- right panel ---------- */}
            {selectedConv && (
              <div className="jcc-right jcc-scroll">
                <div className="jcc-right-head">✨ Case Information</div>
                <div className="jcc-right-body">
                  <div className="jcc-card jcc-card-glow">
                    <div className="jcc-section-label">🧑 Customer Profile</div>
                    {!participant && <div className="jcc-empty-hint">Loading profile…</div>}
                    {participant && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <div className="jcc-avatar" style={{ height: 42, width: 42 }}>{initials(participant.fullName)}</div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#fff', fontSize: 13.5 }}>{participant.fullName}</div>
                            <Pill tone={participant.isVerified ? 'lime' : 'slate'}>{participant.isVerified ? 'Verified' : 'Unverified'}</Pill>
                          </div>
                        </div>
                        <div className="jcc-row"><span className="jcc-row-label">Trust Score</span><span className="jcc-row-value">{participant.trustScore}%</span></div>
                        <div className="jcc-bar"><div className="jcc-bar-fill" style={{ width: `${participant.trustScore}%` }} /></div>
                        <div className="jcc-row" style={{ marginTop: 8 }}><span className="jcc-row-label">Role</span><span className="jcc-row-value">{roleMeta(participant.role).label}</span></div>
                        <div className="jcc-row"><span className="jcc-row-label">Member Since</span><span className="jcc-row-value">{participant.memberSince ? new Date(participant.memberSince).toLocaleDateString() : '—'}</span></div>
                        <div className="jcc-row"><span className="jcc-row-label">Online</span><span className="jcc-row-value">{participant.isOnline ? 'Yes' : 'No'}</span></div>
                      </>
                    )}
                  </div>

                  {participant?.isBusiness && (
                    <div className="jcc-card">
                      <div className="jcc-section-label">🏢 Business</div>
                      {participant.shop ? (
                        <>
                          <div className="jcc-row"><span className="jcc-row-label">Shop</span><span className="jcc-row-value">{participant.shop.name}</span></div>
                          <div className="jcc-row"><span className="jcc-row-label">Subscription</span><span className="jcc-row-value">{participant.shop.subscriptionActive ? 'Active' : 'Inactive'}</span></div>
                          <div className="jcc-row"><span className="jcc-row-label">Rating</span><span className="jcc-row-value">{participant.rating.average ? `${participant.rating.average} ★ (${participant.rating.count})` : 'No reviews yet'}</span></div>
                          <div className="jcc-row"><span className="jcc-row-label">Completed Orders</span><span className="jcc-row-value">{participant.completedOrders}</span></div>
                        </>
                      ) : <div className="jcc-empty-hint">No shop found for this business account.</div>}
                    </div>
                  )}

                  <div className="jcc-card">
                    <div className="jcc-section-label">📦 Orders, Payments &amp; Delivery</div>
                    {!bizSummary && <div className="jcc-empty-hint">Loading…</div>}
                    {bizSummary && bizSummary.orders?.length === 0 && <div className="jcc-empty-hint">No orders between these two parties yet.</div>}
                    {bizSummary && bizSummary.orders?.slice(0, 4).map((o) => (
                      <div key={o.id} className="jcc-row">
                        <span className="jcc-row-label">{o.product_title || 'Order'} ×{o.quantity}</span>
                        <span className="jcc-row-value">{money(o.total_amount, o.currency)}</span>
                      </div>
                    ))}
                    {bizSummary?.payments?.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {bizSummary.payments.slice(0, 2).map((p) => (
                          <div key={p.id} className="jcc-row"><span className="jcc-row-label">Payment · {p.method}</span><Pill tone={p.status === 'completed' ? 'lime' : 'amber'}>{p.status}</Pill></div>
                        ))}
                      </div>
                    )}
                    {bizSummary?.deliveries?.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {bizSummary.deliveries.slice(0, 2).map((d) => (
                          <div key={d.id} className="jcc-row"><span className="jcc-row-label">Delivery</span><Pill tone="sky">{d.status}</Pill></div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="jcc-section-label">⚡ Admin Actions</div>
                    <div className="jcc-tool-grid">
                      <button className="jcc-tool-btn" onClick={() => setEscalateOpen(true)}>⤴ Escalate Case</button>
                      <button className="jcc-tool-btn" onClick={toggleAi}>🤖 {selectedConv.ai_enabled ? 'Disable AI' : 'Enable AI'}</button>
                      <button className="jcc-tool-btn" onClick={togglePin}>📌 {selectedConv.pinned ? 'Unpin' : 'Pin'}</button>
                      <button className="jcc-tool-btn" onClick={toggleArchive}>🗄 {selectedConv.archived ? 'Restore' : 'Archive'}</button>
                    </div>
                    <div className="jcc-empty-hint" style={{ marginTop: 8 }}>Account freezes, refunds and verification requests are handled from the Users, Orders and Withdrawals tabs.</div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---------- escalations view ---------- */}
        {nav === 'escalations' && (
          <div className="jcc-list-view jcc-scroll">
            <div className="jcc-list-head">
              <div>
                <div className="jcc-list-title">Open Escalations</div>
                <div className="jcc-list-sub">Conversations flagged for human follow-up, across all areas.</div>
              </div>
            </div>
            {escalations.length === 0 && <div className="jcc-empty-hint">No open escalations right now.</div>}
            {escalations.map((e) => (
              <div className="jcc-list-item" key={e.id}>
                <div className="jcc-list-item-icon" style={{ background: 'var(--jcc-rose-dim)' }}>🚨</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>{e.area?.replace('_', ' ')}</div>
                  <div style={{ fontSize: 12, color: 'var(--jcc-text-dim)' }}>{e.reason}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--jcc-text-faint)', marginTop: 2 }}>{new Date(e.created_at).toLocaleString()}</div>
                </div>
                <button className="jcc-ghost-btn on" onClick={() => resolveEscalation(e.id)}>✓ Resolve</button>
              </div>
            ))}
          </div>
        )}

        {/* ---------- risk users view ---------- */}
        {nav === 'risk' && (
          <div className="jcc-list-view jcc-scroll">
            <div className="jcc-list-head">
              <div>
                <div className="jcc-list-title">High-Risk Users</div>
                <div className="jcc-list-sub">Users with an elevated chat risk score from the moderation engine.</div>
              </div>
            </div>
            {riskUsers.length === 0 && <div className="jcc-empty-hint">No elevated-risk users right now.</div>}
            {riskUsers.map((u) => (
              <div className="jcc-list-item" key={u.id}>
                <div className="jcc-avatar">{initials(u.full_name)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>{u.full_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--jcc-text-dim)' }}>{u.email} · {roleMeta(u.primary_role).label}</div>
                </div>
                <Pill tone="rose">Risk {u.chat_risk_score}</Pill>
              </div>
            ))}
          </div>
        )}

        {/* ---------- reports view ---------- */}
        {nav === 'reports' && (
          <div className="jcc-list-view jcc-scroll">
            <div className="jcc-list-head">
              <div>
                <div className="jcc-list-title">Message Reports</div>
                <div className="jcc-list-sub">Messages flagged by users for review.</div>
              </div>
            </div>
            {reports.length === 0 && <div className="jcc-empty-hint">No reports on file.</div>}
            {reports.map((r) => (
              <div className="jcc-list-item" key={r.id}>
                <div className="jcc-list-item-icon" style={{ background: 'var(--jcc-amber-dim)' }}>🚩</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>{r.reason}</div>
                  <div style={{ fontSize: 12, color: 'var(--jcc-text-dim)' }}>{r.message_body || r.details || 'No message text'}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--jcc-text-faint)', marginTop: 2 }}>Reported by {r.reporter_name} · {new Date(r.created_at).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Pill tone={r.status === 'pending' ? 'amber' : r.status === 'dismissed' ? 'slate' : 'lime'}>{r.status}</Pill>
                  {r.status === 'pending' && (
                    <>
                      <button className="jcc-ghost-btn" onClick={() => reviewReport(r.id, 'dismissed')}>Dismiss</button>
                      <button className="jcc-ghost-btn on" onClick={() => reviewReport(r.id, 'actioned')}>Action</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---------- floating AI insight panel ---------- */}
        <button className="jcc-fab" onClick={() => setAiOpen(!aiOpen)}>{aiOpen ? '✕' : '✨'}</button>
        {aiOpen && (
          <div className="jcc-fab-panel">
            <div className="jcc-fab-head">
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>🤖 AI Operations</div>
              <div style={{ fontSize: 11, color: 'var(--jcc-text-dim)', marginTop: 2 }}>Live figures from the moderation &amp; AI assistant engine.</div>
            </div>
            <div className="jcc-fab-body">
              <div className="jcc-row"><span className="jcc-row-label">AI-handled conversations</span><span className="jcc-row-value">{conversations.filter((c) => c.ai_enabled).length}</span></div>
              <div className="jcc-row"><span className="jcc-row-label">Open escalations</span><span className="jcc-row-value">{escalations.length}</span></div>
              <div className="jcc-row"><span className="jcc-row-label">High-risk users</span><span className="jcc-row-value">{riskUsers.length}</span></div>
              {selectedConv && (
                <button className="jcc-ghost-btn on" style={{ marginTop: 6 }} onClick={toggleAi}>
                  {selectedConv.ai_enabled ? 'Turn off AI for this chat' : 'Turn on AI for this chat'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ---------- escalate modal ---------- */}
        {escalateOpen && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40 }}>
            <div className="jcc-card jcc-card-glow" style={{ width: 320 }}>
              <div className="jcc-section-label">⤴ Escalate Conversation</div>
              <label style={{ fontSize: 11.5, color: 'var(--jcc-text-dim)' }}>Area</label>
              <select value={escalateArea} onChange={(e) => setEscalateArea(e.target.value)} style={{ width: '100%', marginTop: 4, marginBottom: 10, padding: 8, borderRadius: 8, background: 'var(--jcc-surface)', border: '1px solid var(--jcc-border)', color: 'var(--jcc-text)' }}>
                <option value="customer_support">Customer Support</option>
                <option value="business">Business</option>
                <option value="delivery">Delivery</option>
                <option value="security">Security</option>
              </select>
              <label style={{ fontSize: 11.5, color: 'var(--jcc-text-dim)' }}>Reason</label>
              <textarea rows={3} value={escalateReason} onChange={(e) => setEscalateReason(e.target.value)} placeholder="Why is this being escalated?" style={{ width: '100%', marginTop: 4, marginBottom: 10, padding: 8, borderRadius: 8, background: 'var(--jcc-surface)', border: '1px solid var(--jcc-border)', color: 'var(--jcc-text)', resize: 'none' }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="jcc-ghost-btn" onClick={() => setEscalateOpen(false)}>Cancel</button>
                <button className="jcc-send-btn" onClick={submitEscalate}>Escalate</button>
              </div>
            </div>
          </div>
        )}

        {/* ---------- toast ---------- */}
        {toast && <div className={`jcc-toast ${toast.tone === 'error' ? 'error' : ''}`}>{toast.tone === 'error' ? '⚠️' : '✓'} {toast.message}</div>}
      </div>
    </div>
  );
}
