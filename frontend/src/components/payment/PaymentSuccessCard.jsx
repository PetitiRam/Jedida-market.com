import Icon from "../icons/icon";
import PremiumButton from "./PremiumButton";

export default function PaymentSuccessCard({
  orderId,
  reference,
  amount,
  currency = "UGX",
  methodLabel,
  submittedAt,
  estimatedVerification = "1–3 hours",
  onViewOrders,
  onDone
}) {
  return (
    <div className="jp-success-wrap jp-fade-in">
      <div className="jp-success-icon">
        <Icon name="checkCircle" size={40} />
      </div>

      <div className="jp-success-title">Payment Submitted</div>
      <p className="jp-success-sub">
        Thanks — we've received your payment details and they're now queued for verification.
      </p>

      <div className="jp-success-grid">
        <div className="jp-detail-row">
          <div className="jp-detail-label">Order ID</div>
          <div className="jp-detail-value">{orderId || "—"}</div>
        </div>
        <div className="jp-detail-row">
          <div className="jp-detail-label">Reference Number</div>
          <div className="jp-detail-value">{reference || "—"}</div>
        </div>
        <div className="jp-detail-row">
          <div className="jp-detail-label">Amount</div>
          <div className="jp-detail-value jp-amount">
            {currency} {Number(amount || 0).toLocaleString()}
          </div>
        </div>
        <div className="jp-detail-row">
          <div className="jp-detail-label">Payment Method</div>
          <div className="jp-detail-value">{methodLabel || "—"}</div>
        </div>
        <div className="jp-detail-row">
          <div className="jp-detail-label">Submitted</div>
          <div className="jp-detail-value">{submittedAt || "Just now"}</div>
        </div>
        <div className="jp-detail-row">
          <div className="jp-detail-label">Est. Verification Time</div>
          <div className="jp-detail-value">{estimatedVerification}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <PremiumButton variant="primary" onClick={onViewOrders} style={{ flex: 1, minWidth: 180 }}>
          Track My Order
        </PremiumButton>
        <PremiumButton variant="ghost" onClick={onDone} style={{ flex: 1, minWidth: 180 }}>
          Back to Marketplace
        </PremiumButton>
      </div>
    </div>
  );
}
