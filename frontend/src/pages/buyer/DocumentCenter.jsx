import { useEffect, useState } from 'react';
import MarketplaceHeader from '../../components/MarketplaceHeader';
import * as documentsApi from '../../api/documentsApi';

const TABS = [
  { key: 'history', label: 'All Documents', load: documentsApi.buyerDocumentHistory, field: 'documents' },
  { key: 'receipts', label: 'Receipts', load: documentsApi.buyerReceipts, field: 'documents' },
  { key: 'invoices', label: 'Invoices', load: documentsApi.buyerInvoices, field: 'documents' },
  { key: 'refunds', label: 'Refunds', load: documentsApi.buyerRefunds, field: 'documents' },
  { key: 'deliveries', label: 'Delivery Confirmations', load: documentsApi.buyerDeliveries, field: 'documents' }
];

const TYPE_LABELS = {
  order_confirmation: 'Order Confirmation',
  digital_receipt: 'Digital Receipt',
  sales_invoice: 'Sales Invoice',
  purchase_invoice: 'Purchase Invoice',
  wholesale_invoice: 'Wholesale Invoice',
  proforma_invoice: 'Proforma Invoice',
  purchase_order: 'Purchase Order',
  delivery_receipt: 'Delivery Receipt',
  refund_receipt: 'Refund Receipt',
  payment_confirmation: 'Payment Confirmation',
  business_statement: 'Business Statement',
  agriculture_bulk_invoice: 'Agriculture Bulk Invoice'
};

export default function BuyerDocumentCenter() {
  const [activeTab, setActiveTab] = useState('history');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async (tabKey) => {
    setLoading(true);
    const tab = TABS.find((t) => t.key === tabKey);
    try {
      const { data } = await tab.load();
      setDocuments(data[tab.field] || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(activeTab); }, [activeTab]);

  return (
    <div>
      <MarketplaceHeader />
      <div className="dash-body">
        <h2>Document Center</h2>
        <p style={{ color: '#5B6760', marginBottom: 12 }}>
          Every receipt, invoice, refund and delivery confirmation Jedida has issued you.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={activeTab === t.key ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : documents.length === 0 ? (
          <div className="empty-state">Nothing here yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {documents.map((d) => (
              <div className="card-surface" key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <strong>{TYPE_LABELS[d.document_type] || d.document_type}</strong>
                  <div className="product-card-meta">
                    {d.document_number} · {new Date(d.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="product-card-meta">{d.currency} {Number(d.total_amount).toLocaleString()}</div>
                <span className={`status-chip status-${d.status}`}>{d.status.replace('_', ' ')}</span>
                <a className="btn-link" href={documentsApi.documentPdfUrl(d.id)} target="_blank" rel="noreferrer">View PDF</a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
