import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import client from "../../api/client";
import * as dropshipApi from "../../api/dropshipApi";
import * as commerceApi from "../../api/commerceApi";
import { validateCoupon } from "../../api/couponsApi";
import MarketplaceHeader from "../../components/MarketplaceHeader";
import PaymentMethodSelector from "../../components/PaymentMethodSelector";
import PremiumButton from "../../components/payment/PremiumButton";
import TrustBadges from "../../components/product/TrustBadges";
import Icon from "../../components/icons/icon";
import "../../styles/payment-forms.css";
import "../../styles/checkout-premium.css";

const STEPS = ["Cart", "Checkout", "Payment"];

function StepProgress({ current }) {
  return (
    <div className="jpco-steps" aria-label="Checkout progress">
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const isDone = stepNum < current;
        const isCurrent = stepNum === current;
        return (
          <div key={label} style={{ display: "contents" }}>
            <div className={`jpco-step ${isDone ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`}>
              <div className="jpco-step-dot">{isDone ? <Icon name="check" size={13} /> : stepNum}</div>
              <div className="jpco-step-label">{label}</div>
            </div>
            {i < STEPS.length - 1 && <div className={`jpco-step-line ${isDone ? "is-done" : ""}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function Checkout() {

  const { productId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const dsAccessId = params.get("ds"); // present when opened via a dropshipper's resale link

  const [product, setProduct] = useState(null);
  const [accessId, setAccessId] = useState(null);
  const [quantity, setQuantity] = useState(Math.max(1, Number(params.get("qty") || 1)));
  const [method, setMethod] = useState("mtn_mobile_money");
  const [address, setAddress] = useState("");

  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null); // { code, discount }

  const [wishlisted, setWishlisted] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {

    async function loadProduct() {
      try {
        if (dsAccessId) {
          const { data } = await dropshipApi.getAccessForCheckout(dsAccessId);
          const a = data.access;
          setProduct({
            id: a.product_id, title: a.title, short_description: a.short_description,
            images: a.images, currency: a.currency, shop_id: a.shop_id,
            price: a.reseller_price, quantity_available: a.quantity_available,
            minimum_order_quantity: a.minimum_order_quantity
          });
          setAccessId(a.access_id);
          if (a.minimum_order_quantity) {
            setQuantity((q) => Math.max(q, a.minimum_order_quantity));
          }
          return;
        }
        const { data } = await client.get(`/products/${productId}`);
        setProduct(data.product);
      } catch (err) {
        setLoadError("Unable to load product.");
      }
    }

    loadProduct();

  }, [productId, dsAccessId]);

  useEffect(() => {
    if (!product?.id) return;
    commerceApi.getWishlistStatus(product.id)
      .then(({ data }) => setWishlisted(data.wishlisted))
      .catch(() => {});
    if (product.shop_id) {
      commerceApi.getShopFollowInfo(product.shop_id)
        .then(({ data }) => setFollowing(data.following))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, product?.shop_id]);

  const toggleWishlist = async () => {
    if (!product?.id || wishlistBusy) return;
    setWishlistBusy(true);
    try {
      const { data } = await commerceApi.toggleWishlist(product.id);
      setWishlisted(data.wishlisted);
    } catch (err) {
      // non-critical — leave state unchanged
    } finally {
      setWishlistBusy(false);
    }
  };

  const toggleFollow = async () => {
    if (!product?.shop_id || followBusy) return;
    setFollowBusy(true);
    try {
      const { data } = await commerceApi.toggleFollow(product.shop_id);
      setFollowing(data.following);
    } catch (err) {
      // non-critical — leave state unchanged
    } finally {
      setFollowBusy(false);
    }
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponBusy(true);
    setCouponError("");
    try {
      const { data } = await validateCoupon(couponCode.trim(), product.shop_id, subtotal);
      setAppliedCoupon({ code: data.coupon.code, discount: data.discount });
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err.response?.data?.error || "Could not apply that coupon.");
    } finally {
      setCouponBusy(false);
    }
  };

  const minQty = accessId ? Math.max(1, Number(product?.minimum_order_quantity) || 1) : 1;
  const maxQty = product?.quantity_available != null ? Number(product.quantity_available) : Infinity;
  const outOfStock = product && maxQty <= 0;
  const lowStock = product && !outOfStock && maxQty <= 5;

  const changeQty = (delta) => {
    setQuantity((q) => {
      const next = q + delta;
      if (next < minQty) return minQty;
      if (maxQty != null && next > maxQty) return maxQty;
      return next;
    });
    // quantity changed — any previously applied coupon discount was
    // computed against the old subtotal, so ask the buyer to re-apply.
    if (appliedCoupon) setAppliedCoupon(null);
  };

  const placeOrder = async () => {

    if (!address.trim()) {
      setError("Please enter delivery address.");
      return;
    }

    if (!method) {
      setError("Please select payment method.");
      return;
    }

    if (outOfStock) {
      setError("This product is currently out of stock.");
      return;
    }

    setBusy(true);
    setError("");

    try {

      const { data } = accessId
        ? await dropshipApi.createDropshipOrder({
            accessId,
            quantity,
            shippingAddress: address,
            method,
            ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {})
          })
        : await client.post(
            "/orders",
            {
              productId,
              quantity,
              shippingAddress: address,

              // manual payment identifier
              method,
              ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {})
            }
          );

      /*
        Redirect buyer to manual payment center
        with created order id
      */

      navigate(`/payment-center/${data.order.id}`);

    } catch (err) {
      setError(err.response?.data?.error || "Failed creating order.");
    } finally {
      setBusy(false);
    }

  };

  if (loadError) {
    return (
      <>
        <MarketplaceHeader />
        <div className="jp-scope jpco-wrap dash-body">
          <div className="alert alert-error">{loadError}</div>
        </div>
      </>
    );
  }

  if (!product) {
    return (
      <>
        <MarketplaceHeader />
        <div className="jp-scope jpco-wrap dash-body">
          <div className="jp-panel">
            <div className="jpco-skel-row">
              <div className="jp-skeleton" />
              <div className="jpco-skel-col">
                <div className="jp-skeleton" style={{ height: 16, width: "70%" }} />
                <div className="jp-skeleton" style={{ height: 14, width: "40%" }} />
                <div className="jp-skeleton" style={{ height: 30, width: "50%" }} />
              </div>
            </div>
          </div>
          <div className="jp-skeleton" style={{ height: 120, marginTop: 16 }} />
          <div className="jp-skeleton" style={{ height: 180, marginTop: 16 }} />
        </div>
      </>
    );
  }

  const unitPrice = Number(product.price);
  const subtotal = unitPrice * quantity;
  const discount = appliedCoupon?.discount || 0;
  const total = Math.max(0, subtotal - discount);

  const specs = (product.specs && typeof product.specs === "object") ? product.specs : {};
  const rating = specs.rating;
  const reviewCount = specs.review_count || 0;

  const shipping = (() => {
    if (!product.shipping_options) return null;
    const s = typeof product.shipping_options === "string"
      ? (() => { try { return JSON.parse(product.shipping_options); } catch { return {}; } })()
      : product.shipping_options;
    if (!s || Array.isArray(s)) return null;
    if (!s.deliveryTime && !s.shippingCost && !s.warehouseLocation) return null;
    return s;
  })();

  const canPay = !outOfStock && address.trim().length > 0 && !!method;

  return (

    <>

      <MarketplaceHeader />

      <div className="jp-scope jpco-wrap dash-body">

        <div className="jpco-topbar">
          <button className="jpco-back" onClick={() => navigate(-1)}>
            <Icon name="chevronLeft" size={16} /> Back
          </button>
          <div className="jp-eyebrow"><Icon name="lock" size={13} /> Secure Checkout</div>
        </div>

        <StepProgress current={2} />

        {error && <div className="alert alert-error jpco-anim" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="jpco-grid">

          <div className="jpco-main">

            {/* Product Summary */}
            <section className="jp-panel jpco-anim jpco-d1">
              <div className="jpco-section-title">
                <span className="jpco-section-num">1</span> Product Summary
              </div>

              <div className="jpco-product">
                <div className="jpco-product-img-wrap">
                  <img
                    className="jpco-product-img"
                    src={product.images?.[0]}
                    alt={product.title}
                    loading="lazy"
                  />
                  <button
                    className="jpco-wishlist-btn"
                    onClick={toggleWishlist}
                    disabled={wishlistBusy}
                    aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
                    aria-pressed={wishlisted}
                    style={{ color: wishlisted ? "var(--jp-danger, #C0392B)" : "var(--jp-ink)" }}
                  >
                    <Icon
                      name={wishlisted ? "heartFilled" : "heart"}
                      size={16}
                      fill={wishlisted ? "currentColor" : "none"}
                    />
                  </button>
                </div>

                <div className="jpco-product-info">
                  <div className="jpco-product-title">{product.title}</div>

                  <div className="jpco-meta-row">
                    {product.shop_name && (
                      <span>
                        {product.shop_name}
                        {product.shop_is_verified && (
                          <span style={{ color: "var(--jp-emerald)", marginLeft: 4, display: "inline-flex", verticalAlign: -2 }}>
                            <Icon name="checkShield" size={13} />
                          </span>
                        )}
                      </span>
                    )}
                    {rating != null && (
                      <span className="jpco-rating">
                        <Icon name="starFilled" size={13} fill="currentColor" /> {rating} {reviewCount ? `(${reviewCount})` : ""}
                      </span>
                    )}
                  </div>

                  <div className="jpco-meta-row" style={{ marginBottom: 0 }}>
                    {outOfStock ? (
                      <span className="jpco-stock-badge jpco-stock-out">Out of Stock</span>
                    ) : lowStock ? (
                      <span className="jpco-stock-badge jpco-stock-low">Only {maxQty} left</span>
                    ) : (
                      <span className="jpco-stock-badge jpco-stock-in"><Icon name="checkCircle" size={12} /> In Stock</span>
                    )}
                  </div>

                  <div className="jpco-qty-row">
                    <div className="jpco-stepper">
                      <button onClick={() => changeQty(-1)} disabled={quantity <= minQty} aria-label="Decrease quantity">−</button>
                      <span>{quantity}</span>
                      <button onClick={() => changeQty(1)} disabled={quantity >= maxQty} aria-label="Increase quantity">+</button>
                    </div>
                    <div className="jpco-price-block">
                      <div className="jpco-price-line">{product.currency} {subtotal.toLocaleString()}</div>
                      <div className="jpco-price-unit">{product.currency} {unitPrice.toLocaleString()} each</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Seller Information */}
            {product.shop_name && (
              <section className="jp-panel jpco-anim jpco-d2">
                <div className="jpco-section-title">
                  <span className="jpco-section-num">2</span> Seller Information
                </div>
                <div className="jpco-seller">
                  {product.shop_logo ? (
                    <img className="jpco-seller-logo" src={product.shop_logo} alt={product.shop_name} loading="lazy" />
                  ) : (
                    <div className="jpco-seller-logo" />
                  )}
                  <div>
                    <div className="jpco-seller-name">
                      {product.shop_name}
                      {product.shop_is_verified && (
                        <span className="jpco-verified-pill"><Icon name="checkShield" size={11} /> Verified Seller</span>
                      )}
                    </div>
                    {product.shop_is_verified && (
                      <div className="jpco-seller-sub">Verified by Jedida Marketplace</div>
                    )}
                  </div>
                  <div className="jpco-seller-actions">
                    <button className="btn-secondary" onClick={toggleFollow} disabled={followBusy}>
                      {following ? "Following" : "Follow Shop"}
                    </button>
                    {product.shop_slug && (
                      <Link className="btn-secondary" to={`/s/${product.shop_slug}`}>Visit Shop</Link>
                    )}
                  </div>
                </div>

                {(specs.completed_orders_count || specs.response_rate || specs.avg_response_time || specs.years_on_marketplace) && (
                  <div className="jpco-seller-stats">
                    {specs.completed_orders_count && (
                      <div className="jpco-seller-stat"><strong>{specs.completed_orders_count}</strong><span>Orders</span></div>
                    )}
                    {specs.response_rate && (
                      <div className="jpco-seller-stat"><strong>{specs.response_rate}%</strong><span>Response Rate</span></div>
                    )}
                    {specs.avg_response_time && (
                      <div className="jpco-seller-stat"><strong>{specs.avg_response_time}</strong><span>Response Time</span></div>
                    )}
                    {specs.years_on_marketplace && (
                      <div className="jpco-seller-stat"><strong>{specs.years_on_marketplace}</strong><span>Years on JEDIDA</span></div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Delivery Address */}
            <section className="jp-panel jpco-anim jpco-d3">
              <div className="jpco-section-title">
                <span className="jpco-section-num">{product.shop_name ? 3 : 2}</span> Delivery Address
              </div>

              <div className="jp-field jpco-address-icon-input" style={{ marginBottom: 0 }}>
                <Icon name="mapPin" size={16} />
                <textarea
                  className="jp-input"
                  rows={3}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter delivery location — street, area, city"
                  aria-label="Delivery address"
                />
              </div>

              {shipping && (
                <div className="jpco-shipping-note">
                  <Icon name="truck" size={16} />
                  <div className="jpco-shipping-grid">
                    {shipping.deliveryTime && <span>Est. delivery: <strong>{shipping.deliveryTime}</strong></span>}
                    {shipping.shippingCost && <span>Delivery fee: <strong>{product.currency} {shipping.shippingCost}</strong></span>}
                    {shipping.warehouseLocation && <span>Ships from: <strong>{shipping.warehouseLocation}</strong></span>}
                  </div>
                </div>
              )}
            </section>

            {/* Payment Method */}
            <section className="jp-panel jpco-anim jpco-d4">
              <div className="jpco-section-title">
                <span className="jpco-section-num">{product.shop_name ? 4 : 3}</span> Payment Method
              </div>

              <PaymentMethodSelector value={method} onChange={setMethod} />

              <div className="jpco-payment-hint">
                <Icon name="clock" size={14} />
                <span>You'll enter your mobile money number and submit your transaction reference on the next screen, JEDIDA Payment Center.</span>
              </div>
            </section>

            <section className="jp-panel jpco-trust-card jpco-anim jpco-d5">
              <TrustBadges specs={specs} shopIsVerified={!!product.shop_is_verified} />
            </section>

          </div>

          {/* Order Summary */}
          <aside>
            <div className="jp-panel jpco-sidebar jpco-anim jpco-d2">

              <div className="jp-summary-item">
                <img className="jp-summary-thumb" src={product.images?.[0]} alt={product.title} loading="lazy" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>{product.title} × {quantity}</div>
                </div>
              </div>

              <div className="jpco-coupon-row">
                <input
                  className="jp-input"
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value); setAppliedCoupon(null); setCouponError(""); }}
                  placeholder="Coupon code"
                  aria-label="Coupon code"
                />
                <PremiumButton loading={couponBusy} onClick={applyCoupon} style={{ whiteSpace: "nowrap" }}>
                  Apply
                </PremiumButton>
              </div>
              {couponError && <div className="alert alert-error" style={{ marginBottom: 14 }}>{couponError}</div>}
              {appliedCoupon && (
                <div className="jpco-applied-coupon">
                  <Icon name="checkCircle" size={14} /> "{appliedCoupon.code}" applied — {product.currency} {discount.toLocaleString()} off
                </div>
              )}

              <div className="jp-summary-line"><span>Subtotal</span><span>{product.currency} {subtotal.toLocaleString()}</span></div>
              {discount > 0 && (
                <div className="jp-summary-line" style={{ color: "#0B7A56" }}>
                  <span>Discount</span><span>− {product.currency} {discount.toLocaleString()}</span>
                </div>
              )}
              {shipping?.shippingCost && (
                <div className="jp-summary-line"><span>Delivery Fee</span><span>{product.currency} {shipping.shippingCost}</span></div>
              )}

              <div className="jp-summary-total">
                <span>Total</span>
                <strong className="jp-amount">{product.currency} {total.toLocaleString()}</strong>
              </div>

              <div style={{ marginTop: 20 }} className="jpco-cta-desktop">
                <PremiumButton loading={busy} disabled={!canPay} onClick={placeOrder} icon={<Icon name="lock" size={16} />}>
                  {busy ? "Creating Order..." : "Continue to Payment"}
                </PremiumButton>
              </div>

              <div style={{ marginTop: 22 }}>
                <div className="jp-protection-item">
                  <Icon name="shield" size={18} />
                  <div><strong>Secure Checkout</strong><span>Your data is protected end-to-end</span></div>
                </div>
                <div className="jp-protection-item">
                  <Icon name="checkShield" size={18} />
                  <div><strong>Escrow Protection</strong><span>Funds are only released after delivery is confirmed</span></div>
                </div>
                <div className="jp-protection-item" style={{ marginBottom: 0 }}>
                  <Icon name="headset" size={18} />
                  <div><strong>Buyer Support</strong><span>JEDIDA admins are on hand if anything goes wrong</span></div>
                </div>
              </div>

            </div>
          </aside>

        </div>

      </div>

      <div className="jp-scope jpco-mobile-bar">
        <div className="jpco-mobile-total">
          <div className="jpco-mobile-total-label">Total</div>
          <div className="jpco-mobile-total-amt">{product.currency} {total.toLocaleString()}</div>
        </div>
        <PremiumButton loading={busy} disabled={!canPay} onClick={placeOrder} icon={<Icon name="lock" size={16} />}>
          {busy ? "Creating..." : "Continue to Payment"}
        </PremiumButton>
      </div>

    </>

  );

}
