import { useEffect, useState } from 'react';
import TabBar from '../../components/TabBar';
import * as shopBuilderApi from '../../api/shopBuilderApi';
import * as couponsApi from '../../api/couponsApi';

const THEME_LABELS = {
  retail: { label: 'Retail', blurb: 'For everyday sellers — clean, product-first layout.' },
  wholesale: { label: 'Wholesale', blurb: 'For manufacturers & suppliers — bulk pricing and supplier info up front.' },
  farm: { label: 'Agriculture', blurb: 'For agriculture businesses — harvest and brand-story sections.' },
  brand: { label: 'Brand', blurb: 'For established companies — video and brand-story led.' },
  coffee_export: { label: 'Coffee Export', blurb: 'Earthy tones for coffee, cocoa, and other export crops.' },
  electronics: { label: 'Electronics', blurb: 'Sharp corners, crisp shadows — built for tech and gadgets.' },
  fashion: { label: 'Fashion', blurb: 'Elegant, image-led layout for clothing and accessories.' },
  furniture: { label: 'Furniture', blurb: 'Warm, spacious layout that lets pieces breathe.' },
  beauty: { label: 'Beauty', blurb: 'Soft, rounded style for cosmetics and personal care.' },
  restaurant: { label: 'Restaurant', blurb: 'Warm and inviting — built for food & dining businesses.' },
  pharmacy: { label: 'Pharmacy', blurb: 'Clean, clinical layout that reads trustworthy.' },
  automotive: { label: 'Automotive', blurb: 'Bold, high-contrast style for parts and vehicles.' },
  construction: { label: 'Construction', blurb: 'Industrial, no-frills layout for materials & equipment.' },
  corporate: { label: 'Corporate', blurb: 'Professional, understated — built for B2B services.' },
  luxury: { label: 'Luxury', blurb: 'Generous whitespace and deep shadows for premium goods.' },
  minimal: { label: 'Minimal', blurb: 'Flat, no-shadow style that puts products first.' },
  modern: { label: 'Modern', blurb: 'Balanced, contemporary look that fits most categories.' },
  dark: { label: 'Dark', blurb: 'A true dark-mode storefront — dark background, light text.' },
  creative: { label: 'Creative', blurb: 'Playful, rounded style for design-led or artistic shops.' },
  marketplace: { label: 'Marketplace', blurb: 'Neutral, general-purpose layout for a wide product mix.' },
  enterprise: { label: 'Enterprise', blurb: 'Crisp, high-contrast style for larger B2B operations.' }
};

const BLOCK_GROUPS = [
  {
    label: 'Merchandising',
    blocks: {
      featured_products: 'Featured Products', product_categories: 'Product Categories',
      product_carousel: 'Product Carousel', collections_grid: 'Collections',
      best_sellers: 'Best Sellers', new_arrivals: 'New Arrivals',
      flash_sale: 'Flash Sale', todays_deals: "Today's Deals",
      most_popular: 'Most Popular', recommended_products: 'Recommended Products',
      trending_products: 'Trending Products', ai_recommended_products: 'AI Recommended Products',
      bulk_deals: 'Bulk Deals', agriculture_harvest: 'Agriculture Harvest',
      wholesale_products: 'Wholesale Products', supplier_catalog: 'Supplier Catalog',
      manufacturer_catalog: 'Manufacturer Catalog', supplier_information: 'Supplier Information',
      quote_request_widget: 'Quote Request Widget'
    }
  },
  {
    label: 'Homepage & Media',
    blocks: {
      hero_banner: 'Hero Banner', image_slider: 'Image Slider',
      announcement_bar: 'Announcement Bar', video_section: 'Video Section',
      video_gallery: 'Video Gallery', gallery: 'Gallery', social_feed: 'Social Feed'
    }
  },
  {
    label: 'Story & Trust',
    blocks: {
      about_us: 'About Us', brand_story: 'Brand Story', founder_story: 'Founder Story',
      company_timeline: 'Company Timeline', mission_vision: 'Mission & Vision',
      reviews: 'Reviews', customer_testimonials: 'Customer Testimonials',
      certificates_awards: 'Certificates & Awards', trust_badges: 'Trust Badges',
      partners_logos: 'Partners'
    }
  },
  {
    label: 'Info & Policies',
    blocks: {
      faq: 'FAQ', contact_support: 'Contact / Support', map_location: 'Map',
      business_hours: 'Business Hours', store_policies: 'Store Policies',
      delivery_information: 'Delivery Information', payment_methods: 'Payment Methods'
    }
  },
  {
    label: 'Engagement',
    blocks: {
      newsletter_signup: 'Newsletter', order_tracking_widget: 'Order Tracking Widget',
      appointment_booking: 'Appointment Booking', donation_section: 'Donation Section',
      digital_downloads: 'Digital Downloads', job_opportunities: 'Job Opportunities',
      community_section: 'Community Section', events_list: 'Events', news_section: 'News'
    }
  }
];

const BLOCK_LABELS = BLOCK_GROUPS.reduce((acc, group) => ({ ...acc, ...group.blocks }), {});

function BlockEditorFields({ blockType, config, onChange }) {
  const set = (key, value) => onChange({ ...config, [key]: value });

  if (blockType === 'hero_banner') {
    return (
      <>
        <div className="field-group"><label>Headline</label><input value={config.headline || ''} onChange={(e) => set('headline', e.target.value)} /></div>
        <div className="field-group"><label>Subheadline</label><input value={config.subheadline || ''} onChange={(e) => set('subheadline', e.target.value)} /></div>
      </>
    );
  }
  if (blockType === 'video_section') {
    return <div className="field-group"><label>Video URL (embed link)</label><input value={config.videoUrl || ''} onChange={(e) => set('videoUrl', e.target.value)} /></div>;
  }
  if (['brand_story', 'supplier_information', 'founder_story', 'about_us', 'mission_vision', 'company_timeline'].includes(blockType)) {
    return (
      <>
        <div className="field-group"><label>Title</label><input value={config.title || ''} onChange={(e) => set('title', e.target.value)} /></div>
        <div className="field-group"><label>Body</label><textarea rows={3} value={config.body || ''} onChange={(e) => set('body', e.target.value)} /></div>
      </>
    );
  }
  if (blockType === 'flash_sale' || blockType === 'todays_deals') {
    return (
      <>
        <div className="field-group"><label>Headline</label><input value={config.headline || ''} onChange={(e) => set('headline', e.target.value)} /></div>
        <div className="field-group"><label>Ends at</label><input type="datetime-local" value={config.endsAt || ''} onChange={(e) => set('endsAt', e.target.value)} /></div>
      </>
    );
  }
  if (blockType === 'faq') {
    return <div className="field-group"><label>Questions &amp; answers (one per line, "Question | Answer")</label><textarea rows={4} value={config.qaText || ''} onChange={(e) => set('qaText', e.target.value)} /></div>;
  }
  if (blockType === 'business_hours') {
    return <div className="field-group"><label>Hours</label><textarea rows={3} placeholder="Mon–Fri: 8am–6pm" value={config.hoursText || ''} onChange={(e) => set('hoursText', e.target.value)} /></div>;
  }
  if (blockType === 'map_location') {
    return <div className="field-group"><label>Address</label><input value={config.address || ''} onChange={(e) => set('address', e.target.value)} /></div>;
  }
  if (blockType === 'newsletter_signup') {
    return <div className="field-group"><label>Prompt text</label><input value={config.prompt || ''} onChange={(e) => set('prompt', e.target.value)} /></div>;
  }
  // Every other block just gets a title/subtitle pair — safe generic default.
  return (
    <>
      <div className="field-group"><label>Title</label><input value={config.title || ''} onChange={(e) => set('title', e.target.value)} /></div>
      <div className="field-group"><label>Subtitle</label><input value={config.subtitle || ''} onChange={(e) => set('subtitle', e.target.value)} /></div>
    </>
  );
}

function ThemeLayoutTab({ shop, availableThemes, onSaved }) {
  const [form, setForm] = useState({
    theme: availableThemes.includes(shop.theme) ? shop.theme : availableThemes[0],
    layoutStyle: shop.layout_style, fontFamily: shop.font_family,
    themePrimaryColor: shop.theme_primary_color || '#0B3D24', themeAccentColor: shop.theme_accent_color || '#8BC53F'
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const save = async () => {
    setBusy(true); setMessage('');
    try {
      const { data } = await shopBuilderApi.updateTheme(form);
      onSaved(data.shop);
      setMessage(data.message);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Could not save theme.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-surface">
      <h3>Store Theme</h3>
      {message && <div className="alert alert-success" style={{ marginTop: 8 }}>{message}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, margin: '12px 0' }}>
        {Object.entries(THEME_LABELS).filter(([key]) => availableThemes.includes(key)).map(([key, t]) => (
          <div
            key={key}
            onClick={() => setForm({ ...form, theme: key })}
            className="card-surface"
            style={{ cursor: 'pointer', border: form.theme === key ? '2px solid var(--forest)' : '1px solid transparent' }}
          >
            <strong>{t.label}</strong>
            <div className="product-card-meta">{t.blurb}</div>
          </div>
        ))}
      </div>
      <p className="product-card-meta" style={{ marginTop: -4, marginBottom: 12 }}>Only themes suited to your account type are shown here.</p>

      <div className="field-group">
        <label>Layout style</label>
        <select value={form.layoutStyle} onChange={(e) => setForm({ ...form, layoutStyle: e.target.value })}>
          {['standard', 'wide', 'gallery', 'magazine'].map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <div className="field-group">
        <label>Font</label>
        <select value={form.fontFamily} onChange={(e) => setForm({ ...form, fontFamily: e.target.value })}>
          {['Inter', 'Georgia', 'Poppins', 'Merriweather', 'Roboto'].map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      <div className="field-row">
        <div className="field-group">
          <label>Primary color</label>
          <input type="color" value={form.themePrimaryColor} onChange={(e) => setForm({ ...form, themePrimaryColor: e.target.value })} />
        </div>
        <div className="field-group">
          <label>Accent color</label>
          <input type="color" value={form.themeAccentColor} onChange={(e) => setForm({ ...form, themeAccentColor: e.target.value })} />
        </div>
      </div>

      <button className="btn-primary" disabled={busy} onClick={save}>Save Theme</button>
    </div>
  );
}

// Snapshot used by undo/redo: only the layout-level facts (order,
// visibility, lock) — not block content. Content edits (config) are saved
// per-keystroke to the draft already, and undoing them risks discarding
// text the seller just typed; reorder/hide/lock are the mistakes people
// actually want to walk back with Ctrl+Z-style undo.
function snapshotOf(blocks) {
  return blocks.map((b) => ({ id: b.id, is_visible: b.is_visible, is_locked: b.is_locked }));
}

function BlocksTab({ blocks, blockTypes, onRefresh }) {
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  const availableToAdd = blockTypes.filter((t) => !blocks.some((b) => b.block_type === t));

  const pushHistory = () => {
    setHistory((h) => [...h, snapshotOf(blocks)].slice(-20));
    setFuture([]);
  };

  const add = async () => {
    if (!adding) return;
    setBusy(true);
    try {
      await shopBuilderApi.addBlock(adding);
      setAdding('');
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const removeBlock = async (block) => {
    if (block.is_locked) return;
    pushHistory();
    setBusy(true);
    try { await shopBuilderApi.deleteBlock(block.id); await onRefresh(); } finally { setBusy(false); }
  };

  const duplicateBlock = async (block) => {
    setBusy(true);
    try { await shopBuilderApi.duplicateBlock(block.id); await onRefresh(); } finally { setBusy(false); }
  };

  const toggleVisible = async (block) => {
    pushHistory();
    setBusy(true);
    try { await shopBuilderApi.updateBlock(block.id, { isVisible: !block.is_visible }); await onRefresh(); } finally { setBusy(false); }
  };

  const toggleLocked = async (block) => {
    pushHistory();
    setBusy(true);
    try { await shopBuilderApi.updateBlock(block.id, { isLocked: !block.is_locked }); await onRefresh(); } finally { setBusy(false); }
  };

  const saveConfig = async (block, config) => {
    await shopBuilderApi.updateBlock(block.id, { config });
    await onRefresh();
  };

  // Reorder to an arbitrary target index — backs both drag-and-drop and
  // the ↑/↓ buttons (kept for keyboard/accessibility use).
  const reorderTo = async (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= blocks.length || fromIndex === toIndex) return;
    if (blocks[fromIndex].is_locked || blocks[toIndex].is_locked) {
      setMessage('Unlock that section before moving it.');
      return;
    }
    pushHistory();
    const next = [...blocks];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setBusy(true);
    try {
      await shopBuilderApi.reorderBlocks(next.map((b) => b.id));
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const applySnapshot = async (snapshot) => {
    setBusy(true);
    try {
      await shopBuilderApi.reorderBlocks(snapshot.map((s) => s.id));
      const current = new Map(blocks.map((b) => [b.id, b]));
      for (const s of snapshot) {
        const b = current.get(s.id);
        if (!b) continue;
        if (b.is_visible !== s.is_visible || b.is_locked !== s.is_locked) {
          await shopBuilderApi.updateBlock(s.id, { isVisible: s.is_visible, isLocked: s.is_locked });
        }
      }
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (history.length === 0) return;
    const snapshot = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [snapshotOf(blocks), ...f]);
    await applySnapshot(snapshot);
  };

  const redo = async () => {
    if (future.length === 0) return;
    const snapshot = future[0];
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h, snapshotOf(blocks)]);
    await applySnapshot(snapshot);
  };

  const publish = async () => {
    setBusy(true); setMessage('');
    try {
      const { data } = await shopBuilderApi.publishBlocks();
      setMessage(data.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="card-surface" style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field-group" style={{ marginBottom: 0, minWidth: 220 }}>
          <label>Add a section</label>
          <select value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Choose a section…</option>
            {BLOCK_GROUPS.map((group) => {
              const opts = Object.keys(group.blocks).filter((t) => availableToAdd.includes(t));
              if (opts.length === 0) return null;
              return (
                <optgroup key={group.label} label={group.label}>
                  {opts.map((t) => <option key={t} value={t}>{BLOCK_LABELS[t] || t}</option>)}
                </optgroup>
              );
            })}
          </select>
        </div>
        <button className="btn-secondary" disabled={!adding || busy} onClick={add}>Add Section</button>
        <button className="btn-secondary" disabled={busy || history.length === 0} onClick={undo} title="Undo reorder / show / lock">↶ Undo</button>
        <button className="btn-secondary" disabled={busy || future.length === 0} onClick={redo} title="Redo">↷ Redo</button>
        <div style={{ flex: 1 }} />
        <button className="btn-primary" disabled={busy || blocks.length === 0} onClick={publish}>Publish Layout</button>
      </div>

      {message && <div className="alert alert-success" style={{ marginBottom: 12 }}>{message}</div>}

      {blocks.length === 0 ? (
        <div className="empty-state">No sections yet — add one above, or use the AI Store Designer tab.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {blocks.map((block, i) => (
            <div
              key={block.id}
              className="card-surface"
              draggable={!block.is_locked && !busy}
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) reorderTo(dragIndex, i); setDragIndex(null); }}
              onDragEnd={() => setDragIndex(null)}
              style={{ opacity: dragIndex === i ? 0.5 : 1, cursor: block.is_locked ? 'default' : 'grab' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <strong>{!block.is_locked && '⠿ '}{BLOCK_LABELS[block.block_type] || block.block_type}{block.is_locked && ' 🔒'}</strong>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn-secondary" disabled={i === 0 || busy || block.is_locked} onClick={() => reorderTo(i, i - 1)}>↑</button>
                  <button className="btn-secondary" disabled={i === blocks.length - 1 || busy || block.is_locked} onClick={() => reorderTo(i, i + 1)}>↓</button>
                  <button className="btn-secondary" disabled={busy} onClick={() => duplicateBlock(block)}>Duplicate</button>
                  <button className="btn-secondary" disabled={busy} onClick={() => toggleVisible(block)}>{block.is_visible ? 'Hide' : 'Show'}</button>
                  <button className="btn-secondary" disabled={busy} onClick={() => toggleLocked(block)}>{block.is_locked ? 'Unlock' : 'Lock'}</button>
                  <button className="btn-secondary" style={{ color: '#b42318', borderColor: '#fda29b' }} disabled={busy || block.is_locked} onClick={() => removeBlock(block)}>Remove</button>
                </div>
              </div>
              <BlockEditorFields
                blockType={block.block_type}
                config={block.config || {}}
                onChange={(config) => saveConfig(block, config)}
              />
              {!block.is_published && <div className="product-card-meta">Draft — not visible on your public shop yet.</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AiDesignerTab({ shop, onApplied }) {
  const [description, setDescription] = useState(shop.description || '');
  const [category, setCategory] = useState(shop.primary_category || '');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    setBusy(true); setError(''); setPreview(null);
    try {
      const { data } = await shopBuilderApi.aiDesignStore({ description, category, apply: false });
      setPreview(data.design);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not generate a design right now.');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await shopBuilderApi.aiDesignStore({ description, category, apply: true });
      onApplied(data.shop, data.blocks);
      setPreview(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not apply this design.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-surface">
      <h3>Jedida Bot — AI Store Designer</h3>
      <p className="product-card-meta" style={{ marginBottom: 12 }}>Describe your business and Jedida Bot will propose a theme, colors, and a starter section layout.</p>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="field-group">
        <label>What do you sell?</label>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. I sell coffee from Uganda, grown on our family farm…" />
      </div>
      <div className="field-group">
        <label>Category (optional)</label>
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. agriculture" />
      </div>

      <button className="btn-secondary" disabled={busy} onClick={generate}>Generate Design</button>

      {preview && (
        <div className="card-surface" style={{ marginTop: 16 }}>
          <strong>Suggested theme:</strong> {THEME_LABELS[preview.theme]?.label || preview.theme}
          <p style={{ margin: '8px 0', color: '#5B6760' }}>{preview.businessDescription}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {preview.blocks.map((b, i) => <span key={i} className="tab-pill">{BLOCK_LABELS[b.blockType] || b.blockType}</span>)}
          </div>
          <button className="btn-primary" disabled={busy} onClick={apply}>Apply This Design</button>
          <span className="product-card-meta" style={{ marginLeft: 10 }}>This replaces your current draft layout.</span>
        </div>
      )}
    </div>
  );
}

function AnalyticsTab() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    shopBuilderApi.getShopAnalytics(days).then(({ data }) => setData(data)).catch(() => setData(null));
  }, [days]);

  if (!data) return <div className="empty-state">Loading analytics…</div>;

  const cards = [
    { label: 'Visitors', value: data.visitors },
    { label: 'Product Views', value: data.productViews },
    { label: 'Orders', value: data.orders },
    { label: 'Conversion Rate', value: `${data.conversionRate}%` },
    { label: 'Customer Questions', value: data.customerQuestions },
    { label: 'Revenue', value: `${data.revenue}` }
  ];

  return (
    <div>
      <div className="field-group" style={{ maxWidth: 200, marginBottom: 16 }}>
        <label>Period</label>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
        {cards.map((c) => (
          <div key={c.label} className="card-surface">
            <div className="product-card-meta">{c.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="card-surface">
        <h3>Popular Products</h3>
        {data.popularProducts.length === 0 ? (
          <div className="empty-state">No product views yet this period.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {data.popularProducts.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{p.title}</span>
                <span className="product-card-meta">{p.views} views</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const TREND_ARROW = { up: '↑', down: '↓', flat: '→' };
const TREND_COLOR = { up: '#12b76a', down: '#f04438', flat: '#5B6760' };

const RECOMMENDATION_LABELS = {
  promotion: 'Promotion', conversion: 'Conversion', inventory: 'Inventory',
  bundle: 'Bundle Idea', discount: 'Discount', info: 'All Good'
};

function BusinessManagerTab({ blocks, onRefresh }) {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [busyKey, setBusyKey] = useState('');
  const [appliedKeys, setAppliedKeys] = useState([]);
  const [message, setMessage] = useState('');

  const load = () => shopBuilderApi.getBusinessInsights(days).then(({ data: d }) => setData(d)).catch(() => setData(null));
  useEffect(() => { load(); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div className="empty-state">Analyzing your shop…</div>;

  // Adding a section the seller already has would create a second copy of
  // it rather than update the existing one — so recommendations that map
  // to a section update the existing block if one of that type exists.
  const applyBlock = async (key, suggestedBlock) => {
    setBusyKey(key);
    try {
      const existing = blocks?.find((b) => b.block_type === suggestedBlock.blockType);
      if (existing) {
        await shopBuilderApi.updateBlock(existing.id, { config: { ...existing.config, ...suggestedBlock.config }, isVisible: true });
        setMessage(`Updated your existing ${suggestedBlock.blockType.replace(/_/g, ' ')} section.`);
      } else {
        await shopBuilderApi.addBlock(suggestedBlock.blockType, suggestedBlock.config);
        setMessage(`Added a ${suggestedBlock.blockType.replace(/_/g, ' ')} section to your draft layout — open Layout Blocks to publish it.`);
      }
      setAppliedKeys((k) => [...k, key]);
      if (onRefresh) await onRefresh();
    } catch (err) {
      setMessage(err.response?.data?.error || 'Could not apply this recommendation.');
    } finally {
      setBusyKey('');
    }
  };

  const applyCoupon = async (key, suggestedCoupon) => {
    setBusyKey(key);
    try {
      const { data: res } = await couponsApi.createCoupon(suggestedCoupon);
      setMessage(`Coupon ${res.coupon.code} is live.`);
      setAppliedKeys((k) => [...k, key]);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Could not create this coupon.');
    } finally {
      setBusyKey('');
    }
  };

  return (
    <div>
      <div className="field-group" style={{ maxWidth: 200, marginBottom: 16 }}>
        <label>Period</label>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {message && <div className="alert alert-success" style={{ marginBottom: 12 }}>{message}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 20 }}>
        <div className="card-surface">
          <div className="product-card-meta">Revenue trend</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: TREND_COLOR[data.salesTrend.direction] }}>
            {TREND_ARROW[data.salesTrend.direction]} {Math.abs(data.salesTrend.changePercent)}%
          </div>
          <div className="product-card-meta">{data.salesTrend.revenueThisPeriod} this period vs {data.salesTrend.revenuePriorPeriod} prior</div>
        </div>
        <div className="card-surface">
          <div className="product-card-meta">Traffic trend</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: TREND_COLOR[data.trafficTrend.direction] }}>
            {TREND_ARROW[data.trafficTrend.direction]} {Math.abs(data.trafficTrend.changePercent)}%
          </div>
          <div className="product-card-meta">{data.trafficTrend.visitorsThisPeriod} visitors vs {data.trafficTrend.visitorsPriorPeriod} prior</div>
        </div>
        <div className="card-surface">
          <div className="product-card-meta">Conversion rate</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{data.conversion.thisPeriod}%</div>
          <div className="product-card-meta">{data.conversion.priorPeriod}% prior period</div>
        </div>
        <div className="card-surface">
          <div className="product-card-meta">If this trend continues</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{data.demandForecast.projectedNextPeriodRevenue}</div>
          <div className="product-card-meta">Projected next-period revenue — a simple trend projection, not a guarantee.</div>
        </div>
      </div>

      <div className="card-surface" style={{ marginBottom: 16 }}>
        <h3>Recommendations</h3>
        {data.recommendations.length === 0 ? (
          <div className="empty-state">Nothing to flag right now.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            {data.recommendations.map((rec, i) => {
              const key = `${rec.type}-${i}`;
              const applied = appliedKeys.includes(key);
              return (
                <div key={key} style={{ borderTop: '1px solid var(--line, #e5e7eb)', paddingTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <span className="product-card-meta">{RECOMMENDATION_LABELS[rec.type] || rec.type}</span>
                      <div style={{ fontWeight: 600 }}>{rec.title}</div>
                      <p style={{ margin: '4px 0 0', color: '#5B6760' }}>{rec.body}</p>
                      {rec.suggestedCoupon && <div className="product-card-meta">Suggested code: {rec.suggestedCoupon.code} — {rec.suggestedCoupon.discountValue}% off</div>}
                    </div>
                    {rec.suggestedBlock && (
                      <button className="btn-secondary" disabled={busyKey === key || applied} onClick={() => applyBlock(key, rec.suggestedBlock)}>
                        {applied ? 'Applied ✓' : 'Apply'}
                      </button>
                    )}
                    {rec.suggestedCoupon && (
                      <button className="btn-secondary" disabled={busyKey === key || applied} onClick={() => applyCoupon(key, rec.suggestedCoupon)}>
                        {applied ? 'Created ✓' : 'Create Coupon'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(data.slowMovers.length > 0 || data.fastMovers.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <div className="card-surface">
            <h3>Slow Movers</h3>
            {data.slowMovers.length === 0 ? <div className="empty-state">None right now.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {data.slowMovers.map((p) => (
                  <div key={p.id}>
                    <div>{p.title}</div>
                    <div className="product-card-meta">{p.viewsCount} views, 0 sales</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card-surface">
            <h3>Low Stock, Selling Fast</h3>
            {data.fastMovers.length === 0 ? <div className="empty-state">None right now.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {data.fastMovers.map((p) => (
                  <div key={p.id}>
                    <div>{p.title}</div>
                    <div className="product-card-meta">{p.ordersCount} sold, {p.quantityAvailable} left</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShopBuilderDashboard() {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await shopBuilderApi.getBuilderState();
      setState(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the Shop Builder.');
    }
  };
  useEffect(() => { load(); }, []);

  if (error) return <div className="empty-state">{error}</div>;
  if (!state) return <div className="empty-state">Loading Shop Builder…</div>;

  const tabs = [
    { key: 'theme', label: 'Theme & Branding' },
    { key: 'blocks', label: 'Layout Blocks' },
    { key: 'ai', label: '✨ AI Store Designer' },
    { key: 'manager', label: '📊 AI Business Manager' },
    { key: 'analytics', label: 'Shop Analytics' }
  ];

  return (
    <TabBar tabs={tabs} initial="theme">
      {(active) => (
        <>
          {active === 'theme' && <ThemeLayoutTab shop={state.shop} availableThemes={state.themes} onSaved={(shop) => setState({ ...state, shop })} />}
          {active === 'blocks' && (
            <BlocksTab blocks={state.blocks} blockTypes={state.blockTypes} onRefresh={load} />
          )}
          {active === 'ai' && (
            <AiDesignerTab
              shop={state.shop}
              onApplied={(shop, blocks) => setState({ ...state, shop, blocks })}
            />
          )}
          {active === 'manager' && <BusinessManagerTab blocks={state.blocks} onRefresh={load} />}
          {active === 'analytics' && <AnalyticsTab />}
        </>
      )}
    </TabBar>
  );
}
