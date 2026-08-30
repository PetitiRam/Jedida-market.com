import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import * as shopApi from '../api/shopApi';
import * as commerceApi from '../api/commerceApi';
import MarketplaceHeader from '../components/MarketplaceHeader';
import Icon from '../components/icons/icon';
import ShareShopButton from '../components/ShareShopButton';
import { CATEGORIES } from '../constants/categories';
import B2BQuoteRequestModal from '../components/product/B2BQuoteRequestModal';
import ShopReviewsSection from '../components/ShopReviewsSection';
import ShopFeedSection from '../components/ShopFeedSection';

const STOCK_LABELS = {
  in_stock: 'In stock',
  limited_stock: 'Limited stock',
  made_to_order: 'Made to order',
  out_of_stock: 'Out of stock'
};

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Popular' },
  { value: 'price_low', label: 'Price: Low to High' },
  { value: 'price_high', label: 'Price: High to Low' },
  { value: 'best_rated', label: 'Best Rated' }
];

// Maps the real admin-configured payment section (settingsCenter "payment")
// onto a small icon/label row. Nothing here is invented — a provider only
// shows up if the flag returned by the backend is actually true.
const PAYMENT_METHOD_DISPLAY = [
  { flag: 'enableMobileMoney', label: 'Mobile Money' },
  { flag: 'enablePesajet', label: 'PesaJet' },
  { flag: 'enableCardPayments', label: 'Cards' },
  { flag: 'enableBankTransfer', label: 'Bank Transfer' },
  { flag: 'enableCash', label: 'Cash on Delivery' }
];

function formatResponseTime(minutes) {
  if (minutes == null) return null;
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours < 1.5 ? 1 : Math.round(hours)} hr${hours >= 1.5 ? 's' : ''}`;
  return `${Math.round(hours / 24)} day${hours >= 48 ? 's' : ''}`;
}

function ProductCardShop({ product, view, onNavigate, isB2B }) {
  const specs = product.specs || {};
  const hasDiscount = specs.original_price && Number(specs.original_price) > Number(product.price);
  const discountPercent = hasDiscount ? Math.round((1 - product.price / specs.original_price) * 100) : null;

  if (view === 'list') {
    return (
      <div onClick={onNavigate} className="card-surface" style={{ display: 'flex', gap: 14, cursor: 'pointer', marginBottom: 10 }}>
        <div style={{ width: 90, height: 90, borderRadius: 10, background: 'var(--cream-dim)', flexShrink: 0, overflow: 'hidden' }}>
          {product.images?.[0] && <img src={product.images[0]} alt={product.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <div style={{ flex: 1 }}>
          <strong>{product.title}</strong>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontWeight: 800, color: 'var(--forest)' }}>{product.currency} {Number(product.price).toLocaleString()}{isB2B ? '/unit' : ''}</span>
            {hasDiscount && <span style={{ textDecoration: 'line-through', color: '#8A9189', fontSize: '0.8rem' }}>{product.currency} {specs.original_price}</span>}
            {discountPercent && <span className="product-card-badge">-{discountPercent}%</span>}
          </div>
          <div className="product-card-meta">
            {product.quantity_available > 0 ? `${product.quantity_available} in stock` : 'Out of stock'}
            {isB2B && ` · MOQ ${product.minimum_order_quantity} units`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div onClick={onNavigate} className="product-card" style={{ cursor: 'pointer' }}>
      <div className="product-card-image">
        {product.images?.[0] ? <img src={product.images[0]} alt={product.title} loading="lazy" /> : 'No image'}
      </div>
      <div className="product-card-body">
        {discountPercent && <span className="product-card-badge">-{discountPercent}%</span>}
        <div className="product-card-title">{product.title}</div>
        <div className="product-card-price">{product.currency} {Number(product.price).toLocaleString()}{isB2B ? '/unit' : ''}</div>
        {hasDiscount && <span style={{ textDecoration: 'line-through', color: '#8A9189', fontSize: '0.75rem' }}>{product.currency} {specs.original_price}</span>}
        <div className="product-card-meta">
          {product.quantity_available > 0 ? 'In stock' : 'Out of stock'}
          {isB2B && ` · MOQ ${product.minimum_order_quantity}`}
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { key: 'world', label: 'World', sub: 'Know the store' },
  { key: 'shop', label: 'Shop', sub: 'Products & Collections' },
  { key: 'connect', label: 'Connect', sub: 'Talk & do business' }
];

export default function PublicShop() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [trendingProducts, setTrendingProducts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState(null);

  const tab = ['world', 'shop', 'connect'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'world';
  const setTab = (t) => setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set('tab', t); return p; }, { replace: true });

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState('grid');
  const [page, setPage] = useState(1);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [quoteNotice, setQuoteNotice] = useState('');
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquiryText, setInquiryText] = useState('');
  const [inquiryBusy, setInquiryBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);

  const load = () => {
    setLoading(true);
    shopApi.getPublicShopV2(slug, { search, category, sort, view, page, limit: 24 })
      .then(({ data }) => {
        setShop(data.shop);
        setProducts(data.products);
        setTrendingProducts(data.trendingProducts || []);
        setCollections(data.collections || []);
        setPagination(data.pagination);
      })
      .catch((err) => setError(err.response?.data?.error || 'Shop not found.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [slug, search, category, sort, page]);

  useEffect(() => {
    if (!shop) return;
    client.get(`/shops/${shop.id}/follow/info`).then(({ data }) => setFollowing(data.following)).catch(() => {});
  }, [shop?.id]);

  useEffect(() => {
    shopApi.getPublicPaymentMethods().then(({ data }) => setPaymentMethods(data)).catch(() => {});
  }, []);

  const toggleFollow = async () => {
    const { data } = await commerceApi.toggleFollow(shop.id);
    setFollowing(data.following);
    setShop((s) => ({ ...s, followerCount: s.followerCount + (data.following ? 1 : -1) }));
  };

  if (loading && !shop) return <div className="empty-state">Loading shop…</div>;
  if (error) return <div className="empty-state">{error}</div>;

  const isB2B = ['manufacturer', 'supplier'].includes(shop.owner_role);
  const bp = shop.businessProfile;
  const yearsOnJedida = Math.max(0, new Date().getFullYear() - new Date(shop.owner_joined_at).getFullYear());
  const responseLabel = formatResponseTime(shop.avgResponseMinutes);
  const isFastResponder = shop.avgResponseMinutes != null && shop.avgResponseMinutes <= 60;
  const enabledPaymentMethods = paymentMethods
    ? PAYMENT_METHOD_DISPLAY.filter((m) => paymentMethods[m.flag])
    : [];

  const sendInquiry = async () => {
    if (!inquiryText.trim()) return;
    setInquiryBusy(true);
    try {
      // Reuses the existing chat-v2 system (same admin-bridged,
      // anti-contact-sharing infrastructure every other cross-role
      // conversation goes through) rather than opening a new channel.
      await client.post('/chat-v2/contact-product', {
        productId: products[0]?.id,
        message: `Business inquiry for ${shop.name}: ${inquiryText}`
      });
      setInquiryText('');
      setInquiryOpen(false);
      setQuoteNotice('Inquiry sent — check Messages for the reply.');
      setTimeout(() => setQuoteNotice(''), 4000);
    } catch {
      setQuoteNotice('Could not send inquiry. Please try again.');
    } finally {
      setInquiryBusy(false);
    }
  };

  const startChat = async () => {
    if (!products[0]?.id) {
      setQuoteNotice('This shop has no listed products to start a conversation from yet.');
      setTimeout(() => setQuoteNotice(''), 4000);
      return;
    }
    setChatBusy(true);
    try {
      await client.post('/chat-v2/contact-product', { productId: products[0].id });
      navigate('/messages');
    } catch {
      setQuoteNotice('Could not open chat. Please try again.');
      setTimeout(() => setQuoteNotice(''), 4000);
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <div>
      <MarketplaceHeader />

      {/* World/Shop/Connect layer nav + follow/share — sits directly under
          the real marketplace header, matches the approved layout. */}
      <div style={{ background: 'var(--forest-dark)', color: '#fff', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <nav style={{ display: 'flex', gap: 28 }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
                  padding: '14px 0', borderBottom: tab === t.key ? '2px solid var(--amber)' : '2px solid transparent',
                  opacity: tab === t.key ? 1 : 0.75
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{t.label}</div>
                <div style={{ fontSize: '0.68rem', opacity: 0.8 }}>{t.sub}</div>
              </button>
            ))}
          </nav>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 0' }}>
            <ShareShopButton url={shop.share_link || window.location.href} title={shop.name} />
            <button className="btn-primary" onClick={toggleFollow} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="user" size={15} filled={following} color={following ? 'var(--forest-dark)' : 'currentColor'} />
              {following ? 'Following' : 'Follow'} {shop.followerCount > 0 && `· ${shop.followerCount}`}
            </button>
          </div>
        </div>
      </div>

      {quoteNotice && <div className="alert alert-success" style={{ margin: '10px 20px 0' }}>{quoteNotice}</div>}

      {tab === 'world' && (
        <WorldTab
          shop={shop} bp={bp} isB2B={isB2B} yearsOnJedida={yearsOnJedida}
          responseLabel={responseLabel} isFastResponder={isFastResponder}
          collections={collections} trendingProducts={trendingProducts}
          enabledPaymentMethods={enabledPaymentMethods}
          onNavigateProduct={(id) => navigate(`/product/${id}`)}
          onGoShop={() => setTab('shop')} onGoConnect={() => setTab('connect')}
          onStartChat={startChat} chatBusy={chatBusy}
        />
      )}

      {tab === 'shop' && (
        <ShopTab
          shop={shop} isB2B={isB2B} bp={bp}
          search={search} setSearch={setSearch} category={category} setCategory={setCategory}
          sort={sort} setSort={setSort} view={view} setView={setView}
          products={products} pagination={pagination} page={page} setPage={setPage}
          onNavigateProduct={(id) => navigate(`/product/${id}`)}
          onOpenQuote={() => setQuoteModalOpen(true)}
        />
      )}

      {tab === 'connect' && (
        <ConnectTab
          shop={shop} isB2B={isB2B}
          onStartChat={startChat} chatBusy={chatBusy}
          onOpenQuote={() => setQuoteModalOpen(true)}
          inquiryOpen={inquiryOpen} setInquiryOpen={setInquiryOpen}
          inquiryText={inquiryText} setInquiryText={setInquiryText}
          inquiryBusy={inquiryBusy} sendInquiry={sendInquiry}
        />
      )}

      {tab === 'shop' && (
        <div className="dash-body" style={{ maxWidth: 1100, paddingTop: 0 }}>
          <ShopReviewsSection shopId={shop.id} />
          <ShopFeedSection shopId={shop.id} isVerified={shop.is_verified} />
        </div>
      )}

      {quoteModalOpen && (
        <B2BQuoteRequestModal
          shopId={shop.id}
          shopName={shop.name}
          onClose={() => setQuoteModalOpen(false)}
          onSubmitted={() => { setQuoteModalOpen(false); setQuoteNotice('Quote request sent — the business will respond soon.'); setTimeout(() => setQuoteNotice(''), 4000); }}
        />
      )}
    </div>
  );
}

function WorldTab({ shop, bp, isB2B, yearsOnJedida, responseLabel, isFastResponder, collections, trendingProducts, enabledPaymentMethods, onNavigateProduct, onGoShop, onGoConnect, onStartChat, chatBusy }) {
  return (
    <div>
      {/* Cover + identity overlay */}
      <div style={{
        background: shop.cover_image_url ? `url(${shop.cover_image_url}) center/cover` : 'linear-gradient(160deg, var(--forest), var(--forest-dark))',
        color: '#fff'
      }}>
        <div style={{ background: shop.cover_image_url ? 'rgba(6,40,24,0.55)' : 'none', padding: '32px 20px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{
              width: 96, height: 96, borderRadius: '50%', background: '#fff', border: '4px solid #fff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)', overflow: 'hidden', flexShrink: 0
            }}>
              {shop.logo_url ? <img src={shop.logo_url} alt={shop.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (
                <div style={{ width: '100%', height: '100%', background: 'var(--cream-dim)' }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ fontSize: '1.6rem', margin: 0 }}>{shop.name}</h1>
                {shop.is_verified && <Icon name="checkShield" size={20} color="var(--amber)" />}
              </div>
              {shop.description && <p style={{ maxWidth: 560, opacity: 0.92, margin: '8px 0' }}>{shop.description}</p>}
              <div style={{ display: 'flex', gap: 16, fontSize: '0.85rem', flexWrap: 'wrap', opacity: 0.9, marginBottom: 10 }}>
                {(shop.location_city || shop.location_country) && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="mapPin" size={13} /> {[shop.location_city, shop.location_country].filter(Boolean).join(', ')}
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="starFilled" size={13} color="var(--amber)" filled /> {shop.rating.toFixed(1)} ({shop.reviewCount} reviews)
                </span>
                {shop.productsSold > 0 && <span>{shop.productsSold} sold</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '0.72rem' }}>
                {yearsOnJedida > 0 && <span className="product-card-badge" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>✓ {yearsOnJedida} Year{yearsOnJedida > 1 ? 's' : ''} on Jedida</span>}
                {shop.is_verified && <span className="product-card-badge" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>✓ Verified Seller</span>}
                {isFastResponder && <span className="product-card-badge" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>✓ Fast Responder</span>}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn-primary" onClick={onStartChat} disabled={chatBusy}>
                  <Icon name="message" size={15} /> {chatBusy ? 'Opening…' : 'Chat with Seller'}
                </button>
                <button className="btn-secondary" onClick={onGoShop} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}>Visit Shop</button>
                {shop.owner_id && (
                  <Link to={`/u/${shop.owner_id}`} style={{ color: '#fff', opacity: 0.85, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="user" size={13} /> View seller's profile
                  </Link>
                )}
              </div>
            </div>

            {/* Shop Pulse — only real, computed signals. No fabricated
                live-viewer or "orders today" counters. */}
            {(shop.productsSold > 0 || trendingProducts.length > 0 || responseLabel) && (
              <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, minWidth: 220 }}>
                <div style={{ fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="target" size={15} /> Shop Pulse
                </div>
                {trendingProducts.length > 0 && (
                  <div style={{ fontSize: '0.82rem', marginBottom: 8 }}>
                    <strong>{trendingProducts.length}</strong> product{trendingProducts.length !== 1 ? 's' : ''} trending
                  </div>
                )}
                {shop.productsSold > 0 && (
                  <div style={{ fontSize: '0.82rem', marginBottom: 8 }}><strong>{shop.productsSold}</strong> items sold</div>
                )}
                {responseLabel && (
                  <div style={{ fontSize: '0.82rem' }}>Responds within <strong>{responseLabel}</strong></div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Trust strip — generic platform guarantees, not per-seller stats */}
      <div style={{ background: 'var(--forest-dark)', color: '#fff', padding: '14px 20px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.8rem' }}>
          <span><Icon name="shield" size={14} /> Buyer Protection — secure payments</span>
          <span><Icon name="truck" size={14} /> Reliable Delivery</span>
          <span><Icon name="refresh" size={14} /> Easy Returns — 7 day policy</span>
          <span><Icon name="headset" size={14} /> Dedicated Support</span>
        </div>
      </div>

      <div className="dash-body" style={{ maxWidth: 1100, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 300 }}>
          {collections.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Featured Collections</h2>
                <button className="btn-link" onClick={onGoShop}>View all collections →</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                {collections.map((c) => (
                  <div key={c.id} onClick={onGoShop} className="card-surface" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}>
                    <div style={{ height: 90, background: c.coverImage ? `url(${c.coverImage}) center/cover` : 'var(--cream-dim)' }} />
                    <div style={{ padding: 10 }}>
                      <strong style={{ fontSize: '0.85rem' }}>{c.name}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#5B6760' }}>{c.productCount} product{c.productCount !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {trendingProducts.length > 0 && (
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Trending Now</h2>
                  <div style={{ fontSize: '0.75rem', color: '#5B6760' }}>Today's most popular products in this shop</div>
                </div>
                <button className="btn-link" onClick={onGoShop}>View all products →</button>
              </div>
              <div className="product-grid">
                {trendingProducts.map((p) => (
                  <ProductCardShop key={p.id} product={p} view="grid" isB2B={isB2B} onNavigate={() => onNavigateProduct(p.id)} />
                ))}
              </div>
            </section>
          )}

          {collections.length === 0 && trendingProducts.length === 0 && (
            <div className="empty-state">This shop hasn't set up collections or built up sales history yet — check the Shop tab to browse all products.</div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="card-surface" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong>About the Seller</strong>
              <Link to="#" onClick={(e) => { e.preventDefault(); onGoConnect(); }} className="btn-link" style={{ fontSize: '0.78rem' }}>View Profile →</Link>
            </div>
            {(shop.location_city || shop.location_country) && (
              <div style={{ fontSize: '0.82rem', color: '#5B6760', marginBottom: 8 }}>
                <Icon name="mapPin" size={13} /> {[shop.location_city, shop.location_country].filter(Boolean).join(', ')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 16, fontSize: '0.78rem', textAlign: 'center' }}>
              <div><div style={{ fontWeight: 800 }}>{shop.reviewCount}+</div><div style={{ color: '#5B6760' }}>Reviews</div></div>
              <div><div style={{ fontWeight: 800 }}>{shop.productsSold}+</div><div style={{ color: '#5B6760' }}>Orders</div></div>
              <div><div style={{ fontWeight: 800 }}>{shop.reviewCount > 0 ? Math.round((shop.rating / 5) * 100) : 0}%</div><div style={{ color: '#5B6760' }}>Rating</div></div>
            </div>
          </div>

          <div className="card-surface" style={{ marginBottom: 16, background: 'var(--cream-dim)' }}>
            <strong style={{ display: 'block', marginBottom: 4 }}>Do you need something specific?</strong>
            <p style={{ fontSize: '0.82rem', color: '#5B6760', marginBottom: 10 }}>Post what you want and get quotes from trusted sellers.</p>
            <Link to="/wanted" className="btn-secondary">Post What I Want</Link>
          </div>

          {isB2B && (
            <div className="card-surface" style={{ marginBottom: 16, background: 'rgba(139, 197, 63, 0.12)' }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>Wholesale & Bulk Orders</strong>
              <p style={{ fontSize: '0.82rem', color: '#5B6760', marginBottom: 10 }}>Get special prices for bulk purchases.</p>
              <button className="btn-secondary" onClick={onGoConnect}>Request Wholesale Price</button>
            </div>
          )}

          {enabledPaymentMethods.length > 0 && (
            <div className="card-surface">
              <strong style={{ display: 'block', marginBottom: 8 }}>Secure Payments with Jedida</strong>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.78rem' }}>
                {enabledPaymentMethods.map((m) => <span key={m.flag} className="product-card-badge">{m.label}</span>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ShopTab({ shop, isB2B, bp, search, setSearch, category, setCategory, sort, setSort, view, setView, products, pagination, page, setPage, onNavigateProduct, onOpenQuote }) {
  return (
    <div className="dash-body" style={{ maxWidth: 1100, paddingTop: 20 }}>
      {isB2B && (
        <div className="card-surface" style={{ marginBottom: 24, background: 'var(--cream-dim)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon name={shop.owner_role === 'manufacturer' ? 'factory' : 'building'} size={18} color="var(--forest)" />
            <strong>{shop.owner_role === 'manufacturer' ? 'Verified Manufacturer' : 'Verified Supplier'}</strong>
            {bp?.status === 'active' && <Icon name="checkShield" size={15} color="var(--forest)" />}
            {bp?.verification_level && bp.verification_level !== 'unverified' && (
              <span className="product-card-badge" style={{ textTransform: 'capitalize' }}>{bp.verification_level}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: '0.85rem', color: '#5B6760', marginBottom: 12 }}>
            {bp?.factory_address && <span><Icon name="mapPin" size={13} /> Factory: {bp.factory_address}</span>}
            {bp?.warehouse_address && <span><Icon name="mapPin" size={13} /> Warehouse: {bp.warehouse_address}</span>}
            {bp?.production_capacity && <span>Capacity: {bp.production_capacity}</span>}
            {bp?.stock_availability && <span>Stock: {STOCK_LABELS[bp.stock_availability]}</span>}
          </div>
          <button className="btn-primary" onClick={onOpenQuote}>
            <Icon name="document" size={15} /> Request Quotation
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div className="field-group" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
          <label>Search in this shop</label>
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search products…" />
        </div>
        <div className="field-group" style={{ minWidth: 160, marginBottom: 0 }}>
          <label>Category</label>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="field-group" style={{ minWidth: 160, marginBottom: 0 }}>
          <label>Sort by</label>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`btn-secondary ${view === 'grid' ? 'tab-pill-active' : ''}`} onClick={() => setView('grid')}>Grid</button>
          <button className={`btn-secondary ${view === 'list' ? 'tab-pill-active' : ''}`} onClick={() => setView('list')}>List</button>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="empty-state">No products match your search.</div>
      ) : view === 'grid' ? (
        <div className="product-grid">
          {products.map((p) => <ProductCardShop key={p.id} product={p} view="grid" isB2B={isB2B} onNavigate={() => onNavigateProduct(p.id)} />)}
        </div>
      ) : (
        <div>
          {products.map((p) => <ProductCardShop key={p.id} product={p} view="list" isB2B={isB2B} onNavigate={() => onNavigateProduct(p.id)} />)}
        </div>
      )}

      {pagination && pagination.total > pagination.limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
          <button className="btn-secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span style={{ padding: '8px 0' }}>Page {page} of {Math.ceil(pagination.total / pagination.limit)}</span>
          <button className="btn-secondary" disabled={page >= Math.ceil(pagination.total / pagination.limit)} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

function ConnectTab({ shop, isB2B, onStartChat, chatBusy, onOpenQuote, inquiryOpen, setInquiryOpen, inquiryText, setInquiryText, inquiryBusy, sendInquiry }) {
  return (
    <div className="dash-body" style={{ maxWidth: 700, paddingTop: 20 }}>
      <h2 style={{ fontSize: '1.2rem', marginBottom: 4 }}>Talk & do business with {shop.name}</h2>
      <p style={{ color: '#5B6760', marginBottom: 24 }}>All marketplace conversations go through Jedida's moderated chat — this keeps orders and contact details protected.</p>

      <div className="card-surface" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>Chat with Seller</strong>
          <p style={{ fontSize: '0.82rem', color: '#5B6760', margin: '4px 0 0' }}>Ask about a product, an order, or shipping.</p>
        </div>
        <button className="btn-primary" onClick={onStartChat} disabled={chatBusy}>
          <Icon name="message" size={15} /> {chatBusy ? 'Opening…' : 'Chat'}
        </button>
      </div>

      <div className="card-surface" style={{ marginBottom: 16 }}>
        <strong>Need something specific?</strong>
        <p style={{ fontSize: '0.82rem', color: '#5B6760', margin: '4px 0 10px' }}>Post what you want across the marketplace and get quotes from trusted sellers, including this one.</p>
        <Link to="/wanted" className="btn-secondary">Post What I Want</Link>
      </div>

      {isB2B && (
        <div className="card-surface" style={{ marginBottom: 16 }}>
          <strong>Wholesale & Custom Orders</strong>
          <p style={{ fontSize: '0.82rem', color: '#5B6760', margin: '4px 0 10px' }}>Request a formal quote for bulk or custom purchases.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={onOpenQuote}><Icon name="document" size={15} /> Request Quotation</button>
            <button className="btn-secondary" onClick={() => setInquiryOpen((v) => !v)}><Icon name="message" size={15} /> Business Inquiry</button>
          </div>
          {inquiryOpen && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <textarea
                rows={3}
                style={{ flex: 1, minWidth: 200 }}
                value={inquiryText}
                onChange={(e) => setInquiryText(e.target.value)}
                placeholder="Ask about specs, lead times, samples…"
              />
              <button className="btn-primary" disabled={inquiryBusy} onClick={sendInquiry}>{inquiryBusy ? 'Sending…' : 'Send'}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
