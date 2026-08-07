import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useChatSocket } from '../../chat/useChatSocket';
import MediaUploader from '../MediaUploader';
import ChatHeader from './ChatHeader';
import MessageCard from './MessageCards';
import BusinessControlPanel from './BusinessControlPanel';
import AIAssistantPanel from './AIAssistantPanel';
import { SecurityStrip, ContactShareWarning } from './SecurityBanner';
import BottomActionBar from './BottomActionBar';
import '../../styles/chat-workspace.css';

const LANGUAGES = [
  { key: 'en', label: 'English' },
  { key: 'fr', label: 'French' },
  { key: 'sw', label: 'Swahili' },
  { key: 'lg', label: 'Luganda (AI-translated, lower confidence)' },
  { key: 'xog', label: 'Lusoga (AI-translated, lower confidence)' },
];

const STICKERS = ['👍', '🎉', '❤️', '😂', '🙏', '📦', '✅', '⏳'];

export default function ChatWorkspace({ onClose, initialConversationId = null }) {
  const navigate = useNavigate();
  const [conversationId, setConversationId] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [participant, setParticipant] = useState(null);
  const [summary, setSummary] = useState(null);
  const [text, setText] = useState('');
  const [myLanguage, setMyLanguage] = useState('en');
  const [showStickers, setShowStickers] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeChip, setActiveChip] = useState('message');
  const [requestingHuman, setRequestingHuman] = useState(false);
  const [notice, setNotice] = useState(null);
  const bottomRef = useRef(null);

  const {
    connected, messages, setMessages, presence, myUserId,
    sendMessage, startTyping, stopTyping, markRead, react, deleteForEveryone,
    pinMessage, unpinMessage, moderationWarning, dismissModerationWarning
  } = useChatSocket(conversationId);

  useEffect(() => {
    client.get('/auth/me').then(({ data }) => setMyLanguage(data.user.preferred_language || 'en')).catch(() => {});
  }, []);

  const loadConversation = () => {
    if (initialConversationId) {
      client.get(`/chat-v2/${initialConversationId}`).then(({ data }) => {
        setConversation(data.conversation);
        setConversationId(data.conversation.id);
      }).catch(loadDefaultConversation);
      return;
    }
    loadDefaultConversation();
  };
  const loadDefaultConversation = () => {
    client.get('/chat-v2/mine').then(({ data }) => {
      setConversation(data.conversation);
      setConversationId(data.conversation.id);
    });
  };
  useEffect(loadConversation, [initialConversationId]);

  useEffect(() => {
    if (!conversationId) return;
    client.get(`/chat-v2/${conversationId}/messages`).then(({ data }) => setMessages(data.messages));
    client.get(`/chat-v2/${conversationId}/participant`).then(({ data }) => setParticipant(data.participant)).catch(() => {});
    client.get(`/chat-v2/${conversationId}/business-summary`).then(({ data }) => setSummary(data)).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (messages.length > 0) markRead();
  }, [messages]);

  const isSeller = conversation && myUserId === conversation.seller_id;
  const otherUserId = conversation
    ? (conversation.user_id === myUserId ? conversation.seller_id : conversation.user_id)
    : null;
  const isOnline = otherUserId != null && presence[otherUserId] ? presence[otherUserId].isOnline : !!participant?.isOnline;
  const displayBody = (m) => m.display_body ?? m.translations?.[myLanguage] ?? m.body;
  const hasProduct = !!summary?.product;

  const handleSend = async (body = text, messageType, attachment) => {
    if (!body?.trim() && !attachment) return;
    setText('');
    setShowStickers(false);
    stopTyping();
    try {
      await sendMessage(body, undefined, messageType, attachment);
      loadConversation();
    } catch (err) {
      setNotice(err.message);
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
      setNotice(err.message);
    }
  };

  const changeLanguage = async (language) => {
    setMyLanguage(language);
    try {
      await client.patch('/auth/me/language', { language });
      if (conversationId) client.get(`/chat-v2/${conversationId}/messages`).then(({ data }) => setMessages(data.messages));
    } catch { /* non-critical */ }
  };

  const requestHuman = async () => {
    if (!conversationId || requestingHuman) return;
    setRequestingHuman(true);
    try {
      await client.post(`/chat-v2/${conversationId}/escalate`, { area: 'customer_support', reason: 'Buyer tapped "Connect to human support"' });
      loadConversation();
    } catch {
      setNotice('Could not reach a human agent right now — please try again in a moment.');
    } finally {
      setRequestingHuman(false);
    }
  };

  const reportConversation = async () => {
    const last = messages[messages.length - 1];
    if (!last) { alert('No messages to report yet.'); return; }
    try {
      await client.post(`/chat-v2/${conversationId}/messages/${last.id}/report`, { reason: 'other' });
      alert('Thanks — our team will review this conversation.');
    } catch {
      alert('Could not submit the report right now.');
    }
  };

  const viewStore = () => { if (participant?.shop?.slug) navigate(`/s/${participant.shop.slug}`); };
  const viewProduct = (productId) => { if (productId) navigate(`/product/${productId}`); };

  // --- AI Assistant quick actions: real prompts sent to the real AI turn ---
  const askAboutProduct = () => summary?.product && handleSend(
    `Tell me more about ${summary.product.title} — specs, availability, and anything I should know before ordering.`
  );
  const createQuotation = () => summary?.product && handleSend(
    `Could you prepare a quotation for ${summary.product.title}? I'm interested in ordering.`
  );
  const explainPricing = () => summary?.product && handleSend(
    `Can you explain the pricing for ${summary.product.title}, and whether there are bulk discounts?`
  );
  const summarizeConversation = () => handleSend('Please summarize our conversation so far.');

  // --- Bottom action bar ---
  const onChip = (key) => {
    setActiveChip(key);
    if (key === 'product') {
      if (summary?.product) {
        handleSend(summary.product.title, 'product', { url: null, meta: {
          productId: summary.product.id, title: summary.product.title, price: summary.product.price,
          currency: summary.product.currency, moq: summary.product.moq, stock: summary.product.stock
        } });
      } else {
        setPanelOpen(true);
      }
    } else if (key === 'quote') {
      createQuotation();
    } else if (key === 'order') {
      const order = summary?.orders?.[0];
      if (order) {
        const payment = summary.payments?.find((p) => p.order_id === order.id);
        const delivery = summary.deliveries?.find((d) => d.order_id === order.id);
        handleSend(`Order #${order.id.slice(0, 8)}`, 'order', { url: null, meta: {
          orderId: order.id, status: order.status, totalAmount: order.total_amount, currency: order.currency,
          paymentStatus: payment?.status, deliveryStatus: delivery?.status
        } });
      } else {
        setPanelOpen(true);
      }
    } else if (key === 'pay') {
      const payable = summary?.orders?.find((o) => o.status === 'pending_payment');
      if (payable?.product_id) navigate(`/checkout/${payable.product_id}`);
      else if (summary?.product) navigate(`/checkout/${summary.product.id}`);
      else setNotice('No product selected to pay for yet.');
    } else if (key === 'support') {
      requestHuman();
    }
  };

  const warningMessage = moderationWarning?.reminder || notice;
  const clearWarning = () => { dismissModerationWarning(); setNotice(null); };

  return (
    <div className="cw-root">
      <ChatHeader
        participant={participant}
        isOnline={isOnline}
        onViewStore={viewStore}
        onReport={reportConversation}
        onSecurity={() => setPanelOpen((v) => !v)}
        onTogglePanel={() => setPanelOpen((v) => !v)}
        hasPanel
      />

      <SecurityStrip onClick={() => setPanelOpen((v) => !v)} />
      <ContactShareWarning message={warningMessage} onClose={clearWarning} />

      <div className="cw-body">
        <div className="cw-conversation">
          <div className="cw-messages">
            {messages.length === 0 && (
              <div className="cw-panel-empty" style={{ padding: '12px 4px' }}>
                No messages yet. Say hello — Jedida AI will help until a human joins if needed.
              </div>
            )}
            {messages.map((m) => (
              <MessageCard
                key={m.id}
                m={m}
                mine={m.sender_id === myUserId}
                displayBody={displayBody}
                onViewProduct={viewProduct}
                actions={!m.deleted_for_everyone && (
                  <>
                    <button type="button" onClick={() => react(m.id, '👍')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>👍</button>
                    <button type="button" onClick={() => (m.pinned ? unpinMessage(m.id) : pinMessage(m.id))} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                      {m.pinned ? '📌' : '📌'}
                    </button>
                    {m.sender_id === myUserId && (
                      <button type="button" onClick={() => deleteForEveryone(m.id)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>🗑️</button>
                    )}
                  </>
                )}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        <BusinessControlPanel
          open={panelOpen}
          overlay
          isSeller={isSeller}
          summary={summary}
          onClose={() => setPanelOpen(false)}
          onViewProduct={viewProduct}
        />
      </div>

      {showAttach && (
        <div style={{ padding: '6px 0' }}>
          <MediaUploader accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx" label="Send image, video, voice note or document" onUploaded={sendAttachment} />
        </div>
      )}
      {showStickers && (
        <div style={{ display: 'flex', gap: 8, padding: '6px 0', flexWrap: 'wrap' }}>
          {STICKERS.map((s) => (
            <button key={s} type="button" onClick={() => handleSend(s, 'sticker')} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.4rem' }}>{s}</button>
          ))}
        </div>
      )}

      <BottomActionBar
        active={activeChip}
        onAction={onChip}
        text={text}
        onTextChange={(v) => { setText(v); startTyping(); }}
        onSend={() => handleSend()}
        onEmoji={() => setShowStickers((v) => !v)}
        onAttach={() => setShowAttach((v) => !v)}
        disabled={!connected}
      />

      <AIAssistantPanel
        hasProduct={hasProduct}
        onAskAboutProduct={askAboutProduct}
        onCreateQuotation={createQuotation}
        onExplainPricing={explainPricing}
        onSummarize={summarizeConversation}
        onConnectHuman={requestHuman}
        connecting={requestingHuman}
        languages={LANGUAGES}
        myLanguage={myLanguage}
        onChangeLanguage={changeLanguage}
      />
    </div>
  );
}
