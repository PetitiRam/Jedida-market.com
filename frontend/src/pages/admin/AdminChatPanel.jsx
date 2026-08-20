import { useEffect, useState } from 'react';
import client from '../../api/client';
import ChatWorkspace from '../../components/chat/ChatWorkspace';

const ROLE_LABELS = {
  seller: 'Seller', delivery: 'Delivery', dropshipper: 'Dropshipper',
  manufacturer: 'Manufacturer', supplier: 'Supplier', buyer: 'Buyer',
};

export default function AdminChatPanel() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    client.get('/chat-v2/admin/conversations', { params: { supportOnly: 'true' } })
      .then(({ data }) => setConversations(data.conversations || []))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ width: 260 }}>
        {loading && <div className="empty-state">Loading…</div>}
        {!loading && conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveId(c.id)}
            className="card-surface"
            style={{
              display: 'block', width: '100%', textAlign: 'left', marginBottom: 8, padding: 12,
              border: activeId === c.id ? '2px solid var(--forest)' : '1px solid var(--line)',
            }}
          >
            <strong>{c.full_name}</strong>
            <div className="product-card-meta">
              {ROLE_LABELS[c.primary_role] || c.primary_role || 'User'}
              {c.escalated ? ' · Escalated' : ''}
            </div>
          </button>
        ))}
        {!loading && conversations.length === 0 && (
          <div className="empty-state">No support conversations yet.</div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 320, height: 620, display: 'flex' }}>
        {activeId ? (
          <ChatWorkspace initialConversationId={activeId} />
        ) : (
          <div className="empty-state">Select a conversation.</div>
        )}
      </div>
    </div>
  );
}
