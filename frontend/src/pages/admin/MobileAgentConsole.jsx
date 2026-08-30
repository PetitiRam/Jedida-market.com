import { useEffect, useRef, useState } from 'react';
import client, { normalizeError } from '../../api/client';
import Icon from '../../components/icons/icon';
import '../../styles/mobile-agent-console.css';

/* -------------------------------------------------------------------------
 * Jedida Mobile Agent Console
 * ---------------------------------------------------------------------
 * A genuinely separate mobile flow — full-screen views, one at a time,
 * with its own back stack and bottom tab bar — rather than the desktop
 * JedidaCommandCenter's multi-panel layout squeezed into a small
 * viewport (spec section 44 explicitly rules that out). Talks to the
 * same /api/agent-comms/* and /api/chat-v2/* endpoints the desktop
 * Command Center uses; nothing here is a second backend surface.
 * AdminPanel.jsx picks this component vs JedidaCommandCenter based on
 * viewport width (useIsMobile), so only one of the two ever mounts.
 * ------------------------------------------------------------------- */

const PRIORITY_META = {
  urgent: { label: 'Urgent', tone: 'rose' },
  high: { label: 'High', tone: 'amber' },
  normal: { label: 'Normal', tone: 'slate' },
  low: { label: 'Low', tone: 'sky' },
};
function priorityMeta(p) { return PRIORITY_META[p] || PRIORITY_META.normal; }
const PRESENCE_COLOR = { online: 'var(--mac-lime)', away: 'var(--mac-amber)', busy: 'var(--mac-rose)', offline: 'var(--mac-text-faint)' };

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
function Pill({ tone = 'slate', children }) {
  return <span className={`mac-pill mac-pill-${tone}`}>{children}</span>;
}

export default function MobileAgentConsole() {
  const [admin, setAdmin] = useState(null);
  const [tab, setTab] = useState('inbox'); // inbox | chats | groups | agents
  // Screen stack for back navigation. Top of stack is the visible screen.
  const [stack, setStack] = useState([{ screen: 'list' }]);
  const current = stack[stack.length - 1];
  const push = (screen, params = {}) => setStack((s) => [...s, { screen, ...params }]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const resetTo = (nextTab) => { setTab(nextTab); setStack([{ screen: 'list' }]); };

  const [moreOpen, setMoreOpen] = useState(false);
  const [actionSheetConv, setActionSheetConv] = useState(null); // conversation id whose "..." menu is open

  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(true);
  const [convFilter, setConvFilter] = useState('all'); // all | unassigned
  const [search, setSearch] = useState('');

  const [groups, setGroups] = useState([]);
  const [agents, setAgents] = useState([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [mentionCount, setMentionCount] = useState(0);

  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [routing, setRouting] = useState(null);
  const [notes, setNotes] = useState([]);
  const [composerMode, setComposerMode] = useState('reply');
  const [text, setText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [sending, setSending] = useState(false);

  const [transferTo, setTransferTo] = useState({ type: 'group', id: '' });
  const [transferReason, setTransferReason] = useState('');

  const [internalMessages, setInternalMessages] = useState([]);
  const [internalText, setInternalText] = useState('');

  const [broadcastForm, setBroadcastForm] = useState({ audienceType: 'group', audienceGroupId: '', audienceSectorId: '', message: '' });
  const [sectors, setSectors] = useState([]);
  const [broadcastSending, setBroadcastSending] = useState(false);

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const scrollRef = useRef(null);

  function showToast(message, tone = 'ok') {
    setToast({ message, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }
  const showError = (err) => showToast(normalizeError(err).friendlyMessage, 'error');

  /* ---- initial load ---- */
  useEffect(() => {
    client.get('/auth/me').then(({ data }) => setAdmin(data.user)).catch(() => {});
    client.get('/agent-comms/groups').then(({ data }) => setGroups(data.groups || [])).catch(() => {});
    client.get('/agent-comms/agents').then(({ data }) => setAgents(data.agents || [])).catch(() => {});
    client.get('/agent-comms/sectors').then(({ data }) => setSectors(data.sectors || [])).catch(() => {});
    client.get('/agent-comms/inbox', { params: { unassigned: true } }).then(({ data }) => setUnassignedCount((data.conversations || []).length)).catch(() => {});
    client.get('/agent-comms/mentions', { params: { unread: true } }).then(({ data }) => setMentionCount((data.mentions || []).length)).catch(() => {});
  }, []);

  /* ---- inbox list load (re-fires on tab/filter/search change) ---- */
  useEffect(() => {
    if (current.screen !== 'list') return;
    setConvLoading(true);
    const params = { search: search || undefined };
    if (tab === 'chats') params.assignedToMe = true;
    if (tab === 'inbox' && convFilter === 'unassigned') params.unassigned = true;
    client.get('/agent-comms/inbox', { params })
      .then(({ data }) => setConversations(data.conversations || []))
      .catch(showError)
      .finally(() => setConvLoading(false));
  }, [tab, convFilter, search, current.screen]);

  /* ---- conversation screen load ---- */
  useEffect(() => {
    if (current.screen !== 'conversation') return;
    const id = current.conversationId;
    setMsgLoading(true);
    setComposerMode('reply');
    client.get(`/chat-v2/${id}/messages`).then(({ data }) => setMessages(data.messages || [])).catch(showError).finally(() => setMsgLoading(false));
    client.get(`/agent-comms/conversations/${id}`).then(({ data }) => setRouting(data.conversation)).catch(() => {});
    client.get(`/agent-comms/conversations/${id}/notes`).then(({ data }) => setNotes(data.notes || [])).catch(() => {});
  }, [current.screen, current.conversationId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  /* ---- internal thread screen load ---- */
  useEffect(() => {
    if (current.screen !== 'internalThread') return;
    client.get(`/agent-comms/internal/conversations/${current.internalId}/messages`)
      .then(({ data }) => setInternalMessages(data.messages || []))
      .catch(showError);
    client.post(`/agent-comms/internal/conversations/${current.internalId}/read`).catch(() => {});
  }, [current.screen, current.internalId]);

  /* ---- actions ---- */
  async function sendMessage() {
    if (!text.trim()) return;
    setSending(true);
    try {
      const { data } = await client.post(`/chat-v2/${current.conversationId}/messages`, { body: text.trim() });
      setMessages((prev) => [...prev, data.message, ...(data.aiMessage ? [data.aiMessage] : [])]);
      setText('');
    } catch (err) { showError(err); } finally { setSending(false); }
  }

  async function submitNote() {
    if (!noteText.trim()) return;
    try {
      const { data } = await client.post(`/agent-comms/conversations/${current.conversationId}/notes`, { body: noteText.trim() });
      setNotes((prev) => [...prev, data.note]);
      setNoteText('');
    } catch (err) { showError(err); }
  }

  async function claimConversation(id) {
    try {
      const { data } = await client.post(`/agent-comms/conversations/${id}/claim`);
      showToast('Chat claimed — it\u2019s yours now');
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, assigned_agent_id: data.conversation.assigned_agent_id } : c)));
      if (current.screen === 'conversation' && current.conversationId === id) setRouting(data.conversation);
    } catch (err) { showError(err); }
  }

  async function submitTransfer() {
    if (!transferTo.id) return;
    try {
      const payload = {
        transferType: transferTo.type === 'agent' ? 'agent' : 'group',
        reason: transferReason || undefined,
        ...(transferTo.type === 'agent' ? { toAgentId: transferTo.id } : { toGroupId: transferTo.id }),
      };
      await client.post(`/agent-comms/conversations/${current.conversationId}/transfer`, payload);
      showToast('Conversation transferred');
      setTransferReason('');
      pop();
    } catch (err) { showError(err); }
  }

  async function openAgentDm(agentId, name) {
    try {
      const { data } = await client.post(`/agent-comms/internal/dm/${agentId}`);
      push('internalThread', { internalId: data.conversation.id, title: name });
    } catch (err) { showError(err); }
  }

  async function openGroupRoom(groupId, name) {
    try {
      const { data } = await client.post(`/agent-comms/internal/group/${groupId}`);
      push('internalThread', { internalId: data.conversation.id, title: name });
    } catch (err) { showError(err); }
  }

  async function sendInternalMessage() {
    if (!internalText.trim()) return;
    try {
      const { data } = await client.post(`/agent-comms/internal/conversations/${current.internalId}/messages`, { body: internalText.trim() });
      setInternalMessages((prev) => [...prev, data.message]);
      setInternalText('');
    } catch (err) { showError(err); }
  }

  async function sendBroadcast() {
    if (!broadcastForm.message.trim()) return;
    setBroadcastSending(true);
    try {
      const { data } = await client.post('/agent-comms/broadcasts', {
        audienceType: broadcastForm.audienceType,
        audienceGroupId: broadcastForm.audienceType === 'group' ? broadcastForm.audienceGroupId : undefined,
        audienceSectorId: broadcastForm.audienceType === 'sector' ? broadcastForm.audienceSectorId : undefined,
        message: broadcastForm.message.trim(),
      });
      showToast(`Sent to ${data.delivered} of ${data.total} recipients`);
      setBroadcastForm({ ...broadcastForm, message: '' });
      pop();
    } catch (err) { showError(err); } finally { setBroadcastSending(false); }
  }

  const selectedConv = conversations.find((c) => c.id === current.conversationId) || null;

  /* ======================================================================
   * SCREEN 1 — INBOX / CHATS list (bottom-nav home for both tabs)
   * ==================================================================== */
  function ListScreen() {
    return (
      <div className="mac-screen">
        <div className="mac-header">
          <div className="mac-header-title">
            <b>{tab === 'chats' ? 'My Chats' : 'Agent Inbox'}</b>
            <div className="mac-header-sub">{conversations.length} conversation{conversations.length === 1 ? '' : 's'}</div>
          </div>
        </div>
        <div className="mac-search">
          <Icon name="search" size={15} /> <input placeholder="Search conversations…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {tab === 'inbox' && (
          <div className="mac-segmented">
            <button className={`mac-segchip ${convFilter === 'all' ? 'active' : ''}`} onClick={() => setConvFilter('all')}>All</button>
            <button className={`mac-segchip ${convFilter === 'unassigned' ? 'active' : ''}`} onClick={() => setConvFilter('unassigned')}>Unassigned ({unassignedCount})</button>
          </div>
        )}
        <div className="mac-body">
          {convLoading && <div className="mac-empty">Loading…</div>}
          {!convLoading && conversations.length === 0 && <div className="mac-empty">Nothing here right now.</div>}
          {conversations.map((c) => (
            <button key={c.id} className="mac-row" onClick={() => push('conversation', { conversationId: c.id })}>
              <div className="mac-avatar">{initials(c.customer_name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex' }}>
                  <span className="mac-row-name">{c.customer_name}</span>
                  <span className="mac-row-time">{timeAgo(c.last_message_at || c.created_at)}</span>
                </div>
                <div className="mac-row-msg">{c.last_message || 'No messages yet'}</div>
                <div className="mac-row-meta">
                  <Pill tone={priorityMeta(c.priority).tone}>{priorityMeta(c.priority).label}</Pill>
                  {c.group_name && <Pill tone="sky">{c.group_name}</Pill>}
                  {!c.assigned_agent_id && <Pill tone="amber">Unassigned</Pill>}
                  {Number(c.unread_count) > 0 && <span className="mac-row-badge">{c.unread_count}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ======================================================================
   * SCREEN 2 — CONVERSATION (full screen)
   * ==================================================================== */
  function ConversationScreen() {
    return (
      <div className="mac-screen">
        <div className="mac-header">
          <button className="mac-back-btn" onClick={pop} aria-label="Back"><Icon name="chevronLeft" size={18} /></button>
          <div className="mac-header-title" onClick={() => push('customer', { conversationId: current.conversationId })}>
            <b>{selectedConv?.customer_name || 'Conversation'}</b>
            <div className="mac-header-sub">
              {routing?.priority && <Pill tone={priorityMeta(routing.priority).tone}>{priorityMeta(routing.priority).label}</Pill>}
              {routing?.group_name && <span>{routing.group_name}</span>}
            </div>
          </div>
          <button className="mac-header-action" onClick={() => setActionSheetConv(current.conversationId)}>⋮</button>
        </div>

        <div className="mac-messages" ref={scrollRef} style={{ flex: 1 }}>
          {msgLoading && <div className="mac-empty">Loading messages…</div>}
          {!msgLoading && messages.length === 0 && <div className="mac-empty">No messages yet.</div>}
          {messages.map((m) => (
            <div key={m.id} className={`mac-msg-row ${admin && m.sender_id === admin.id ? 'mine' : ''}`}>
              <div>
                <div className={`mac-bubble ${admin && m.sender_id === admin.id ? 'mine' : 'theirs'}`}>{m.body}</div>
                <div className="mac-msg-time">{fmtTime(m.created_at)}</div>
              </div>
            </div>
          ))}
          {notes.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, color: 'var(--mac-text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>Internal Notes</div>
              {notes.map((n) => (
                <div key={n.id} className="mac-bubble note">
                  <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}><Icon name="note" size={11} /> {n.author_name}</div>
                  {n.body}
                </div>
              ))}
            </>
          )}
        </div>

        {routing && !routing.assigned_agent_id && (
          <div style={{ padding: '0 12px 10px' }}>
            <button className="mac-primary-btn" style={{ marginTop: 0 }} onClick={() => claimConversation(current.conversationId)}><Icon name="hand" size={15} /> Take This Chat</button>
          </div>
        )}

        <div className="mac-composer">
          <div className="mac-composer-modes">
            <button className={`mac-segchip ${composerMode === 'reply' ? 'active' : ''}`} onClick={() => setComposerMode('reply')}><Icon name="message" size={13} /> Reply</button>
            <button className={`mac-segchip ${composerMode === 'note' ? 'active' : ''}`} onClick={() => setComposerMode('note')}><Icon name="note" size={13} /> Internal Note</button>
          </div>
          <div className="mac-composer-box" style={composerMode === 'note' ? { background: 'var(--mac-amber-dim)', borderColor: 'rgba(224,169,62,0.3)' } : undefined}>
            {composerMode === 'reply' ? (
              <>
                <textarea rows={1} placeholder="Reply…" value={text} onChange={(e) => setText(e.target.value)} />
                <button className="mac-send-btn" disabled={sending || !text.trim()} onClick={sendMessage} aria-label="Send"><Icon name="send" size={15} /></button>
              </>
            ) : (
              <>
                <textarea rows={1} placeholder="Internal note — customer never sees this…" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                <button className="mac-send-btn" style={{ background: 'var(--mac-amber)' }} disabled={!noteText.trim()} onClick={submitNote} aria-label="Add note"><Icon name="note" size={15} /></button>
              </>
            )}
          </div>
        </div>

        {actionSheetConv && (
          <div className="mac-sheet-overlay" onClick={() => setActionSheetConv(null)}>
            <div className="mac-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="mac-sheet-handle" />
              <button className="mac-sheet-item" onClick={() => { setActionSheetConv(null); push('customer', { conversationId: current.conversationId }); }}><Icon name="user" size={15} /> View Customer Details</button>
              <button className="mac-sheet-item" onClick={() => { setActionSheetConv(null); setTransferTo({ type: 'group', id: '' }); push('transfer', { conversationId: current.conversationId }); }}><Icon name="swap" size={15} /> Transfer Chat</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ======================================================================
   * SCREEN 3 — CUSTOMER DETAILS
   * ==================================================================== */
  function CustomerScreen() {
    const [participant, setParticipant] = useState(null);
    useEffect(() => {
      client.get(`/chat-v2/${current.conversationId}/participant`).then(({ data }) => setParticipant(data.participant || null)).catch(() => {});
    }, []);
    return (
      <div className="mac-screen">
        <div className="mac-header">
          <button className="mac-back-btn" onClick={pop} aria-label="Back"><Icon name="chevronLeft" size={18} /></button>
          <div className="mac-header-title"><b>Customer Details</b></div>
        </div>
        <div className="mac-body mac-form">
          {!participant && <div className="mac-empty">Loading…</div>}
          {participant && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div className="mac-avatar" style={{ height: 52, width: 52, fontSize: 16 }}>{initials(participant.fullName)}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>{participant.fullName}</div>
                  <Pill tone={participant.isVerified ? 'lime' : 'slate'}>{participant.isVerified ? 'Verified' : 'Unverified'}</Pill>
                </div>
              </div>
              <div className="mac-label">Trust Score</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{participant.trustScore}%</div>
              <div className="mac-label">Role</div>
              <div style={{ fontSize: 14 }}>{participant.role}</div>
              <div className="mac-label">Member Since</div>
              <div style={{ fontSize: 14 }}>{participant.memberSince ? new Date(participant.memberSince).toLocaleDateString() : '—'}</div>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ======================================================================
   * SCREEN 4 — TRANSFER
   * ==================================================================== */
  function TransferScreen() {
    return (
      <div className="mac-screen">
        <div className="mac-header">
          <button className="mac-back-btn" onClick={pop} aria-label="Back"><Icon name="chevronLeft" size={18} /></button>
          <div className="mac-header-title"><b>Transfer Conversation</b></div>
        </div>
        <div className="mac-body mac-form">
          <div className="mac-label">Transfer to</div>
          <div className="mac-choice-row">
            <select className="mac-select" value={transferTo.type} onChange={(e) => setTransferTo({ type: e.target.value, id: '' })}>
              <option value="group">Group</option>
              <option value="agent">Agent</option>
            </select>
          </div>
          <div className="mac-label">{transferTo.type === 'group' ? 'Select a group' : 'Select an agent'}</div>
          <select className="mac-select" value={transferTo.id} onChange={(e) => setTransferTo({ ...transferTo, id: e.target.value })}>
            <option value="">Choose…</option>
            {(transferTo.type === 'group' ? groups : agents).map((o) => <option key={o.id} value={o.id}>{o.name || o.full_name}</option>)}
          </select>
          <div className="mac-label">Note (optional)</div>
          <textarea className="mac-textarea" rows={3} placeholder="Why is this being transferred?" value={transferReason} onChange={(e) => setTransferReason(e.target.value)} />
          <button className="mac-primary-btn" disabled={!transferTo.id} onClick={submitTransfer}>Transfer Chat</button>
        </div>
      </div>
    );
  }

  /* ======================================================================
   * GROUPS tab
   * ==================================================================== */
  function GroupsScreen() {
    return (
      <div className="mac-screen">
        <div className="mac-header"><div className="mac-header-title"><b>Groups &amp; Sectors</b></div></div>
        <div className="mac-body">
          {groups.length === 0 && <div className="mac-empty">No agent groups yet.</div>}
          {groups.map((g) => (
            <button key={g.id} className="mac-row" onClick={() => openGroupRoom(g.id, g.name)}>
              <div className="mac-avatar"><Icon name="compass" size={16} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mac-row-name">{g.name}</div>
                <div className="mac-row-msg">{g.sector_name || 'No sector'} · {g.member_count} agent{g.member_count === '1' ? '' : 's'}</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--mac-text-dim)' }}>Team Chat →</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ======================================================================
   * AGENTS tab
   * ==================================================================== */
  function AgentsScreen() {
    return (
      <div className="mac-screen">
        <div className="mac-header"><div className="mac-header-title"><b>Agents</b></div></div>
        <div className="mac-body">
          {agents.length === 0 && <div className="mac-empty">No agents found.</div>}
          {agents.map((a) => (
            <button key={a.id} className="mac-row" onClick={() => openAgentDm(a.id, a.full_name)}>
              <div className="mac-avatar">
                {initials(a.full_name)}
                <span className="mac-avatar-dot" style={{ background: PRESENCE_COLOR[a.presence] || PRESENCE_COLOR.offline }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mac-row-name">{a.full_name}</div>
                <div className="mac-row-msg">{(a.groups || []).map((g) => g.name).join(', ') || 'No groups'}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ======================================================================
   * SCREEN 5 — AGENT / GROUP internal chat thread
   * ==================================================================== */
  function InternalThreadScreen() {
    return (
      <div className="mac-screen">
        <div className="mac-header">
          <button className="mac-back-btn" onClick={pop} aria-label="Back"><Icon name="chevronLeft" size={18} /></button>
          <div className="mac-header-title"><b style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="lock" size={14} /> {current.title}</b><div className="mac-header-sub">Internal — customers never see this</div></div>
        </div>
        <div className="mac-messages" style={{ flex: 1 }}>
          {internalMessages.length === 0 && <div className="mac-empty">No messages yet.</div>}
          {internalMessages.map((m) => (
            <div key={m.id} className={`mac-msg-row ${admin && m.sender_id === admin.id ? 'mine' : ''}`}>
              <div>
                <div className={`mac-bubble ${admin && m.sender_id === admin.id ? 'mine' : 'theirs'}`}>
                  {admin && m.sender_id !== admin.id && <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 3 }}>{m.sender_name}</div>}
                  {m.body}
                </div>
                <div className="mac-msg-time">{fmtTime(m.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mac-composer">
          <div className="mac-composer-box">
            <textarea rows={1} placeholder="Message…" value={internalText} onChange={(e) => setInternalText(e.target.value)} />
            <button className="mac-send-btn" disabled={!internalText.trim()} onClick={sendInternalMessage} aria-label="Send"><Icon name="send" size={15} /></button>
          </div>
        </div>
      </div>
    );
  }

  /* ======================================================================
   * SCREEN 6 — GROUP BROADCAST
   * ==================================================================== */
  function BroadcastScreen() {
    return (
      <div className="mac-screen">
        <div className="mac-header">
          <button className="mac-back-btn" onClick={pop} aria-label="Back"><Icon name="chevronLeft" size={18} /></button>
          <div className="mac-header-title"><b>Group Broadcast</b></div>
        </div>
        <div className="mac-body mac-form">
          <div className="mac-label">Send to</div>
          <select className="mac-select" value={broadcastForm.audienceType} onChange={(e) => setBroadcastForm({ ...broadcastForm, audienceType: e.target.value })}>
            <option value="group">Group</option>
            <option value="sector">Sector</option>
            <option value="all">All Customers</option>
          </select>
          {broadcastForm.audienceType === 'group' && (
            <>
              <div className="mac-label">Group</div>
              <select className="mac-select" value={broadcastForm.audienceGroupId} onChange={(e) => setBroadcastForm({ ...broadcastForm, audienceGroupId: e.target.value })}>
                <option value="">Select…</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </>
          )}
          {broadcastForm.audienceType === 'sector' && (
            <>
              <div className="mac-label">Sector</div>
              <select className="mac-select" value={broadcastForm.audienceSectorId} onChange={(e) => setBroadcastForm({ ...broadcastForm, audienceSectorId: e.target.value })}>
                <option value="">Select…</option>
                {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </>
          )}
          <div className="mac-label">Message</div>
          <textarea className="mac-textarea" rows={5} placeholder="Dear customer, …" value={broadcastForm.message} onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })} />
          <div className="mac-hint">Each recipient receives this as an individual, private message — no one sees who else got it.</div>
          <button className="mac-primary-btn" disabled={broadcastSending || !broadcastForm.message.trim()} onClick={sendBroadcast}>
            {broadcastSending ? 'Sending…' : (<><Icon name="megaphone" size={14} /> Send Broadcast</>)}
          </button>
        </div>
      </div>
    );
  }

  /* ---- screen router ---- */
  let ScreenComponent = ListScreen;
  if (current.screen === 'conversation') ScreenComponent = ConversationScreen;
  else if (current.screen === 'customer') ScreenComponent = CustomerScreen;
  else if (current.screen === 'transfer') ScreenComponent = TransferScreen;
  else if (current.screen === 'internalThread') ScreenComponent = InternalThreadScreen;
  else if (current.screen === 'broadcast') ScreenComponent = BroadcastScreen;
  else if (tab === 'groups') ScreenComponent = GroupsScreen;
  else if (tab === 'agents') ScreenComponent = AgentsScreen;

  const showTabBar = current.screen === 'list';

  return (
    <div className="mac">
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <ScreenComponent />
      </div>

      {showTabBar && (
        <div className="mac-tabbar">
          <button className={`mac-tab ${tab === 'inbox' ? 'active' : ''}`} onClick={() => resetTo('inbox')}>
            <span className="mac-tab-icon"><Icon name="inbox" size={18} /></span>Inbox
          </button>
          <button className={`mac-tab ${tab === 'chats' ? 'active' : ''}`} onClick={() => resetTo('chats')}>
            <span className="mac-tab-icon"><Icon name="message" size={18} /></span>Chats
          </button>
          <button className={`mac-tab ${tab === 'groups' ? 'active' : ''}`} onClick={() => resetTo('groups')}>
            <span className="mac-tab-icon"><Icon name="compass" size={18} /></span>Groups
          </button>
          <button className={`mac-tab ${tab === 'agents' ? 'active' : ''}`} onClick={() => resetTo('agents')}>
            <span className="mac-tab-icon"><Icon name="users" size={18} /></span>Agents
          </button>
          <button className="mac-tab" onClick={() => setMoreOpen(true)}>
            <span className="mac-tab-icon">⋯</span>More
            {mentionCount > 0 && <span className="mac-tab-badge">{mentionCount}</span>}
          </button>
        </div>
      )}

      {moreOpen && (
        <div className="mac-sheet-overlay" onClick={() => setMoreOpen(false)}>
          <div className="mac-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mac-sheet-handle" />
            <button className="mac-sheet-item" onClick={() => { setMoreOpen(false); push('broadcast'); }}><Icon name="megaphone" size={15} /> Group Broadcast</button>
            <button className="mac-sheet-item" onClick={() => { setMoreOpen(false); resetTo('inbox'); setConvFilter('unassigned'); }}><Icon name="inbox" size={15} /> Unassigned Queue ({unassignedCount})</button>
          </div>
        </div>
      )}

      {toast && <div className={`mac-toast ${toast.tone === 'error' ? 'error' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{toast.tone === 'error' ? <Icon name="alertTriangle" size={14} /> : <Icon name="check" size={14} />} {toast.message}</div>}
    </div>
  );
}
