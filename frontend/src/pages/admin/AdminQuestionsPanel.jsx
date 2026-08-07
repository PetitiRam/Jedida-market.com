import { useEffect, useState } from 'react';
import client from '../../api/client';

function QuestionCard({ q, onForward, onAnswer }) {
  const [answerText, setAnswerText] = useState('');
  const [busy, setBusy] = useState(false);

  const forward = async () => {
    setBusy(true);
    try { await onForward(q.id); } finally { setBusy(false); }
  };

  const submitAnswer = async () => {
    if (!answerText.trim()) return;
    setBusy(true);
    try { await onAnswer(q.id, answerText); setAnswerText(''); } finally { setBusy(false); }
  };

  return (
    <div className="card-surface" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <strong>{q.product_title}</strong>
          <div className="product-card-meta">Asked by {q.asker_name} · Seller: {q.seller_name}</div>
        </div>
        <span className={`status-chip status-${q.status === 'answered' ? 'active' : 'pending_review'}`}>
          {q.status.replace(/_/g, ' ')}
        </span>
      </div>

      <p style={{ margin: '10px 0', fontSize: '0.9rem' }}>"{q.question_text}"</p>

      {q.status === 'pending_admin' && (
        <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }} disabled={busy} onClick={forward}>
          Forward to seller
        </button>
      )}

      {q.status === 'forwarded_to_seller' && (
        <div style={{ marginTop: 10 }}>
          <p className="product-card-meta" style={{ marginBottom: 6 }}>
            Forwarded to seller — enter their reply here once they respond (via Chat Bridging or direct outreach) to relay it to the buyer.
          </p>
          <textarea rows={2} value={answerText} onChange={(e) => setAnswerText(e.target.value)} placeholder="Seller's answer…" />
          <button className="btn-primary" style={{ marginTop: 8 }} disabled={busy || !answerText.trim()} onClick={submitAnswer}>
            {busy ? 'Publishing…' : 'Publish answer to buyer'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminQuestionsPanel() {
  const [questions, setQuestions] = useState(null);

  const load = () => client.get('/reviews/admin/questions/pending').then(({ data }) => setQuestions(data.questions));
  useEffect(() => { load(); }, []);

  const forward = async (id) => {
    await client.post(`/reviews/admin/questions/${id}/forward`);
    load();
  };
  const answer = async (id, answerText) => {
    await client.post(`/reviews/admin/questions/${id}/answer`, { answerText });
    load();
  };

  if (questions === null) return <div className="empty-state">Loading product questions…</div>;
  if (questions.length === 0) return <div className="empty-state">No buyer questions awaiting action.</div>;

  return (
    <div>
      <p style={{ color: '#5B6760', marginBottom: 16 }}>
        Buyers ask questions here — you relay them to the seller, then relay the seller's answer back. The buyer and seller never connect directly.
      </p>
      {questions.map((q) => <QuestionCard key={q.id} q={q} onForward={forward} onAnswer={answer} />)}
    </div>
  );
}
