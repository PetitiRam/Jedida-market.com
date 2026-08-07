import { useEffect, useRef, useState } from 'react';
import client from '../../api/client';
import { sendAssistantMessage } from '../../api/aiAssistantApi';
import { aiTrainingApi } from '../../api/aiTrainingApi';
import '../../styles/ai-assistant.css';

// Roles that get the seller dashboard (see SHARED_DASHBOARD_ROLES in
// SellerDashboard.jsx) — everyone else signed in is treated as a buyer.
const SELLER_ROLES = ['seller', 'manufacturer', 'supplier', 'dropshipper', 'farmer'];

const SUGGESTIONS_BY_AUDIENCE = {
  seller: [
    { key: 'design', label: 'Design my store', prompt: 'Help me design my storefront — where do I start?' },
    { key: 'review', label: 'Review a listing', prompt: 'Can you review a product listing for me before I publish it?' },
    { key: 'marketing', label: 'Marketing ideas', prompt: 'Give me some marketing ideas to bring more buyers to my shop.' },
    { key: 'analytics', label: "How's my shop doing?", prompt: 'How is my shop performing lately?' }
  ],
  buyer: [
    { key: 'track', label: 'Track my order', prompt: 'Where is my order?' },
    { key: 'return', label: 'Start a return', prompt: 'How do I return or get a refund for an order?' },
    { key: 'find', label: 'Find a product', prompt: 'Help me find a product I\u2019m looking for.' },
    { key: 'payment', label: 'Payment question', prompt: 'How does payment and escrow work on Jedida?' }
  ]
};

const EMPTY_STATE_TEXT = {
  seller: 'Hi, I\u2019m Jedida AI. Ask me about your storefront, a listing, marketing, or how your shop\u2019s doing.',
  buyer: 'Hi, I\u2019m Jedida AI. Ask me about an order, a return, payments, or finding a product.'
};

const BRAND_SUBTITLE = {
  seller: 'Your commerce co-pilot',
  buyer: 'Your shopping assistant'
};

function Icon({ name }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'plus': return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case 'mic': return <svg {...common}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 19v3" /></svg>;
    case 'send': return <svg {...common} strokeWidth={2}><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
    case 'new': return <svg {...common}><path d="M4 4v5h5M20 20v-5h-5" /><path d="M4.5 15a8 8 0 0 0 14.7 2.3M19.5 9A8 8 0 0 0 4.8 6.7" /></svg>;
    case 'expand': return <svg {...common}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>;
    case 'collapse': return <svg {...common}><path d="M9 3v6H3M15 21v-6h6M3 9l6-6M21 15l-6 6" /></svg>;
    case 'close': return <svg {...common}><path d="M18 6 6 18M6 6l12 12" /></svg>;
    case 'copy': return <svg {...common}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>;
    case 'up': return <svg {...common}><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Zm0 0 4.5-8a2 2 0 0 1 3.8 1l-1 5.5H19a2 2 0 0 1 2 2.3l-1.5 8A2 2 0 0 1 17.5 21H10a3 3 0 0 1-3-3" /></svg>;
    case 'down': return <svg {...common}><path d="M17 14V3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3Zm0 0-4.5 8a2 2 0 0 1-3.8-1l1-5.5H5a2 2 0 0 1-2-2.3l1.5-8A2 2 0 0 1 6.5 3H14a3 3 0 0 1 3 3" /></svg>;
    default: return null;
  }
}

export default function JedidaAiWidget() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState([]); // { role, content, feedback?, messageId? }
  const [input, setInput] = useState('');
  const [deepMode, setDeepMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [audience, setAudience] = useState(null); // 'seller' | 'buyer', resolved after /auth/me
  const [conversationId, setConversationId] = useState(null);
  const scrollRef = useRef(null);
  const isSignedIn = !!localStorage.getItem('jedida_access_token');

  useEffect(() => {
    if (!isSignedIn) return;
    client.get('/auth/me')
      .then(({ data }) => setAudience(SELLER_ROLES.includes(data.user?.primary_role) ? 'seller' : 'buyer'))
      .catch(() => setAudience('buyer'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, open]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const history = messages;
    setMessages((m) => [...m, { role: 'user', content }]);
    setInput('');
    setBusy(true);
    try {
      const { data } = await sendAssistantMessage(content, history, deepMode, audience || 'buyer', conversationId);
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages((m) => [...m, { role: 'assistant', content: data.reply, messageId: data.messageId || null }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: err.response?.data?.error || "I couldn't reach Jedida AI just now — try again in a moment." }]);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e) => { e.preventDefault(); send(); };

  const copyMessage = (text) => { navigator.clipboard?.writeText(text).catch(() => {}); };

  const setFeedback = (index, value) => {
    let targetMessageId = null;
    setMessages((m) => m.map((msg, i) => {
      if (i !== index) return msg;
      targetMessageId = msg.messageId || null;
      return { ...msg, feedback: msg.feedback === value ? null : value };
    }));
    // Best-effort — a failed rating call shouldn't interrupt the chat.
    aiTrainingApi.submitFeedback({
      rating: value === 'up' ? 'helpful' : 'not_helpful',
      source: 'assistant_widget',
      conversationId,
      messageId: targetMessageId,
    }).catch(() => {});
  };

  const newChat = () => { setMessages([]); setInput(''); setConversationId(null); };

  if (!isSignedIn || !audience) return null;

  if (!open) {
    return (
      <button type="button" className="jai-launcher" onClick={() => setOpen(true)} aria-label="Open Jedida AI">
        <span className="jai-orb jai-orb-sm" />
        <span>Ask Jedida AI anything</span>
      </button>
    );
  }

  return (
    <div className={`jai-panel${expanded ? ' jai-panel-expanded' : ''}`} role="dialog" aria-label="Jedida AI Assistant">
      <div className="jai-header">
        <div className="jai-brand">
          <span className="jai-orb jai-orb-sm" />
          <div>
            <b>Jedida AI</b>
            <span>{BRAND_SUBTITLE[audience]}</span>
          </div>
        </div>
        <div className="jai-header-actions">
          <button type="button" onClick={newChat} title="New chat" aria-label="New chat"><Icon name="new" /></button>
          <button type="button" onClick={() => setExpanded((v) => !v)} title={expanded ? 'Collapse' : 'Expand'} aria-label="Toggle size" className="jai-hide-mobile">
            <Icon name={expanded ? 'collapse' : 'expand'} />
          </button>
          <button type="button" onClick={() => setOpen(false)} title="Close" aria-label="Close"><Icon name="close" /></button>
        </div>
      </div>

      <div className="jai-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="jai-empty">
            <span className="jai-orb jai-orb-lg" />
            <p>{EMPTY_STATE_TEXT[audience]}</p>
            <div className="jai-suggestions">
              {SUGGESTIONS_BY_AUDIENCE[audience].map((s) => (
                <button type="button" key={s.key} onClick={() => send(s.prompt)}>{s.label}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`jai-msg jai-msg-${m.role}`}>
            <div className="jai-bubble">{m.content}</div>
            {m.role === 'assistant' && (
              <div className="jai-msg-actions">
                <button type="button" onClick={() => copyMessage(m.content)} title="Copy"><Icon name="copy" /></button>
                <button type="button" onClick={() => setFeedback(i, 'up')} title="Good response" className={m.feedback === 'up' ? 'jai-active' : ''}><Icon name="up" /></button>
                <button type="button" onClick={() => setFeedback(i, 'down')} title="Poor response" className={m.feedback === 'down' ? 'jai-active' : ''}><Icon name="down" /></button>
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="jai-msg jai-msg-assistant">
            <div className="jai-bubble jai-typing"><span className="jai-orb jai-orb-xs jai-pulsing" /> Jedida AI is thinking&hellip;</div>
          </div>
        )}
      </div>

      <form className="jai-input-bar" onSubmit={handleSubmit}>
        <button type="button" className="jai-icon-btn" disabled title="Attachments — coming soon"><Icon name="plus" /></button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything"
          aria-label="Message Jedida AI"
        />
        <label className="jai-deep-toggle" title="Ask for a more thorough answer">
          <input type="checkbox" checked={deepMode} onChange={(e) => setDeepMode(e.target.checked)} />
          <span className="jai-toggle-track"><span className="jai-toggle-thumb" /></span>
          <span className="jai-toggle-label jai-hide-mobile">Think deeper</span>
        </label>
        <button type="button" className="jai-icon-btn" disabled title="Voice — coming soon"><Icon name="mic" /></button>
        <button type="submit" className="jai-send-btn" disabled={!input.trim() || busy} aria-label="Send"><Icon name="send" /></button>
      </form>
    </div>
  );
}
