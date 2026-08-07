import { useEffect, useState } from 'react';
import client from '../../api/client';

const STATUS_TABS = [
  { key: 'payment_submitted', label: '💰 Payment to verify' },
  { key: 'payment_verified', label: '🚚 Ready (delivery/dropshipper)' },
  { key: 'kyc_pending', label: '🪪 KYC to review' },
  { key: 'kyc_verified', label: '✅ Ready for approval' },
  { key: '', label: 'All' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' }
];

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '4px 0', borderBottom: '1px dashed var(--line)' }}>
      <span style={{ color: '#8A9189' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function ImagePreview({ label, url }) {
  if (!url) return null;
  return (
    <div>
      <p style={{ fontSize: '0.78rem', color: '#8A9189', marginBottom: 4 }}>{label}</p>
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={label} style={{ width: 140, height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
      </a>
    </div>
  );
}

function PaymentVerificationBlock({ upgrade, onAction, busy }) {
  return (
    <div style={{ background: '#FCEFD8', border: '1px solid #E8C77A', borderRadius: 10, padding: 14, marginTop: 12 }}>
      <p style={{ fontWeight: 700, marginBottom: 8, color: '#8A5A0D' }}>💰 Payment awaiting verification</p>
      <InfoRow label="Amount expected" value={`${upgrade.verification_fee_amount} UGX`} />
      <InfoRow label="Reference submitted" value={upgrade.payment_reference} />
      <InfoRow label="Submitted" value={new Date(upgrade.created_at).toLocaleString()} />
      {upgrade.proof_of_payment_url && (
        <div style={{ marginTop: 10 }}>
          <ImagePreview label="Proof of payment" url={upgrade.proof_of_payment_url} />
        </div>
      )}
      <p style={{ fontSize: '0.78rem', color: '#8A5A0D', margin: '10px 0' }}>
        Confirm this reference matches a real transaction received on the platform's payment number before verifying.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" style={{ width: 'auto', padding: '9px 18px' }} disabled={busy} onClick={() => onAction('verify_payment')}>
          ✔ Confirm payment received
        </button>
        <button className="btn-secondary" disabled={busy} onClick={() => onAction('reject_payment')}>
          Reject — not received
        </button>
      </div>
    </div>
  );
}

function UpgradeCard({ upgrade, onAction }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);

  const act = async (action) => {
    setBusy(true);
    try {
      await onAction(upgrade.id, action, notes);
      setNotes('');
    } finally {
      setBusy(false);
    }
  };

  const loadHistory = () => {
    client.get(`/admin/upgrades/${upgrade.id}/history`).then(({ data }) => setHistory(data.events));
  };

  return (
    <div className="card-surface" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <strong>{upgrade.full_name}</strong>
          <div className="product-card-meta">@{upgrade.username} · {upgrade.email} · wants to become {upgrade.requested_role}</div>
        </div>
        <span className={`status-chip status-${upgrade.status.includes('reject') ? 'rejected' : upgrade.status === 'approved' ? 'active' : 'pending_review'}`}>
          {upgrade.status.replace(/_/g, ' ')}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <h5 style={{ marginBottom: 6, fontSize: '0.82rem', color: '#5B6760', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Application</h5>
          <InfoRow label="Business name" value={upgrade.application_data?.businessName || upgrade.company_name} />
          <InfoRow label="Motivation" value={upgrade.application_data?.motivation} />
          {upgrade.business_profile_id && (
            <>
              <InfoRow label="Registration number" value={upgrade.registration_number} />
              <InfoRow label="Tax ID" value={upgrade.tax_id} />
              <InfoRow label="Country" value={upgrade.company_country} />
              <InfoRow label="Address" value={upgrade.company_address} />
              <InfoRow label="Website" value={upgrade.website} />
            </>
          )}
        </div>
        <div>
          <h5 style={{ marginBottom: 6, fontSize: '0.82rem', color: '#5B6760', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {upgrade.business_profile_id ? 'Business Verification Documents' : 'KYC Documents'}
          </h5>
          {upgrade.business_profile_id ? (
            (upgrade.business_documents || []).length > 0 ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {upgrade.business_documents.map((doc) => (
                  <ImagePreview key={doc.id} label={doc.doc_type?.replace(/_/g, ' ') || 'Document'} url={doc.file_url} />
                ))}
              </div>
            ) : (
              <p className="product-card-meta">Not submitted yet.</p>
            )
          ) : upgrade.national_id_front_url ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <ImagePreview label="ID front" url={upgrade.national_id_front_url} />
              <ImagePreview label="ID back" url={upgrade.national_id_back_url} />
              <ImagePreview label="Selfie" url={upgrade.selfie_url} />
            </div>
          ) : (
            <p className="product-card-meta">Not submitted yet.</p>
          )}
        </div>
      </div>

      {/* Payment verification is the centerpiece action for this status */}
      {upgrade.status === 'payment_submitted' && (
        <PaymentVerificationBlock upgrade={upgrade} onAction={act} busy={busy} />
      )}

      {upgrade.status === 'kyc_pending' && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)', display: 'flex', gap: 8 }}>
          <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }} disabled={busy} onClick={() => act('verify_kyc')}>
            ✔ Verify {upgrade.business_profile_id ? 'business' : 'KYC'}
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => act('reject_kyc')}>
            Reject {upgrade.business_profile_id ? 'business verification' : 'KYC'}
          </button>
        </div>
      )}

      {upgrade.status === 'payment_verified' && ['delivery', 'dropshipper'].includes(upgrade.requested_role) && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <p className="product-card-meta" style={{ marginBottom: 8 }}>
            {upgrade.requested_role === 'dropshipper'
              ? 'Dropshippers never hold inventory or production capacity, so payment verification is enough to approve here.'
              : 'Delivery partners verify KYC later from their dashboard — payment is enough to approve here.'}
          </p>
          <button className="btn-primary" style={{ width: 'auto', padding: '9px 18px' }} disabled={busy} onClick={() => act('approve')}>
            🎉 Approve — grant {upgrade.requested_role} access
          </button>
        </div>
      )}

      {upgrade.status === 'kyc_verified' && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <button className="btn-primary" style={{ width: 'auto', padding: '9px 18px' }} disabled={busy} onClick={() => act('approve')}>
            🎉 Approve — grant {upgrade.requested_role} access
          </button>
        </div>
      )}

      {upgrade.status === 'approved' && (
        <p style={{ marginTop: 14, color: 'var(--forest)', fontWeight: 600, fontSize: '0.85rem' }}>✔ Approved — user has {upgrade.requested_role} access.</p>
      )}
      {upgrade.status === 'rejected' && (
        <p style={{ marginTop: 14, color: '#8A2E10', fontWeight: 600, fontSize: '0.85rem' }}>✘ Rejected.</p>
      )}

      {!['approved', 'rejected'].includes(upgrade.status) && (
        <div style={{ marginTop: 12 }}>
          <input
            value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional note included in the rejection notification"
            style={{ marginBottom: 8 }}
          />
          <button className="btn-link" disabled={busy} onClick={() => act('reject')}>Reject entire application</button>
        </div>
      )}

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <button className="btn-link" onClick={() => (history ? setHistory(null) : loadHistory())}>
          {history ? 'Hide approval history' : '🕓 View approval history'}
        </button>
        {history && (
          <div style={{ marginTop: 8 }}>
            {history.length === 0 && <p className="product-card-meta">No actions recorded yet.</p>}
            {history.map((e) => (
              <div key={e.id} className="product-card-meta" style={{ padding: '4px 0', borderBottom: '1px dashed var(--line)' }}>
                <strong>{e.action.replace(/_/g, ' ')}</strong> — {e.from_status || 'start'} → {e.to_status}
                {e.performed_by_name && <> · by {e.performed_by_name}</>}
                {e.note && <> · "{e.note}"</>}
                <div style={{ fontSize: '0.72rem' }}>{new Date(e.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminUpgradesPanel() {
  const [statusFilter, setStatusFilter] = useState('payment_submitted');
  const [upgrades, setUpgrades] = useState(null);

  const load = () => client.get('/admin/upgrades', { params: { status: statusFilter || undefined } })
    .then(({ data }) => setUpgrades(data.upgrades));
  useEffect(() => { load(); }, [statusFilter]);

  const handleAction = async (id, action, notes) => {
    await client.patch(`/admin/upgrades/${id}`, { action, notes });
    load();
  };

  return (
    <div>
      <div className="tab-scroll" style={{ marginBottom: 16 }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-pill ${statusFilter === t.key ? 'tab-pill-active' : ''}`}
            onClick={() => setStatusFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {upgrades === null ? (
        <div className="empty-state">Loading upgrade requests…</div>
      ) : upgrades.length === 0 ? (
        <div className="empty-state">No upgrade requests in this stage.</div>
      ) : (
        upgrades.map((u) => <UpgradeCard key={u.id} upgrade={u} onAction={handleAction} />)
      )}
    </div>
  );
}
