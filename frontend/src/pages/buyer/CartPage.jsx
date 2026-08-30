import { useEffect, useState } from "react";
import MarketplaceHeader from "../../components/MarketplaceHeader";
import Icon from "../../components/icons/icon";
import * as commerceApi from "../../api/commerceApi";
import client from "../../api/client";
import PaymentMethodSelector from "../../components/PaymentMethodSelector";
import ReceiptUploadZone from "../../components/payment/ReceiptUploadZone";
import PremiumButton from "../../components/payment/PremiumButton";
import PaymentSuccessCard from "../../components/payment/PaymentSuccessCard";
import "../../styles/payment-forms.css";

export default function CartPage({ embedded = false } = {}) {
  const [cart, setCart] = useState(null);

  const [method, setMethod] = useState("mtn_mobile_money");
  const [checkingOut, setCheckingOut] = useState(false);

  const [checkoutResult, setCheckoutResult] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [phoneNumber, setPhoneNumber] = useState("");
  const [pesajetNetwork, setPesajetNetwork] = useState("mtn");
  const [transactionReference, setTransactionReference] = useState("");
  const [proof, setProof] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [proofError, setProofError] = useState("");


  const load = async () => {
    const { data } = await commerceApi.getCart();
    setCart(data);
  };


  useEffect(() => {
    load();
  }, []);


  const checkoutCart = async () => {

    setCheckingOut(true);

    try {

      const pesajetFields = method === "pesajet"
        ? { phoneNumber, network: pesajetNetwork }
        : {};

      const { data } = await client.post(
        "/orders/cart-checkout",
        {
          method,
          shippingAddress: "",
          ...pesajetFields
        }
      );


      setCheckoutResult(data);

      // Cash on Delivery, PesaJet, and Jedida Wallet never go through the
      // manual proof-of-payment form below — COD has nothing to submit
      // (paid at the door), PesaJet is an automated charge, and a wallet
      // payment is already confirmed (paid_escrow, cart cleared) by the
      // time this response comes back. Only the legacy manual mtn/airtel/
      // bank flow needs the reference+screenshot step, same split as the
      // single-item Checkout page.
      if (data.codPending || method === "pesajet" || method === "wallet") {
        setSubmitted(true);
      }


    } catch (err) {

      alert(
        err.response?.data?.error ||
        "Could not checkout."
      );

    } finally {

      setCheckingOut(false);

    }
  };

  const handleFileSelected = (file, validationError) => {
    setProofError(validationError || "");
    if (validationError) return;
    setProof(file);
    setProofPreview(file.type?.startsWith("image/") ? URL.createObjectURL(file) : null);
  };

  const submitPayment = async () => {

    if (!phoneNumber || !transactionReference) {

      alert(
        "Enter payment number and transaction reference"
      );

      return;
    }

    if (!proof) {
      alert("Please attach your payment screenshot.");
      return;
    }


    try {
      setSubmitting(true);

      const formData = new FormData();
      formData.append("paymentMethod", method);
      formData.append("phoneNumber", phoneNumber);
      formData.append("transactionReference", transactionReference);
      formData.append("proof", proof);

      // Same proof-upload endpoint the single-item Payment Center uses —
      // this used to incorrectly call the sandbox-only cart-checkout
      // "/confirm" endpoint, which rejects anything that wasn't charged
      // through a sandbox provider reference (i.e. always, for real
      // mtn/airtel manual payments). Submitting proof here instead queues
      // it for admin review, same as single-item checkout.
      await client.post(
        `/orders/cart-checkout/${checkoutResult.checkoutGroupId}/submit-payment`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      setSubmitted(true);

      setTimeout(() => {
        window.location.href = "/orders";
      }, 4000);


    } catch (err) {

      alert(
        err.response?.data?.error ||
        "Payment submission failed"
      );

    } finally {
      setSubmitting(false);
    }

  };


  if (!cart) {

    return (
      <div className="jp-scope empty-state">
        <div className="jp-skeleton" style={{ height: 120, maxWidth: 400, margin: "0 auto" }} />
      </div>
    );

  }


  return (

    <div>

      {!embedded && <MarketplaceHeader />}


      <div
        className="jp-scope dash-body"
        style={{ maxWidth: 800 }}
      >

        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="cart" size={22} />
          Your Cart
        </h2>


        {cart.items.map(item => (

          <div
            key={item.id}
            className="card-surface"
            style={{
              marginBottom: 10
            }}
          >

            <strong>
              {item.title}
            </strong>

            <p>
              {item.currency}{" "}
              {item.price.toLocaleString()}
              {" "}× {item.quantity}
            </p>


          </div>

        ))}



        {submitted ? (

          <div className="jp-panel jp-panel-glass">
            {method === "cash_on_delivery" ? (
              <PaymentSuccessCard
                reference={null}
                amount={checkoutResult?.combinedTotal}
                methodLabel="Cash on Delivery"
                estimatedVerification="Pay the delivery agent when your order arrives"
                onViewOrders={() => { window.location.href = "/orders"; }}
                onDone={() => { window.location.href = "/"; }}
              />
            ) : method === "pesajet" ? (
              <PaymentSuccessCard
                reference={checkoutResult?.providerReference}
                amount={checkoutResult?.combinedTotal}
                methodLabel="Mobile Money (PesaJet)"
                estimatedVerification="Authorize the payment on your phone to complete it"
                onViewOrders={() => { window.location.href = "/orders"; }}
                onDone={() => { window.location.href = "/"; }}
              />
            ) : (
              <PaymentSuccessCard
                reference={transactionReference}
                amount={checkoutResult?.combinedTotal}
                methodLabel={method}
                estimatedVerification="1 – 3 hours"
                onViewOrders={() => { window.location.href = "/orders"; }}
                onDone={() => { window.location.href = "/"; }}
              />
            )}
          </div>

        ) : !checkoutResult ? (

          <div className="jp-panel">

            <div className="jp-eyebrow"><Icon name="lock" size={13} /> Choose how to pay</div>
            <h3 className="jp-title" style={{ fontSize: "1.15rem" }}>Payment Method</h3>

            <PaymentMethodSelector
              value={method}
              onChange={setMethod}
            />

            {method === "pesajet" && (
              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                <div className="jp-field">
                  <label>Mobile Money Network</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className={pesajetNetwork === "mtn" ? "btn-primary" : "btn-secondary"}
                      onClick={() => setPesajetNetwork("mtn")}
                    >
                      MTN Mobile Money
                    </button>
                    <button
                      type="button"
                      className={pesajetNetwork === "airtel" ? "btn-primary" : "btn-secondary"}
                      onClick={() => setPesajetNetwork("airtel")}
                    >
                      Airtel Money
                    </button>
                  </div>
                </div>
                <div className="jp-field">
                  <label>Phone number</label>
                  <input
                    className="jp-input"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    placeholder="+256XXXXXXXXX"
                  />
                </div>
              </div>
            )}

            {method === "cash_on_delivery" && (
              <div className="jp-instructions-banner" style={{ marginTop: 16 }}>
                You will pay the delivery agent in cash when your order arrives. No payment details needed now.
              </div>
            )}

            <div style={{ marginTop: 20 }}>
              <PremiumButton
                loading={checkingOut}
                disabled={method === "pesajet" && !phoneNumber}
                onClick={checkoutCart}
              >
                {checkingOut
                  ? "Placing order..."
                  : method === "cash_on_delivery"
                    ? "Place Order"
                    : "Continue to Payment"}
              </PremiumButton>
            </div>


          </div>


        ) : (


          <div className="jp-panel">

            <div className="jp-eyebrow"><Icon name="phone" size={13} /> Almost done</div>
            <h3 className="jp-title" style={{ fontSize: "1.15rem" }}>Complete Payment</h3>

            <div className="jp-detail-grid">
              <div className="jp-detail-row">
                <div className="jp-detail-label">Amount</div>
                <div className="jp-detail-value jp-amount">{checkoutResult.combinedTotal}</div>
              </div>
              <div className="jp-detail-row">
                <div className="jp-detail-label">Pay Using</div>
                <div className="jp-detail-value">{method}</div>
              </div>
            </div>

            <div className="jp-field">
              <label>Mobile Money Number</label>
              <input
                className="jp-input"
                value={phoneNumber}
                onChange={
                  e => setPhoneNumber(e.target.value)
                }
                placeholder="07XXXXXXXX"
              />
            </div>

            <div className="jp-field">
              <label>Transaction Reference</label>
              <input
                className="jp-input"
                value={transactionReference}
                onChange={
                  e => setTransactionReference(e.target.value)
                }
                placeholder="Transaction ID"
              />
            </div>

            <div className="jp-field">
              <label>Payment Screenshot</label>
              <ReceiptUploadZone
                file={proof}
                previewUrl={proofPreview}
                error={proofError}
                onFileSelected={handleFileSelected}
                onRemove={() => { setProof(null); setProofPreview(null); setProofError(""); }}
                onRetry={() => setProofError("")}
              />
            </div>

            <div className="jp-instructions-banner">
              Send money to JEDIDA Marketplace account, then wait for verification.
              Your order will then enter escrow.
            </div>

            <PremiumButton loading={submitting} onClick={submitPayment}>
              {submitting ? "Submitting..." : "Submit Payment"}
            </PremiumButton>


          </div>


        )}

      </div>


    </div>

  );

}
