import { useEffect, useState } from 'react';
import client from '../../api/client';

export default function AdminChatBridgePanel() {
  const [conversations, setConversations] = useState([]);
  const [selectedA, setSelectedA] = useState('');
  const [selectedB, setSelectedB] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');

  const load = () => client.get('/chat-v2/admin/conversations').then(({ data }) => setConversations(data.conversations));
  useEffect(() => { load(); }, []);

  const bridge = async () => {
    if (!selectedA || !selectedB || selectedA === selectedB) {
      setMessage('Select two different conversations to bridge.');
      return;
    }
    await client.post('/chat-v2/admin/bridge', { conversationAId: selectedA, conversationBId: selectedB, reason });
    setMessage('Conversations bridged — messages will now relay between them until you terminate the link.');
    setSelectedA(''); setSelectedB(''); setReason('');
  };

  return (
    <div className="card-surface">
      <h4>Bridge two conversations</h4>
      <p className="product-card-meta" style={{ marginBottom: 12 }}>
        Connects a buyer's conversation with a seller's (or delivery partner's) so they can communicate
        for a specific order — without ever giving them each other's direct contact.
      </p>
      {message && <div className="alert alert-success">{message}</div>}

      <div className="field-row">
        <div className="field-group">
          <label>Conversation A</label>
          <select value={selectedA} onChange={(e) => setSelectedA(e.target.value)}>
            <option value="">Select…</option>
            {conversations.map((c) => <option key={c.id} value={c.id}>{c.full_name} ({c.primary_role})</option>)}
          </select>
        </div>
        <div className="field-group">
          <label>Conversation B</label>
          <select value={selectedB} onChange={(e) => setSelectedB(e.target.value)}>
            <option value="">Select…</option>
            {conversations.map((c) => <option key={c.id} value={c.id}>{c.full_name} ({c.primary_role})</option>)}
          </select>
        </div>
      </div>
      <div className="field-group">
        <label>Reason (optional)</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Order ORDER-000245 delivery coordination" />
      </div>
      <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} onClick={bridge}>Bridge conversations</button>
    </div>
  );
}
