import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import client from "../../api/client";
import MarketplaceHeader from "../../components/MarketplaceHeader";
import PaymentMethodSelector from "../../components/PaymentMethodSelector";
import ReceiptUploadZone from "../../components/payment/ReceiptUploadZone";
import CopyField from "../../components/payment/CopyField";
import PremiumButton from "../../components/payment/PremiumButton";
import PaymentSuccessCard from "../../components/payment/PaymentSuccessCard";
import AdminChatConnect from "../../components/payment/AdminChatConnect";
import Icon from "../../components/icons/icon";
import "../../styles/payment-forms.css";

// Static merchant receiving details shown to the buyer for each manual
// payment method — display-only, matches what ManualPaymentInstructions
// previously hard-coded.
const MERCHANT_INFO = {
  mtn_mobile_money: { label: "MTN Mobile Money", number: "0770 123 456" },
  airtel_money: { label: "Airtel Money", number: "0750 123 456" }
};

export default function PaymentCenter() {

  const { checkoutGroupId } = useParams();
  // Display-only: the route itself is named `:orderId`, so this reads the
  // same URL segment purely to fetch a receipt/order summary for the
  // sidebar. It does not affect the payment submission below.
  const { orderId: routeOrderId } = useParams();
  const navigate = useNavigate();

  const [method, setMethod] = useState("mtn_mobile_money");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [proofError, setProofError] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submittedPayment, setSubmittedPayment] = useState(null);

  const [orderSummary, setOrderSummary] = useState(null);

  // Read-only receipt fetch purely to populate the order summary card.
  // Uses the existing GET /orders/:orderId/receipt endpoint — no new API,
  // no change to the submit-payment flow below.
  useEffect(() => {
    if (!routeOrderId) return;
    client.get(`/orders/${routeOrderId}/receipt`)
      .then(({ data }) => setOrderSummary(data.receipt))
      .catch(() => setOrderSummary(null));
  }, [routeOrderId]);

  const handleFileSelected = (file, validationError) => {
    setProofError(validationError || "");
    if (validationError) return;
    setProof(file);
    setProofPreview(file.type?.startsWith("image/") ? URL.createObjectURL(file) : null);
  };

  const submitPayment = async (e) => {
    e?.preventDefault?.();

    if (!phone || !reference) {
      setError("Fill all payment details");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const formData = new FormData();
      formData.append("paymentMethod", method);
      formData.append("phoneNumber", phone);
      formData.append("transactionReference", reference);

      if (proof) {
        formData.append("proof", proof);
      }

      const { data } = await client.post(
        `/orders/cart-checkout/${checkoutGroupId}/submit-payment`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      setSuccess("Payment submitted. Waiting for admin verification.");
      setSubmittedPayment(data?.payments?.[0] || null);

      setTimeout(() => {
        navigate("/orders");
      }, 4000);

    } catch (err) {
      setError(err.response?.data?.error || "Payment submission failed");
    } finally {
      setLoading(false);
    }
  };

  const merchant = MERCHANT_INFO[method];
  const amountDue = submittedPayment?.amount ?? orderSummary?.total;
  const currency = submittedPayment?.currency || orderSummary?.currency || "UGX";

  return (
    <>
      <MarketplaceHeader />

      <div className="jp-scope dash-body" style={{ maxWidth: 1180 }}>

        <div className="jp-eyebrow">
          <Icon name="lock" size={13} /> Secure &amp; Encrypted Checkout
        </div>
        <h2 className="jp-title" style={{ fontSize: "1.8rem", marginBottom: 4 }}>Payment Center</h2>
        <p className="jp-subtitle">Complete your manual payment below — funds are held safely until admin verification.</p>

        {error && <div className="alert alert-error">{error}</div>}

        {success ? (

          <div className="jp-panel jp-panel-glass">
            <PaymentSuccessCard
              orderId={routeOrderId || submittedPayment?.order_id}
              reference={reference}
              amount={amountDue}
              currency={currency}
              methodLabel={merchant?.label}
              estimatedVerification="1 – 3 hours"
              onViewOrders={() => navigate("/orders")}
              onDone={() => navigate("/")}
            />
          </div>

        ) : (

          <div className="jp-shell">

            <div className="jp-panel">

              <div className="jp-eyebrow"><Icon name="sparkle" size={13} /> Step 1</div>
              <h3 className="jp-title" style={{ fontSize: "1.2rem" }}>Select Payment Method</h3>
              <p className="jp-subtitle">All payment methods are secure and encrypted.</p>

              <PaymentMethodSelector value={method} onChange={setMethod} />

              {merchant && (
                <>
                  <div style={{ height: 28 }} />
                  <div className="jp-eyebrow"><Icon name="phone" size={13} /> Step 2</div>
                  <h3 className="jp-title" style={{ fontSize: "1.2rem" }}>Pay with {merchant.label}</h3>

                  <div className="jp-instructions-banner">
                    <Icon name="alertCircle" size={16} />
                    <span>Send the exact amount to the merchant number below, then enter your own mobile money number and the transaction reference it gave you.</span>
                  </div>

                  <div className="jp-detail-grid">
                    <div className="jp-detail-row">
                      <div className="jp-detail-label">Merchant Name</div>
                      <div className="jp-detail-value">Jedida Marketplace</div>
                    </div>
                    <CopyField label="Merchant Number" value={merchant.number} />
                    <div className="jp-detail-row">
                      <div className="jp-detail-label">Account Name</div>
                      <div className="jp-detail-value">Jedida Marketplace Ltd</div>
                    </div>
                    <div className="jp-detail-row">
                      <div className="jp-detail-label">Amount to Pay</div>
                      <div className="jp-detail-value jp-amount">
                        {amountDue ? `${currency} ${Number(amountDue).toLocaleString()}` : "See order summary"}
                      </div>
                    </div>
                  </div>

                  <form onSubmit={submitPayment}>

                    <div className="jp-field">
                      <label>Your Mobile Money Number</label>
                      <input
                        className="jp-input"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="07XXXXXXXX"
                      />
                    </div>

                    <div className="jp-field">
                      <label>Transaction Reference <span className="jp-hint">(from your payment confirmation SMS)</span></label>
                      <input
                        className="jp-input"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="MTN/Airtel reference"
                      />
                    </div>

                    <div className="jp-field">
                      <label>Upload Payment Receipt <span className="jp-hint">(optional but speeds up verification)</span></label>
                      <ReceiptUploadZone
                        file={proof}
                        previewUrl={proofPreview}
                        error={proofError}
                        onFileSelected={handleFileSelected}
                        onRemove={() => { setProof(null); setProofPreview(null); setProofError(""); }}
                        onRetry={() => setProofError("")}
                      />
                    </div>

                    <div className="jp-lock-note" style={{ marginBottom: 14 }}>
                      <Icon name="lock" size={14} />
                      Your payment is safe with Jedida — held securely until you confirm your order.
                    </div>

                    <PremiumButton type="submit" loading={loading} icon={<Icon name="lock" size={16} />}>
                      {loading ? "Submitting..." : "Submit Payment"}
                    </PremiumButton>
                  </form>
                </>
              )}
            </div>

            <div className="jp-summary-sticky">

              <div className="jp-panel" style={{ marginBottom: 18 }}>
                <div className="jp-eyebrow"><Icon name="checkShield" size={13} /> Buyer Protection</div>
                <h3 className="jp-title" style={{ fontSize: "1.05rem", marginBottom: 16 }}>Buyer Protection by Jedida</h3>

                <div className="jp-protection-item">
                  <Icon name="lock" size={18} />
                  <div><strong>Secure Payment</strong><span>Your payment is held safely until you confirm delivery.</span></div>
                </div>
                <div className="jp-protection-item">
                  <Icon name="checkShield" size={18} />
                  <div><strong>Verified Seller</strong><span>This seller has been verified by Jedida.</span></div>
                </div>
                <div className="jp-protection-item">
                  <Icon name="refresh" size={18} />
                  <div><strong>Refund Guarantee</strong><span>Get a full refund if your order isn't as described.</span></div>
                </div>
                <div className="jp-protection-item" style={{ marginBottom: 0 }}>
                  <Icon name="clock" size={18} />
                  <div><strong>24/7 Support</strong><span>We're here to help you anytime.</span></div>
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <AdminChatConnect context="Payment" />
              </div>

              {orderSummary && (
                <div className="jp-panel">
                  <h3 className="jp-title" style={{ fontSize: "1.05rem", marginBottom: 16 }}>Order Summary</h3>
                  <div className="jp-summary-item">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{orderSummary.product}</div>
                      <div style={{ fontSize: "0.78rem", color: "#8A9189" }}>Qty {orderSummary.quantity} · {orderSummary.shop}</div>
                    </div>
                  </div>
                  <div className="jp-summary-line">
                    <span>Subtotal</span>
                    <span>{orderSummary.currency} {Number(orderSummary.unitPrice * orderSummary.quantity).toLocaleString()}</span>
                  </div>
                  {orderSummary.platformFee ? (
                    <div className="jp-summary-line">
                      <span>Platform Fee</span>
                      <span>{orderSummary.currency} {Number(orderSummary.platformFee).toLocaleString()}</span>
                    </div>
                  ) : null}
                  <div className="jp-summary-total">
                    <span>Total Amount</span>
                    <span className="jp-amount">{orderSummary.currency} {Number(orderSummary.total).toLocaleString()}</span>
                  </div>
                </div>
              )}

            </div>

          </div>

        )}

      </div>

    </>
  );
}
