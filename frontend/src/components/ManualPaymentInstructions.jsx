import CopyField from "./payment/CopyField";
import Icon from "./icons/icon";
import "../styles/payment-forms.css";

const PAYMENT_INFO = {
  mtn_mobile_money: {
    name: "MTN Mobile Money",
    number: "0770 123 456"
  },
  airtel_money: {
    name: "Airtel Money",
    number: "0750 123 456"
  }
};

export default function ManualPaymentInstructions({ method, amount, currency = "UGX" }) {

  const info = PAYMENT_INFO[method];

  if (!info) return null;

  return (
    <div className="jp-scope jp-panel">

      <div className="jp-eyebrow"><Icon name="phone" size={13} /> Manual Payment</div>
      <h3 className="jp-title" style={{ fontSize: "1.15rem" }}>Pay using {info.name}</h3>

      <div className="jp-instructions-banner">
        <Icon name="alertCircle" size={16} />
        <span>Send the exact amount below, then submit your transaction reference for verification.</span>
      </div>

      <div className="jp-detail-grid">
        <div className="jp-detail-row">
          <div className="jp-detail-label">Business Name</div>
          <div className="jp-detail-value">JEDIDA Marketplace</div>
        </div>
        <CopyField label="Payment Number" value={info.number} />
        <div className="jp-detail-row">
          <div className="jp-detail-label">Amount</div>
          <div className="jp-detail-value jp-amount">{currency} {Number(amount || 0).toLocaleString()}</div>
        </div>
      </div>

    </div>
  );
}
