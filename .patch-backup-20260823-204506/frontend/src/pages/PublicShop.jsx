import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import * as shopApi from '../api/shopApi';
import * as commerceApi from '../api/commerceApi';
import Logo from '../components/Logo';
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

export default function PublicShop() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);

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

  const load = () => {
    setLoading(true);
    shopApi.getPublicShopV2(slug, { search, category, sort, view, page, limit: 24 })
      .then(({ data }) => { setShop(data.shop); setProducts(data.products); setPagination(data.pagination); })
      .catch((err) => setError(err.response?.data?.error || 'Shop not found.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [slug, search, category, sort, page]);

  useEffect(() => {
    if (!shop) return;
    client.get(`/shops/${shop.id}/follow/info`).then(({ data }) => setFollowing(data.following)).catch(() => {});
  }, [shop?.id]);

  const toggleFollow = async () => {
    const { data } = await commerceApi.toggleFollow(shop.id);
    setFollowing(data.following);
    setShop((s) => ({ ...s, followerCount: s.followerCount + (data.following ? 1 : -1) }));
  };


  if (loading && !shop) return <div className="empty-state">Loading shop…</div>;
  if (error) return <div className="empty-state">{error}</div>;

  const isB2B = ['manufacturer', 'supplier'].includes(shop.owner_role);
  const bp = shop.businessProfile;

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

  return (
    <div>
      <header className="dash-header">
        <Logo size={32} />
        <Link to="/marketplace" className="btn-link">Main Marketplace →</Link>
      </header>

      {/* Cover banner */}
      <div style={{
        height: 200, background: shop.cover_image_url ? `url(${shop.cover_image_url}) center/cover` : 'linear-gradient(160deg, var(--forest), var(--forest-dark))',
        position: 'relative'
      }} />

      {/* Shop identity bar */}
      <div className="dash-body" style={{ maxWidth: 1100, paddingTop: 0 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginTop: -48, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{
            width: 96, height: 96, borderRadius: 16, background: '#fff', border: '4px solid #fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', overflow: 'hidden', flexShrink: 0
          }}>
            {shop.logo_url ? <img src={shop.logo_url} alt={shop.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (
              <div style={{ width: '100%', height: '100%', background: 'var(--cream-dim)' }} />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: '1.4rem' }}>{shop.name}</h1>
              {shop.is_verified && <Icon name="checkShield" size={18} color="var(--forest)" />}
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: '0.82rem', color: '#5B6760', flexWrap: 'wrap' }}>
              {(shop.location_city || shop.location_country) && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="mapPin" size={13} /> {[shop.location_city, shop.location_country].filter(Boolean).join(', ')}
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name="starFilled" size={13} color="var(--amber)" filled /> {shop.rating.toFixed(1)} ({shop.reviewCount} reviews)
              </span>
              <span>{shop.followerCount} followers</span>
              <span>{shop.productsSold} sold</span>
              <span>Joined {new Date(shop.owner_joined_at).getFullYear()}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={toggleFollow} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="users" size={15} filled={following} color={following ? 'var(--forest)' : 'currentColor'} />
              {following ? 'Following' : 'Follow'}
            </button>
            <ShareShopButton url={shop.share_link || window.location.href} title={shop.name} />
          </div>
        </div>

        {shop.description && <p style={{ color: '#5B6760', maxWidth: 640, marginBottom: 24 }}>{shop.description}</p>}

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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-primary" onClick={() => setQuoteModalOpen(true)}>
                <Icon name="document" size={15} /> Request Quotation
              </button>
              <button
                className="btn-secondary"
                onClick={() => navigate(`/product/${products[0]?.id}`)}
                disabled={products.length === 0}
              >
                <Icon name="box" size={15} /> Bulk Order
              </button>
              <button className="btn-secondary" onClick={() => setInquiryOpen((v) => !v)}>
                <Icon name="message" size={15} /> Business Inquiry
              </button>
            </div>
            {inquiryOpen && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <textarea
                  rows={2}
                  style={{ flex: 1, minWidth: 200 }}
                  value={inquiryText}
                  onChange={(e) => setInquiryText(e.target.value)}
                  placeholder="Ask about specs, lead times, samples…"
                />
                <button className="btn-primary" disabled={inquiryBusy} onClick={sendInquiry}>{inquiryBusy ? 'Sending…' : 'Send'}</button>
              </div>
            )}
            {quoteNotice && <div className="alert alert-success" style={{ marginTop: 10 }}>{quoteNotice}</div>}
          </div>
        )}

        <div className="weave-divider" style={{ marginBottom: 24 }} />

        {/* Filters/search/sort/view toggle */}
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
            {products.map((p) => <ProductCardShop key={p.id} product={p} view="grid" isB2B={isB2B} onNavigate={() => navigate(`/product/${p.id}`)} />)}
          </div>
        ) : (
          <div>
            {products.map((p) => <ProductCardShop key={p.id} product={p} view="list" isB2B={isB2B} onNavigate={() => navigate(`/product/${p.id}`)} />)}
          </div>
        )}

        {pagination && pagination.total > pagination.limit && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
            <button className="btn-secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span style={{ padding: '8px 0' }}>Page {page} of {Math.ceil(pagination.total / pagination.limit)}</span>
            <button className="btn-secondary" disabled={page >= Math.ceil(pagination.total / pagination.limit)} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}

        <ShopReviewsSection shopId={shop.id} />
        <ShopFeedSection shopId={shop.id} isVerified={shop.is_verified} />
      </div>

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
