import { useEffect, useState } from 'react';
import * as documentsApi from '../../api/documentsApi';

const CATEGORY_LABELS = {
  retail: 'Retail', wholesale: 'Wholesale', supplier: 'Supplier', manufacturer: 'Manufacturer',
  agriculture_bulk: 'Agriculture Bulk', proforma: 'Proforma', purchase_order: 'Purchase Order'
};

function NewInvoiceForm({ onCreated }) {
  const [category, setCategory] = useState('retail');
  const [recipientId, setRecipientId] = useState('');
  const [buyerBusinessName, setBuyerBusinessName] = useState('');
  const [items, setItems] = useState([{ description: '', quantity: 1, unitPrice: '' }]);
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const updateItem = (i, field, value) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, { description: '', quantity: 1, unitPrice: '' }]);
  const removeItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await documentsApi.createInvoice({
        category,
        recipientId: recipientId || null,
        buyerBusinessName: buyerBusinessName || null,
        notes: notes || null,
        dueDate: dueDate || null,
        items: items
          .filter((it) => it.description && it.unitPrice !== '')
          .map((it) => ({ description: it.description, quantity: Number(it.quantity), unitPrice: Number(it.unitPrice) }))
      });
      setItems([{ description: '', quantity: 1, unitPrice: '' }]);
      setNotes(''); setDueDate(''); setBuyerBusinessName(''); setRecipientId('');
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create invoice.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-surface" style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ margin: 0 }}>New Invoice</h3>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="field-group" style={{ marginBottom: 0 }}>
          <label>Invoice type</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="field-group" style={{ marginBottom: 0 }}>
          <label>Buyer user ID (optional)</label>
          <input value={recipientId} onChange={(e) => setRecipientId(e.target.value)} placeholder="Buyer's Jedida user ID" />
        </div>
        <div className="field-group" style={{ marginBottom: 0 }}>
          <label>Buyer business name (optional)</label>
          <input value={buyerBusinessName} onChange={(e) => setBuyerBusinessName(e.target.value)} />
        </div>
        <div className="field-group" style={{ marginBottom: 0 }}>
          <label>Due date (optional)</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: 6 }}>Line items</label>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <input placeholder="Description" value={it.description} onChange={(e) => updateItem(i, 'description', e.target.value)} style={{ flex: 2, minWidth: 160 }} />
            <input type="number" min="0" step="1" placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(i, 'quantity', e.target.value)} style={{ width: 80 }} />
            <input type="number" min="0" step="0.01" placeholder="Unit price" value={it.unitPrice} onChange={(e) => updateItem(i, 'unitPrice', e.target.value)} style={{ width: 110 }} />
            {items.length > 1 && <button type="button" className="btn-link" onClick={() => removeItem(i)}>Remove</button>}
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={addItem}>+ Add line item</button>
      </div>

      <div className="field-group" style={{ marginBottom: 0 }}>
        <label>Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      <button className="btn-primary" disabled={busy} style={{ alignSelf: 'flex-start' }}>
        {busy ? 'Creating…' : 'Create invoice'}
      </button>
    </form>
  );
}

const SUB_TABS = [
  { key: 'invoices', label: 'All Invoices' },
  { key: 'pending', label: 'Pending Payments' },
  { key: 'sales', label: 'Paid Orders (Receipts)' }
];

export default function InvoicesPanel() {
  const [subTab, setSubTab] = useState('invoices');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [aiSummary, setAiSummary] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      if (subTab === 'invoices') {
        const { data } = await documentsApi.sellerInvoices();
        setRows(data.invoices || []);
      } else if (subTab === 'pending') {
        const { data } = await documentsApi.sellerPendingPayments();
        setRows(data.pending || []);
      } else {
        const { data } = await documentsApi.sellerSales();
        setRows(data.sales || []);
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [subTab]);

  const markPaid = async (id) => {
    setBusyId(id);
    try { await documentsApi.updateInvoiceStatus(id, 'paid'); await load(); } finally { setBusyId(null); }
  };
  const send = async (id) => {
    setBusyId(id);
    try { await documentsApi.sendInvoiceViaChat(id); await load(); } finally { setBusyId(null); }
  };
  const duplicate = async (id) => {
    setBusyId(id);
    try { await documentsApi.duplicateInvoice(id); await load(); } finally { setBusyId(null); }
  };
  const summarize = async () => {
    const { data } = await documentsApi.aiSummarizeSales();
    setAiSummary(data.summary);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Invoices &amp; Receipts</h3>
        <button className="btn-secondary" onClick={summarize}>✨ AI: Summarize my sales</button>
      </div>

      {aiSummary && <div className="alert" style={{ marginBottom: 16 }}>{aiSummary}</div>}

      <NewInvoiceForm onCreated={load} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {SUB_TABS.map((t) => (
          <button key={t.key} className={subTab === t.key ? 'btn-primary' : 'btn-secondary'} onClick={() => setSubTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">Nothing here yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((d) => (
            <div className="card-surface" key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong>{d.document_number}</strong>
                <div className="product-card-meta">
                  {(d.invoice_category ? CATEGORY_LABELS[d.invoice_category] + ' · ' : '')}
                  {new Date(d.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="product-card-meta">{d.currency} {Number(d.total_amount).toLocaleString()}</div>
              <span className={`status-chip status-${d.status}`}>{d.status.replace('_', ' ')}</span>
              <a className="btn-link" href={documentsApi.documentPdfUrl(d.id)} target="_blank" rel="noreferrer">PDF</a>
              {subTab !== 'sales' && (
                <>
                  <button className="btn-secondary" disabled={busyId === d.id} onClick={() => send(d.id)}>Send via chat</button>
                  <button className="btn-secondary" disabled={busyId === d.id} onClick={() => duplicate(d.id)}>Duplicate</button>
                  {d.status !== 'paid' && (
                    <button className="btn-primary" disabled={busyId === d.id} onClick={() => markPaid(d.id)}>Mark paid</button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
