import { useEffect, useState } from 'react';
import { listTickets, createTicket, getTicket, replyToTicket, closeTicket } from '../../api/partnerPortalApi';

function statusPill(status) {
  const map = { open: 'jd-portal-pill-pending', pending: 'jd-portal-pill-pending', resolved: 'jd-portal-pill-active', closed: 'jd-portal-pill-neutral' };
  return `jd-portal-pill ${map[status] || 'jd-portal-pill-neutral'}`;
}

function NewTicketForm({ onCreated }) {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('medium');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!subject.trim() || !message.trim()) return;
    setBusy(true);
    try {
      await createTicket({ subject, category, priority, message });
      setSubject(''); setMessage('');
      onCreated();
    } finally { setBusy(false); }
  };

  return (
    <div className="jd-portal-card">
      <div className="jd-portal-card-title" style={{ marginBottom: 14 }}>New Support Ticket</div>
      <div className="jd-portal-field-row" style={{ marginBottom: 10 }}>
        <div><input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <div>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="general">General</option>
            <option value="technical">Technical</option>
            <option value="billing">Billing</option>
            <option value="account">Account</option>
          </select>
        </div>
        <div>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>
      <textarea rows={3} placeholder="Describe the issue…" value={message} onChange={(e) => setMessage(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
      <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy} onClick={submit}>Submit Ticket</button>
    </div>
  );
}

function TicketThread({ ticketId, onBack, onChanged }) {
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => getTicket(ticketId).then(({ data }) => { setTicket(data.ticket); setMessages(data.messages); });
  useEffect(() => { load(); }, [ticketId]);

  const submitReply = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await replyToTicket(ticketId, reply, file);
      setReply(''); setFile(null);
      load(); onChanged();
    } finally { setBusy(false); }
  };

  const doClose = async () => {
    setBusy(true);
    try { await closeTicket(ticketId); load(); onChanged(); }
    finally { setBusy(false); }
  };

  if (!ticket) return <div className="jd-portal-card"><div className="empty-state">Loading ticket…</div></div>;

  return (
    <div className="jd-portal-card">
      <div className="jd-portal-card-head">
        <div>
          <div className="jd-portal-card-title">{ticket.subject}</div>
          <div className="jd-portal-card-sub">{ticket.category} · {ticket.priority} priority</div>
        </div>
        <span className={statusPill(ticket.status)}>{ticket.status}</span>
      </div>
      <button className="btn-secondary" style={{ width: 'auto', padding: '6px 14px', marginBottom: 16 }} onClick={onBack}>← Back to tickets</button>

      <div style={{ marginBottom: 16 }}>
        {messages.map((m) => (
          <div key={m.id} className={`jd-portal-message ${m.author_role === 'partner' ? 'jd-portal-message-partner' : 'jd-portal-message-admin'}`}>
            <div className="jd-portal-message-meta">{m.author_role === 'partner' ? 'You' : 'JEDIDA Support'} · {new Date(m.created_at).toLocaleString()}</div>
            <div>{m.body}</div>
            {(m.attachments || []).map((a) => (
              <div key={a.id}><a href={a.file_url} target="_blank" rel="noreferrer">📎 {a.file_name}</a></div>
            ))}
          </div>
        ))}
      </div>

      {ticket.status !== 'closed' && (
        <div>
          <textarea rows={3} placeholder="Write a reply…" value={reply} onChange={(e) => setReply(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy} onClick={submitReply}>Send Reply</button>
            <button className="btn-secondary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy} onClick={doClose}>Close Ticket</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupportPanel() {
  const [tickets, setTickets] = useState([]);
  const [openTicketId, setOpenTicketId] = useState(null);

  const load = () => listTickets().then(({ data }) => setTickets(data.tickets));
  useEffect(() => { load(); }, []);

  if (openTicketId) {
    return <TicketThread ticketId={openTicketId} onBack={() => setOpenTicketId(null)} onChanged={load} />;
  }

  return (
    <div>
      <NewTicketForm onCreated={load} />
      <div className="jd-portal-card">
        <div className="jd-portal-card-title" style={{ marginBottom: 14 }}>Ticket History</div>
        <div className="jd-portal-table-wrap">
          <table className="jd-portal-table">
            <thead><tr><th>Subject</th><th>Category</th><th>Priority</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setOpenTicketId(t.id)}>
                  <td>{t.subject}</td>
                  <td>{t.category}</td>
                  <td>{t.priority}</td>
                  <td><span className={statusPill(t.status)}>{t.status}</span></td>
                  <td>{new Date(t.updated_at).toLocaleString()}</td>
                </tr>
              ))}
              {tickets.length === 0 && <tr><td colSpan={5}><div className="empty-state">No support tickets yet.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
