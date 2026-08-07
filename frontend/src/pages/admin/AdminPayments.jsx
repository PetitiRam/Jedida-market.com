import { useEffect, useState } from "react";
import client from "../../api/client";
import PremiumButton from "../../components/payment/PremiumButton";
import { PaymentStatusBadge } from "../../components/payment/PaymentStatusCard";
import Icon from "../../components/icons/icon";
import "../../styles/payment-forms.css";

export default function AdminPayments() {

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [doneId, setDoneId] = useState(null);
  const [notes, setNotes] = useState({});
  const [noteOpenId, setNoteOpenId] = useState(null);
  const [noteCopiedId, setNoteCopiedId] = useState(null);
  const [previewSrc, setPreviewSrc] = useState(null);

  const loadPayments = async () => {
    try {
      const { data } = await client.get("/admin/payments/pending");
      setPayments(data.payments || []);
    } catch (err) {
      setError(err.response?.data?.error || "Failed loading payments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPayments(); }, []);

  const approvePayment = async (id) => {
    try {
      setBusyId(id);
      await client.post(`/admin/payments/${id}/approve`);
      setDoneId(id);
      setTimeout(() => loadPayments(), 500);
    } catch (err) {
      alert(err.response?.data?.error || "Approval failed");
    } finally {
      setBusyId(null);
    }
  };

  const rejectPayment = async (id) => {
    try {
      setBusyId(id);
      await client.post(`/admin/payments/${id}/reject`);
      setDoneId(id);
      setTimeout(() => loadPayments(), 500);
    } catch (err) {
      alert(err.response?.data?.error || "Reject failed");
    } finally {
      setBusyId(null);
    }
  };

  // No dedicated "request info" endpoint exists yet — this copies a
  // formatted note to the clipboard so an admin can paste it straight into
  // the buyer's existing chat conversation, without inventing a fake API call.
  const copyRequestNote = async (payment) => {
    const note = notes[payment.id] || "Could you confirm the transaction reference for this payment?";
    const text = `Regarding order ${payment.order_id}: ${note}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard unavailable — note stays visible in the textarea either way
    }
    setNoteCopiedId(payment.id);
    setTimeout(() => setNoteCopiedId(null), 1800);
  };

  if (loading) {
    return (
      <div className="jp-scope">
        <div className="jp-skeleton" style={{ height: 220, marginBottom: 20 }} />
        <div className="jp-skeleton" style={{ height: 220 }} />
      </div>
    );
  }

  return (
    <div className="jp-scope">

      <div className="jp-eyebrow"><Icon name="checkShield" size={13} /> Admin Review</div>
      <h2 className="jp-title" style={{ fontSize: "1.5rem", marginBottom: 4 }}>Manual Payment Verification</h2>
      <p className="jp-subtitle">Review submitted payment proofs and approve, reject, or request more information.</p>

      {error && <div className="alert alert-error">{error}</div>}

      {payments.length === 0 ? (
        <div className="empty-state">No payments waiting for verification.</div>
      ) : (
        payments.map((payment) => (
          <div className="jp-admin-card" key={payment.id}>

            <div className="jp-admin-head">
              <div>
                <div style={{ fontWeight: 800 }}>Payment #{String(payment.id).slice(0, 8)}</div>
                <div style={{ fontSize: "0.78rem", opacity: 0.85 }}>Order {String(payment.order_id).slice(0, 8)}</div>
              </div>
              <PaymentStatusBadge status={payment.status === "submitted" ? "submitted" : "pending"} />
            </div>

            <div className="jp-admin-body">

              <div className="jp-admin-grid">
                <div className="jp-admin-field">
                  <div className="jp-detail-label">Buyer</div>
                  <div className="jp-detail-value">{payment.buyer_name || "Unknown"}</div>
                </div>
                <div className="jp-admin-field">
                  <div className="jp-detail-label">Payment Method</div>
                  <div className="jp-detail-value">{payment.method}</div>
                </div>
                <div className="jp-admin-field">
                  <div className="jp-detail-label">Amount</div>
                  <div className="jp-detail-value jp-amount">
                    {payment.currency} {Number(payment.amount).toLocaleString()}
                  </div>
                </div>
                <div className="jp-admin-field">
                  <div className="jp-detail-label">Transaction Reference</div>
                  <div className="jp-detail-value">{payment.transaction_reference || "Not provided"}</div>
                </div>
              </div>

              {payment.payment_proof && (
                <div style={{ marginBottom: 18 }}>
                  <div className="jp-detail-label" style={{ marginBottom: 8 }}>Receipt</div>
                  <div className="jp-receipt-preview" onClick={() => setPreviewSrc(payment.payment_proof)}>
                    <img src={payment.payment_proof} alt="Payment proof" />
                  </div>
                </div>
              )}

              {noteOpenId === payment.id && (
                <div className="jp-field">
                  <label>Note to buyer</label>
                  <textarea
                    className="jp-input"
                    rows={3}
                    value={notes[payment.id] || ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [payment.id]: e.target.value }))}
                    placeholder="e.g. Could you confirm the transaction reference?"
                  />
                </div>
              )}

              <div className="jp-admin-actions">
                <PremiumButton
                  variant="primary"
                  loading={busyId === payment.id}
                  success={doneId === payment.id}
                  onClick={() => approvePayment(payment.id)}
                  icon={<Icon name="checkCircle" size={16} />}
                >
                  Approve
                </PremiumButton>

                <PremiumButton
                  variant="danger"
                  loading={busyId === payment.id}
                  onClick={() => rejectPayment(payment.id)}
                  icon={<Icon name="x" size={16} />}
                >
                  Reject
                </PremiumButton>

                <PremiumButton
                  variant="ghost"
                  success={noteCopiedId === payment.id}
                  onClick={() => {
                    if (noteOpenId === payment.id) copyRequestNote(payment);
                    else setNoteOpenId(payment.id);
                  }}
                  icon={<Icon name="headset" size={16} />}
                >
                  {noteOpenId === payment.id ? (noteCopiedId === payment.id ? "Copied" : "Copy Request") : "Request Info"}
                </PremiumButton>
              </div>
            </div>
          </div>
        ))
      )}

      {previewSrc && (
        <div className="jp-modal-overlay" onClick={() => setPreviewSrc(null)}>
          <div className="jp-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <img src={previewSrc} alt="Receipt full preview" style={{ width: "100%", display: "block" }} />
          </div>
        </div>
      )}

    </div>
  );
}
