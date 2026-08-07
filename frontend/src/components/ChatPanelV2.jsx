import { useEffect, useMemo, useRef, useState } from 'react';
import client from '../api/client';
import { useChatSocket } from '../chat/useChatSocket';
import MediaUploader from './MediaUploader';

const LANGUAGES = [
  { key: 'en', label: 'English' },
  { key: 'fr', label: 'French' },
  { key: 'sw', label: 'Swahili' },
  { key: 'lg', label: 'Luganda (translation not yet available)' },
  { key: 'xog', label: 'Lusoga (translation not yet available)' },
];

const STICKERS = ['👍', '🎉', '❤️', '😂', '🙏', '📦', '✅', '⏳'];

export default function ChatPanelV2({ embedded = false }) {
  const [conversationId, setConversationId] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [text, setText] = useState('');
  const [myLanguage, setMyLanguage] = useState('en');
  const [showStickers, setShowStickers] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [forwardPicker, setForwardPicker] = useState(null); // { messageId, options }
  const bottomRef = useRef(null);

  const [blockedNotice, setBlockedNotice] = useState(null);
  const [requestingHuman, setRequestingHuman] = useState(false);

  const {
    connected, messages, setMessages, typingUsers, myUserId,
    sendMessage, startTyping, stopTyping, markRead, react, deleteForEveryone,
    pinMessage, unpinMessage, forwardMessage, moderationWarning, dismissModerationWarning
  } = useChatSocket(conversationId);

  const reportMessage = async (messageId, reason) => {
    if (!conversationId) return;
    try {
      await client.post(`/chat-v2/${conversationId}/messages/${messageId}/report`, { reason });
      alert('Thanks — our team will review this message.');
    } catch {
      alert('Could not submit the report right now.');
    }
  };

  const blockOtherUser = async (otherUserId) => {
    if (!otherUserId) return;
    if (!confirm('Block this user? They will no longer be able to message you.')) return;
    try {
      await client.post('/chat-v2/block', { userId: otherUserId });
      alert('User blocked.');
    } catch {
      alert('Could not block this user right now.');
    }
  };

  const openForwardPicker = async (messageId) => {
    try {
      const { data } = await client.get('/chat-v2/conversations');
      const options = (data.conversations || []).filter((c) => c.id !== conversationId);
      if (!options.length) { alert('No other conversation to forward this into yet.'); return; }
      setForwardPicker({ messageId, options });
    } catch {
      alert('Could not load your conversations right now.');
    }
  };

  const runForward = async (targetConversationId) => {
    if (!forwardPicker) return;
    try {
      await forwardMessage(forwardPicker.messageId, targetConversationId);
      alert('Message forwarded.');
    } catch (err) {
      alert(err.message);
    } finally {
      setForwardPicker(null);
    }
  };

  const sendAttachment = async (media) => {
    setShowAttach(false);
    try {
      await sendMessage('', undefined, media.media_type, {
        url: media.url,
        meta: { originalName: media.original_name, bytes: media.bytes, durationSeconds: media.duration_seconds }
      });
    } catch (err) {
      setBlockedNotice(err.message);
    }
  };

  useEffect(() => {
    client.get('/auth/me').then(({ data }) => setMyLanguage(data.user.preferred_language || 'en')).catch(() => {});
  }, []);

  const loadConversation = () => {
    client.get('/chat-v2/mine').then(({ data }) => {
      setConversation(data.conversation);
      setConversationId(data.conversation.id);
    });
  };

  const otherUserId = conversation
    ? (conversation.user_id === myUserId ? conversation.seller_id : conversation.user_id)
    : null;

  useEffect(loadConversation, []);

  useEffect(() => {
    if (!conversationId) return;
    client.get(`/chat-v2/${conversationId}/messages`).then(({ data }) => setMessages(data.messages));
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (messages.length > 0) markRead();
  }, [messages]);

  const changeLanguage = async (language) => {
    setMyLanguage(language);
    try {
      await client.patch('/auth/me/language', { language });
      if (conversationId) {
        client.get(`/chat-v2/${conversationId}/messages`).then(({ data }) => setMessages(data.messages));
      }
    } catch {
      // non-critical — chat still works in the original language either way
    }
  };

  const displayBody = (m) => m.display_body ?? m.translations?.[myLanguage] ?? m.body;

  const pinnedMessages = useMemo(() => messages.filter((m) => m.pinned), [messages]);

  const handleSend = async (body = text, messageType) => {
    if (!body.trim()) return;
    setText('');
    setShowStickers(false);
    stopTyping();
    try {
      await sendMessage(body, undefined, messageType);
      loadConversation();
    } catch (err) {
      setBlockedNotice(err.message);
    }
  };

  const runSearch = async () => {
    if (!searchTerm.trim() || !conversationId) { setSearchResults(null); return; }
    const { data } = await client.get(`/chat-v2/${conversationId}/messages/search`, { params: { q: searchTerm } });
    setSearchResults(data.messages);
  };

  const clearChat = async () => {
    if (!conversationId) return;
    if (!confirm('Delete this chat? A fresh conversation will start.')) return;
    await client.post(`/chat-v2/${conversationId}/close`);
    setMessages([]);
    setConversationId(null);
    loadConversation();
  };

  const requestHuman = async () => {
    if (!conversationId || requestingHuman) return;
    setRequestingHuman(true);
    try {
      await client.post(`/chat-v2/${conversationId}/escalate`, {
        area: 'customer_support',
        reason: 'Buyer tapped "Talk to a human"'
      });
      loadConversation();
    } catch {
      alert('Could not reach a human agent right now — please try again in a moment.');
    } finally {
      setRequestingHuman(false);
    }
  };

  const visibleMessages = searchResults !== null ? searchResults : messages;

  // Glass theme used when this panel sits inside the half-screen overlay
  // (FloatingChatButton). Kept local so the default (embedded=false) usage
  // elsewhere is untouched.
  const glass = embedded ? {
    text: '#F3FBF6',
    subText: 'rgba(243,251,246,0.62)',
    mineBubble: 'rgba(255,255,255,0.16)',
    theirBubble: 'rgba(255,255,255,0.07)',
    officialBubble: 'rgba(139,197,63,0.22)',
    border: 'rgba(255,255,255,0.16)',
    iconColor: 'rgba(243,251,246,0.85)',
  } : null;

  const renderMessage = (m) => {
    const mine = m.sender_id === myUserId;
    return (
    <div key={m.id} style={{
      alignSelf: mine ? 'flex-end' : 'flex-start',
      background: embedded
        ? ((m.is_official || m.is_ai) ? glass.officialBubble : mine ? glass.mineBubble : glass.theirBubble)
        : ((m.is_official || m.is_ai) ? '#EAF4EC' : mine ? '#DCF3E3' : '#FFFFFF'),
      border: embedded
        ? ((m.is_official || m.is_ai) ? `1px solid ${glass.border}` : mine ? 'none' : `1px solid ${glass.border}`)
        : ((m.is_official || m.is_ai) ? '1px solid var(--forest)' : mine ? 'none' : '1px solid #ECE9E2'),
      borderRadius: mine ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
      boxShadow: embedded ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
      color: embedded ? glass.text : 'inherit',
      padding: '8px 12px', maxWidth: '75%', fontSize: '0.9rem', position: 'relative'
    }}>
      {m.is_official && !m.is_ai && (
        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: embedded ? '#C9EFA0' : 'var(--forest)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
          ✔️ Official Jedida Administrator
        </div>
      )}
      {m.is_ai && (
        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: embedded ? '#C9EFA0' : 'var(--forest)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
          🤖 Jedida AI Assistant
        </div>
      )}
      {m.deleted_for_everyone
        ? <em style={{ color: embedded ? glass.subText : '#8A9189' }}>Message deleted</em>
        : m.message_type === 'sticker' ? <span style={{ fontSize: '1.6rem' }}>{m.body}</span>
        : m.message_type === 'image' ? <img src={m.attachment_url} alt="attachment" style={{ maxWidth: 220, borderRadius: 8, display: 'block' }} />
        : m.message_type === 'video' ? <video src={m.attachment_url} controls style={{ maxWidth: 220, borderRadius: 8, display: 'block' }} />
        : m.message_type === 'audio' ? <audio src={m.attachment_url} controls style={{ maxWidth: 220 }} />
        : m.message_type === 'document' ? (
            <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'inherit' }}>
              📄 <span style={{ textDecoration: 'underline' }}>{m.attachment_meta?.originalName || 'Document'}</span>
            </a>
          )
        : displayBody(m)}
      {m.forwarded_from_id && (
        <div style={{ fontSize: '0.65rem', color: embedded ? glass.subText : '#8A9189', fontStyle: 'italic', marginTop: 2 }}>↪ Forwarded</div>
      )}
      {m.moderation_status === 'masked' && (
        <div style={{ fontSize: '0.68rem', color: embedded ? '#F0C36B' : '#B0790E', marginTop: 4 }}>
          🛡️ Part of this message was hidden by Petiti AI to keep contact details inside Jedida Marketplace.
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', color: embedded ? glass.subText : '#8A9189' }}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        {m.status === 'read' && <span style={{ fontSize: '0.68rem', color: embedded ? '#C9EFA0' : 'var(--forest)' }}>✓✓ Read</span>}
        {m.reactions && Object.entries(m.reactions).map(([emoji, userIds]) => (
          userIds.length > 0 && <span key={emoji} style={{ fontSize: '0.75rem' }}>{emoji} {userIds.length}</span>
        ))}
        <button onClick={() => react(m.id, '👍')} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>👍</button>
        <button
          onClick={() => (m.pinned ? unpinMessage(m.id) : pinMessage(m.id))}
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.75rem', color: embedded ? glass.text : 'inherit' }}
        >
          {m.pinned ? '📌 Unpin' : '📌'}
        </button>
        {!m.deleted_for_everyone && (
          <button onClick={() => deleteForEveryone(m.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.68rem', color: embedded ? '#F5A398' : '#8A2E10' }}>
            Delete
          </button>
        )}
        {!m.deleted_for_everyone && (
          <button onClick={() => openForwardPicker(m.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.68rem', color: embedded ? glass.subText : '#8A9189' }}>
            ↪ Forward
          </button>
        )}
        <button
          onClick={() => reportMessage(m.id, 'other')}
          title="Report this message"
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.68rem', color: embedded ? glass.subText : '#8A9189' }}
        >
          🚩 Report
        </button>
      </div>
    </div>
    );
  };

  return (
    <div className={embedded ? undefined : 'card-surface'} style={embedded ? {
      display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', background: 'transparent',
    } : {
      display: 'flex', flexDirection: 'column', height: 460, position: 'relative',
      backgroundImage: 'radial-gradient(rgba(11,61,36,0.035) 1px, transparent 1px)',
      backgroundSize: '18px 18px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', color: embedded ? (connected ? '#B7ECC7' : glass.subText) : (connected ? 'var(--forest)' : '#8A9189') }}>
          {connected ? '● Connected' : '○ Reconnecting…'}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {!conversation?.escalated && (
            <button
              onClick={requestHuman}
              disabled={requestingHuman}
              title="Connect with a verified Jedida representative"
              style={{
                border: embedded ? `1px solid ${glass.border}` : '1px solid var(--forest)',
                background: 'none', borderRadius: 999, padding: '3px 10px',
                cursor: requestingHuman ? 'default' : 'pointer', fontSize: '0.72rem',
                color: embedded ? glass.text : 'var(--forest)',
              }}
            >
              {requestingHuman ? 'Connecting…' : '👤 Talk to a human'}
            </button>
          )}
          <button onClick={() => setSearchOpen((v) => !v)} title="Search messages" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>🔎</button>
          <button onClick={clearChat} title="Delete chat" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>🗑️</button>
          {otherUserId && (
            <button onClick={() => blockOtherUser(otherUserId)} title="Block this user" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>🚫</button>
          )}
          <select
            value={myLanguage}
            onChange={(e) => changeLanguage(e.target.value)}
            style={{ fontSize: '0.75rem', padding: '2px 4px', borderRadius: 6, border: embedded ? `1px solid ${glass.border}` : undefined, background: embedded ? 'rgba(255,255,255,0.12)' : undefined, color: embedded ? glass.text : 'inherit' }}
            title="Messages you receive will be translated into this language where possible"
          >
            {LANGUAGES.map((l) => <option key={l.key} value={l.key} style={{ color: '#10241A' }}>{l.label}</option>)}
          </select>
        </div>
        {typingUsers.size > 0 && <span style={{ fontSize: '0.8rem', color: embedded ? glass.subText : '#8A9189', fontStyle: 'italic' }}>Admin is typing…</span>}
      </div>

      {searchOpen && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder="Search this conversation…"
            style={{ flex: 1 }}
          />
          <button className="btn-secondary" onClick={runSearch}>Search</button>
          {searchResults !== null && (
            <button className="btn-secondary" onClick={() => { setSearchResults(null); setSearchTerm(''); }}>Clear</button>
          )}
        </div>
      )}

      {moderationWarning && (
        <div style={{ background: '#FFF4E5', border: '1px solid #8BC53F', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>🛡️ <strong>Petiti AI:</strong> {moderationWarning.reminder}</span>
          <button onClick={dismissModerationWarning} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {blockedNotice && (
        <div style={{ background: '#FDECEA', border: '1px solid #C0392B', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>🛡️ <strong>Petiti AI:</strong> {blockedNotice}</span>
          <button onClick={() => setBlockedNotice(null)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {conversation?.escalated && (
        <div style={{ background: embedded ? 'rgba(139,197,63,0.18)' : '#EAF4EC', border: `1px solid ${embedded ? glass.border : 'var(--forest)'}`, borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: '0.78rem', color: embedded ? glass.text : 'inherit' }}>
          👤 A verified Jedida representative has been looped in and will reply here shortly.
        </div>
      )}

      {pinnedMessages.length > 0 && searchResults === null && (
        <div style={{ background: '#FFF7E6', borderRadius: 8, padding: '6px 10px', marginBottom: 8, fontSize: '0.78rem' }}>
          <strong>📌 Pinned:</strong> {pinnedMessages.map((m) => m.message_type === 'sticker' ? m.body : displayBody(m)).join('  ·  ')}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibleMessages.length === 0 && (
          <div className={embedded ? undefined : 'empty-state'} style={embedded ? { color: glass.subText, fontSize: '0.85rem', padding: '8px 2px' } : undefined}>
            {searchResults !== null ? 'No messages match your search.' : 'No messages yet. Say hello to the JEDIDA admin team.'}
          </div>
        )}
        {visibleMessages.map(renderMessage)}
        <div ref={bottomRef} />
      </div>

      {forwardPicker && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 20, borderRadius: 12
        }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 14, width: '85%', maxHeight: '70%', overflowY: 'auto' }}>
            <strong style={{ fontSize: '0.85rem' }}>Forward to…</strong>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {forwardPicker.options.map((c) => (
                <button
                  key={c.id}
                  className="btn-secondary"
                  onClick={() => runForward(c.id)}
                  style={{ textAlign: 'left', fontSize: '0.8rem' }}
                >
                  Conversation · {new Date(c.created_at).toLocaleDateString()}
                </button>
              ))}
            </div>
            <button onClick={() => setForwardPicker(null)} className="btn-secondary" style={{ marginTop: 10, width: '100%' }}>Cancel</button>
          </div>
        </div>
      )}

      {showAttach && (
        <div style={{ padding: '6px 0' }}>
          <MediaUploader
            accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
            label="Send image, video, voice note or document"
            onUploaded={sendAttachment}
          />
        </div>
      )}

      {showStickers && (
        <div style={{ display: 'flex', gap: 8, padding: '6px 0', flexWrap: 'wrap' }}>
          {STICKERS.map((s) => (
            <button
              key={s}
              onClick={() => handleSend(s, 'sticker')}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.4rem' }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div style={embedded ? {
        display: 'flex', alignItems: 'center', gap: 10, marginTop: 12,
        background: 'rgba(255,255,255,0.12)', border: `1px solid ${glass.border}`,
        borderRadius: 999, padding: '8px 8px 8px 16px',
      } : { display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={() => setShowStickers((v) => !v)}
          title="Stickers"
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem' }}
        >
          😀
        </button>
        <button
          type="button"
          onClick={() => setShowAttach((v) => !v)}
          title="Attach image, video, voice note or document"
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem' }}
        >
          📎
        </button>
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); startTyping(); }}
          onBlur={stopTyping}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Message the admin team…"
          style={embedded ? {
            flex: 1, border: 'none', background: 'transparent', color: glass.text,
            fontSize: '0.95rem', outline: 'none',
          } : undefined}
        />
        <button
          onClick={() => handleSend()}
          aria-label="Send"
          style={embedded ? {
            width: 38, height: 38, borderRadius: '50%', border: 'none', flexShrink: 0,
            background: 'rgba(255,255,255,0.9)', color: '#0B3D24', fontSize: '1.05rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          } : { width: 'auto', padding: '10px 18px' }}
          className={embedded ? undefined : 'btn-primary'}
        >
          {embedded ? '↑' : 'Send'}
        </button>
      </div>
    </div>
  );
}
