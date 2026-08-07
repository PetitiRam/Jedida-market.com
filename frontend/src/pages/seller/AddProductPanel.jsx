import { useEffect, useMemo, useRef, useState } from 'react';
import client from '../../api/client';
import { CATEGORIES, CONDITIONS } from '../../constants/categories';
import MediaUploader from '../../components/MediaUploader';
import ProductMediaDropzone from '../../components/seller/ProductMediaDropzone';
import { compressImage } from '../../utils/compressImage';
import '../../styles/addProduct.css';

const emptyForm = {
  // Basic information
  title: '',
  shortDescription: '',
  description: '',
  category: 'other',
  condition: 'new',

  // Product identity
  brand: '',
  manufacturer: '',
  modelNumber: '',
  sku: '',

  // Pricing
  price: '',
  originalPrice: '',
  discount: '',
  currency: 'USD',

  // Inventory
  quantityAvailable: 1,
  minimumOrderQuantity: 1,

  // Wholesale catalog (manufacturer/supplier only — schema_phase38)
  isSourceable: false,
  wholesalePrice: '',

  // Specifications
  material: '',
  color: '',
  size: '',
  weight: '',
  dimensions: '',
  warranty: '',
  countryOfOrigin: '',

  // Media
  media: [],
  images: '',

  // Shipping
  locationCity: '',
  locationCountry: '',
  warehouseLocation: '',
  deliveryTime: '',
  shippingCost: '',

  // Extra product information
  features: '',
  packageContents: '',

  // SEO
  keywords: '',
  metaTitle: '',
  metaDescription: ''
};

function productToFormValues(product) {
  if (!product) return emptyForm;
  const specs = (typeof product.specs === 'object' && product.specs) || {};
  const shipping = (typeof product.shipping_options === 'object' && product.shipping_options) || {};
  return {
    ...emptyForm,
    title: product.title || '',
    shortDescription: product.short_description || '',
    description: product.description || '',
    category: product.category || 'other',
    condition: product.condition || 'new',

    brand: product.brand || '',
    manufacturer: product.manufacturer || '',
    modelNumber: product.model_number || '',
    sku: product.sku || '',

    price: product.price ?? '',
    originalPrice: product.original_price ?? '',
    discount: product.discount ?? '',
    currency: product.currency || 'USD',

    quantityAvailable: product.quantity_available ?? 1,
    minimumOrderQuantity: product.minimum_order_quantity ?? 1,

    isSourceable: product.is_sourceable || false,
    wholesalePrice: product.wholesale_price ?? '',

    material: specs.material || '',
    color: specs.color || '',
    size: specs.size || '',
    weight: specs.weight || '',
    dimensions: specs.dimensions || '',
    warranty: specs.warranty || '',
    countryOfOrigin: specs.countryOfOrigin || '',

    images: Array.isArray(product.images) ? product.images.join(', ') : '',

    locationCity: product.location_city || '',
    locationCountry: product.location_country || '',
    warehouseLocation: shipping.warehouseLocation || '',
    deliveryTime: shipping.deliveryTime || '',
    shippingCost: shipping.shippingCost || '',

    features: specs.features || '',
    packageContents: specs.packageContents || '',

    keywords: specs.keywords || '',
    metaTitle: specs.metaTitle || '',
    metaDescription: specs.metaDescription || '',
  };
}

// Variant option groups (e.g. Color: Red, Blue — Size: S, M, L) are not yet
// backed by a database column, so they travel inside the existing `specs`
// JSON blob under a `variants` key. On edit, `specs` is written verbatim by
// this page already, so groups saved here persist correctly when editing.
// On brand-new listings the create endpoint currently whitelists a fixed
// set of specs fields server-side, so newly-created variant groups are kept
// in this session until the listing is edited/saved again. No backend files
// were touched to keep this change frontend-only, as requested.
function specsToVariantGroups(product) {
  const specs = (typeof product?.specs === 'object' && product.specs) || {};
  if (Array.isArray(specs.variants)) return specs.variants;
  return [];
}

const SECTIONS = [
  { id: 'details', label: 'Product Details' },
  { id: 'media', label: 'Photos & Video' },
  { id: 'category', label: 'Category' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'inventory', label: 'Quantity & Inventory' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'variants', label: 'Variants' },
  { id: 'specs', label: 'Specifications' },
  { id: 'review', label: 'Review & Publish' },
];

function FloatField({ label, required, helper, error, textarea, className = '', ...rest }) {
  const Tag = textarea ? 'textarea' : 'input';
  return (
    <div className={`apf-field apf-float ${className}`}>
      <Tag placeholder=" " className={error ? 'apf-invalid' : ''} {...rest} />
      <label>
        {label}
        {required && <span className="apf-required">*</span>}
      </label>
      {error ? (
        <div className="apf-error-text">{error}</div>
      ) : helper ? (
        <div className="apf-helper">{helper}</div>
      ) : null}
    </div>
  );
}

function SelectField({ label, required, helper, children, ...rest }) {
  return (
    <div className="apf-field">
      <label>
        {label}
        {required && <span className="apf-required">*</span>}
      </label>
      <select {...rest}>{children}</select>
      {helper && <div className="apf-helper">{helper}</div>}
    </div>
  );
}

function SectionCard({ icon, title, subtitle, children, id }) {
  return (
    <section className="apf-card" id={`apf-section-${id}`}>
      <div className="apf-card-head">
        <div className="apf-icon">{icon}</div>
        <div className="apf-card-head-text">
          <h3>{title}</h3>
          {subtitle && <div className="apf-card-sub">{subtitle}</div>}
        </div>
      </div>
      <div className="apf-card-body">{children}</div>
    </section>
  );
}

let toastSeq = 0;

export default function AddProductPanel({ editProduct = null, onSaved = null }) {
  const [form, setForm] = useState(() => productToFormValues(editProduct));
  const [variantGroups, setVariantGroups] = useState(() => specsToVariantGroups(editProduct));
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [toasts, setToasts] = useState([]);
  const formTopRef = useRef(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    client.get('/auth/me').then(({ data }) => setRole(data.user?.primary_role || null)).catch(() => {});
  }, []);
  const canPublishWholesale = role === 'manufacturer' || role === 'supplier';

  const pushToast = (type, message) => {
    const id = ++toastSeq;
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  };

  const loadTemplates = async () => {
    const { data } = await client.get('/templates/mine');
    setTemplates(data.templates || []);
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const update = (key) => (e) => {
    setForm((prev) => ({
      ...prev,
      [key]: e.target.value
    }));
  };

  const updateCheckbox = (key) => (e) => {
    setForm((prev) => ({
      ...prev,
      [key]: e.target.checked
    }));
  };

  const removeMedia = (index) => {
    setForm((f) => ({
      ...f,
      media: f.media.filter((_, i) => i !== index)
    }));
  };

  const setCoverMedia = (index) => {
    setForm((f) => {
      if (index <= 0 || index >= f.media.length) return f;
      const media = [...f.media];
      const [item] = media.splice(index, 1);
      media.unshift(item);
      return { ...f, media };
    });
  };

  const applyTemplate = (templateId) => {
    setSelectedTemplateId(templateId);
    const t = templates.find((tpl) => tpl.id === templateId);
    if (!t) return;

    setForm((f) => ({
      ...f,
      category: t.category,
      description:
        t.description_template
          ?.replace('{product_name}', f.title || '')
          .replace('{short_pitch}', '') || f.description,
      images: (t.suggested_image_urls || []).join(', ')
    }));
    pushToast('success', `Template "${t.name}" applied.`);
  };

  const generateTemplate = async () => {
    setGenerating(true);
    setError('');
    try {
      await client.post('/templates/generate', {
        category: form.category,
        productHint: form.title
      });
      await loadTemplates();
      pushToast('success', 'Colline generated a new template.');
    } catch (err) {
      const msg = err.response?.data?.error || 'Could not generate a template right now.';
      setError(msg);
      pushToast('error', msg);
    } finally {
      setGenerating(false);
    }
  };

  // Kept for compatibility with MediaUploader-style callers; unused directly
  // now that ProductMediaDropzone handles compression + upload itself, but
  // left in place since it is not backend/business logic.
  // eslint-disable-next-line no-unused-vars
  const uploadMedia = async (media, type) => {
    try {
      let uploadFile = media;
      if (type === 'image') {
        uploadFile = await compressImage(media);
      }
      return uploadFile;
    } catch (err) {
      throw new Error('Media processing failed');
    }
  };

  // Shared save routine for both Publish (form submit) and Save Draft.
  // statusOverride is only included in the payload when explicitly passed,
  // so the default Publish flow sends the exact same payload shape as
  // before (backend still decides the default status).
  const saveListing = async ({ statusOverride, isDraft } = {}) => {
    if (!form.title || !form.price) {
      const msg = 'Product name and price are required';
      setError(msg);
      pushToast('error', msg);
      return;
    }

    setError('');
    setResult(null);
    isDraft ? setDraftBusy(true) : setBusy(true);

    try {
      const payload = {
        ...form,

        price: Number(form.price),
        originalPrice: Number(form.originalPrice || 0),
        discount: Number(form.discount || 0),

        quantityAvailable: Number(form.quantityAvailable),
        minimumOrderQuantity: Number(form.minimumOrderQuantity),

        shippingCost: Number(form.shippingCost || 0),

        images: [
          ...form.media
            .filter((item) => item.type === 'image')
            .map((item) => item.url),

          ...(form.images
            ? form.images
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : [])
        ],
        templateId: selectedTemplateId || null,
        ...(statusOverride ? { status: statusOverride } : {})
      };

      // updateProduct writes specs/shipping_options as whole JSON columns,
      // unlike createProduct which assembles them from flat fields itself —
      // so an edit needs to pre-package them the same way createProduct does.
      const updatePayload = {
        title: payload.title,
        shortDescription: payload.shortDescription,
        description: payload.description,
        category: payload.category,
        condition: payload.condition,
        brand: payload.brand,
        manufacturer: payload.manufacturer,
        modelNumber: payload.modelNumber,
        sku: payload.sku,
        price: payload.price,
        originalPrice: payload.originalPrice,
        discount: payload.discount,
        currency: payload.currency,
        quantityAvailable: payload.quantityAvailable,
        minimumOrderQuantity: payload.minimumOrderQuantity,
        isSourceable: form.isSourceable,
        wholesalePrice: form.wholesalePrice ? Number(form.wholesalePrice) : null,
        images: payload.images,
        locationCity: payload.locationCity,
        locationCountry: payload.locationCountry,
        specs: {
          material: form.material, color: form.color, size: form.size, weight: form.weight,
          dimensions: form.dimensions, warranty: form.warranty, countryOfOrigin: form.countryOfOrigin,
          features: form.features, packageContents: form.packageContents,
          keywords: form.keywords, metaTitle: form.metaTitle, metaDescription: form.metaDescription,
          variants: variantGroups,
        },
        shippingOptions: {
          warehouseLocation: form.warehouseLocation, deliveryTime: form.deliveryTime, shippingCost: payload.shippingCost,
        },
        ...(statusOverride ? { status: statusOverride } : {})
      };

      const { data } = editProduct
        ? await client.patch(`/products/${editProduct.id}`, updatePayload)
        : await client.post('/products', payload);
      setResult(data);
      pushToast('success', isDraft ? 'Draft saved.' : (data.message || 'Listing saved.'));
      if (editProduct) {
        onSaved?.(data.product);
      } else if (!isDraft) {
        setForm(emptyForm);
        setVariantGroups([]);
        setSelectedTemplateId('');
      }
    } catch (err) {
      const msg = err.response?.data?.error || (editProduct ? 'Could not save your changes.' : 'Could not create your listing.');
      setError(msg);
      pushToast('error', msg);
    } finally {
      isDraft ? setDraftBusy(false) : setBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await saveListing({});
  };

  const handleSaveDraft = async () => {
    await saveListing({ statusOverride: 'draft', isDraft: true });
  };

  const handleCancel = () => {
    if (editProduct) {
      onSaved?.(editProduct);
      return;
    }
    setForm(emptyForm);
    setVariantGroups([]);
    setSelectedTemplateId('');
    setError('');
    setResult(null);
    pushToast('success', 'Form cleared.');
  };

  // ---- Variant groups (UI-managed; stored inside specs.variants) ----
  const addVariantGroup = () => {
    setVariantGroups((g) => [...g, { id: `vg-${Date.now()}`, name: '', values: [] }]);
  };
  const removeVariantGroup = (id) => {
    setVariantGroups((g) => g.filter((grp) => grp.id !== id));
  };
  const renameVariantGroup = (id, name) => {
    setVariantGroups((g) => g.map((grp) => (grp.id === id ? { ...grp, name } : grp)));
  };
  const addVariantValue = (id, value) => {
    const clean = value.trim();
    if (!clean) return;
    setVariantGroups((g) =>
      g.map((grp) =>
        grp.id === id && !grp.values.includes(clean)
          ? { ...grp, values: [...grp.values, clean] }
          : grp
      )
    );
  };
  const removeVariantValue = (id, value) => {
    setVariantGroups((g) =>
      g.map((grp) => (grp.id === id ? { ...grp, values: grp.values.filter((v) => v !== value) } : grp))
    );
  };

  // ---- Completeness (for progress bar + review checklist) — display only ----
  const completeness = useMemo(() => {
    const has = (v) => v !== '' && v !== null && v !== undefined;
    return {
      details: has(form.title) && has(form.description),
      media: form.media.length > 0 || has(form.images),
      category: has(form.category),
      pricing: has(form.price),
      inventory: has(form.quantityAvailable),
      shipping: has(form.locationCity) || has(form.locationCountry) || has(form.warehouseLocation),
      variants: variantGroups.length > 0,
      specs: has(form.material) || has(form.color) || has(form.size),
      review: has(form.title) && has(form.price),
    };
  }, [form, variantGroups]);

  const coverImage = form.media[0]?.url || null;

  const scrollToSection = (id) => {
    document.getElementById(`apf-section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="apf-page" ref={formTopRef}>
      <div className="apf-toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`apf-toast apf-toast-${t.type}`}>
            <span>{t.type === 'error' ? '⚠️' : '✅'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      <div className="apf-header">
        <h2>{editProduct ? 'Edit product' : 'List a new product'}</h2>
        <p>
          Reuse a template, or let <strong>Colline</strong> generate one.
          Every listing is polished by <strong>Nsubuga Joseph</strong>.
        </p>
      </div>

      <div className="apf-progress">
        {SECTIONS.map((s, i) => {
          const isDone = completeness[s.id];
          return (
            <div
              key={s.id}
              className={`apf-progress-step${isDone ? ' is-complete' : ''}`}
              onClick={() => scrollToSection(s.id)}
              role="button"
              tabIndex={0}
            >
              <span className="apf-step-dot">{isDone ? '✓' : i + 1}</span>
              {s.label}
            </div>
          );
        })}
      </div>

      <div className="apf-template-bar">
        {templates.length > 0 && (
          <div className="apf-field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
            <label>Reuse a template</label>
            <select value={selectedTemplateId} onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">— Start from scratch —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
        <button
          type="button"
          className="apf-btn apf-btn-amber"
          onClick={generateTemplate}
          disabled={generating}
        >
          {generating && <span className="apf-spinner" />}
          {generating ? 'Colline is generating…' : '✨ Generate a template'}
        </button>
      </div>

      {error && <div className="apf-alert apf-alert-error">⚠️ {error}</div>}
      {result && (
        <div className="apf-alert apf-alert-success">
          <div>
            {result.message}
            {result.product?.ai_polish_notes && (
              <div style={{ marginTop: 6 }}>
                <em>Nsubuga Joseph's note:</em> {result.product.ai_polish_notes}
              </div>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* PRODUCT DETAILS */}
        <SectionCard id="details" icon="📦" title="Product Details" subtitle="What are you selling?">
          <FloatField
            label="Product Name"
            required
            value={form.title}
            onChange={update('title')}
            title="Example: Samsung Galaxy S24 Ultra"
          />
          <div className="apf-row">
            <FloatField label="Brand" value={form.brand} onChange={update('brand')} />
            <FloatField label="Manufacturer" value={form.manufacturer} onChange={update('manufacturer')} />
          </div>
          <div className="apf-row">
            <FloatField label="Model Number" value={form.modelNumber} onChange={update('modelNumber')} />
            <FloatField label="SKU" value={form.sku} onChange={update('sku')} helper="Your internal stock-keeping code" />
          </div>
          <FloatField
            label="Short Description"
            textarea
            rows={2}
            value={form.shortDescription}
            onChange={update('shortDescription')}
            helper="A short summary buyers see first"
          />
          <FloatField
            label="Full Description"
            textarea
            rows={6}
            value={form.description}
            onChange={update('description')}
            helper="Describe your product in detail — condition, use case, what makes it stand out"
          />
          <FloatField
            label="Key Features"
            textarea
            rows={4}
            value={form.features}
            onChange={update('features')}
            helper="One per line, e.g. Fast charging / Waterproof / Original product"
          />
          <FloatField
            label="Package Contents"
            textarea
            rows={3}
            value={form.packageContents}
            onChange={update('packageContents')}
            helper="What exactly is included in the box"
          />
        </SectionCard>

        {/* PHOTOS & VIDEO */}
        <SectionCard id="media" icon="🖼️" title="Photos & Video" subtitle="The first photo becomes your cover image">
          <p className="apf-hint">Upload clear images from different angles. Drag files in, or tap to browse — works on mobile too.</p>

          <ProductMediaDropzone
            currentCount={form.media.length}
            maxItems={10}
            onUploaded={(media) => setForm((prev) => ({ ...prev, media: [...prev.media, media] }))}
            onError={(msg) => { setError(msg); pushToast('error', msg); }}
          />

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
            <MediaUploader
              label="Upload Product Image"
              accept="image/*"
              onUploaded={(media) => {
                setForm((prev) => ({ ...prev, media: [...prev.media, { type: 'image', url: media.url }] }));
              }}
            />
            <MediaUploader
              label="Upload Product Video"
              accept="video/*"
              onUploaded={(media) => {
                setForm((prev) => ({
                  ...prev,
                  media: prev.media.length >= 10 ? prev.media : [...prev.media, { type: 'video', url: media.url }]
                }));
              }}
            />
          </div>

          {form.media.length > 0 && (
            <div className="apf-media-grid">
              {form.media.map((item, index) => (
                <div className="apf-media-tile" key={`${item.url}-${index}`}>
                  {index === 0 && <div className="apf-cover-badge">COVER</div>}
                  {item.type === 'image' ? (
                    <img src={item.url} alt={`Product ${index + 1}`} />
                  ) : (
                    <video src={item.url} controls />
                  )}
                  <div className="apf-media-actions">
                    {index !== 0 && (
                      <button type="button" className="apf-set-cover" onClick={() => setCoverMedia(index)}>
                        Set cover
                      </button>
                    )}
                    <button type="button" className="apf-remove" onClick={() => removeMedia(index)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <FloatField
            label="External Image URLs"
            value={form.images}
            onChange={update('images')}
            helper="Optional — paste image URLs separated by commas"
            style={{ marginTop: 16 }}
          />
        </SectionCard>

        {/* CATEGORY */}
        <SectionCard id="category" icon="🗂️" title="Category" subtitle="Helps buyers find your listing">
          <div className="apf-row">
            <SelectField label="Category" required value={form.category} onChange={update('category')}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </SelectField>
            <SelectField label="Condition" required value={form.condition} onChange={update('condition')}>
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </SelectField>
          </div>
        </SectionCard>

        {/* PRICING */}
        <SectionCard id="pricing" icon="💰" title="Pricing" subtitle="Set your price and currency">
          <div className="apf-row">
            <div className="apf-field apf-prefix-field apf-float">
              <span className="apf-prefix">{form.currency}</span>
              <input
                type="number"
                placeholder=" "
                value={form.price}
                onChange={update('price')}
                required
                className={!form.price ? 'apf-invalid' : ''}
              />
              <label>Selling Price<span className="apf-required">*</span></label>
              {!form.price && <div className="apf-error-text">Price is required</div>}
            </div>
            <SelectField label="Currency" value={form.currency} onChange={update('currency')}>
              <option value="USD">USD</option>
              <option value="UGX">UGX</option>
              <option value="KES">KES</option>
              <option value="NGN">NGN</option>
            </SelectField>
          </div>
          <div className="apf-row">
            <FloatField
              label="Original Price"
              type="number"
              value={form.originalPrice}
              onChange={update('originalPrice')}
              helper="Optional — shown crossed out to highlight a discount"
            />
            <FloatField label="Discount (%)" type="number" value={form.discount} onChange={update('discount')} />
          </div>
          {canPublishWholesale && (
            <div className="apf-row" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
              <div className="apf-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="apf-is-sourceable"
                  checked={!!form.isSourceable}
                  onChange={updateCheckbox('isSourceable')}
                />
                <label htmlFor="apf-is-sourceable" style={{ margin: 0 }}>
                  List in wholesale catalog (sourceable by sellers &amp; dropshippers)
                </label>
              </div>
              {form.isSourceable && (
                <FloatField
                  label="Wholesale Price"
                  type="number"
                  value={form.wholesalePrice}
                  onChange={update('wholesalePrice')}
                  helper="The per-unit price connected businesses see when importing this product. Falls back to Selling Price if left blank."
                />
              )}
            </div>
          )}
        </SectionCard>

        {/* QUANTITY & INVENTORY */}
        <SectionCard id="inventory" icon="📊" title="Quantity & Inventory" subtitle="How much stock do you have?">
          <div className="apf-row">
            <FloatField
              label="Available Quantity"
              type="number"
              value={form.quantityAvailable}
              onChange={update('quantityAvailable')}
            />
            <FloatField
              label="Minimum Order Quantity"
              type="number"
              value={form.minimumOrderQuantity}
              onChange={update('minimumOrderQuantity')}
            />
          </div>
        </SectionCard>

        {/* SHIPPING */}
        <SectionCard id="shipping" icon="🚚" title="Shipping" subtitle="Where it ships from and how long it takes">
          <div className="apf-row">
            <FloatField
              label="Warehouse Location"
              value={form.warehouseLocation}
              onChange={update('warehouseLocation')}
              title="Example: Kampala Warehouse"
            />
            <FloatField
              label="Delivery Time"
              value={form.deliveryTime}
              onChange={update('deliveryTime')}
              helper="Example: 2–5 working days"
            />
          </div>
          <div className="apf-row">
            <FloatField label="City" value={form.locationCity} onChange={update('locationCity')} />
            <FloatField label="Country" value={form.locationCountry} onChange={update('locationCountry')} />
          </div>
          <FloatField
            label="Shipping Cost"
            type="number"
            value={form.shippingCost}
            onChange={update('shippingCost')}
          />
        </SectionCard>

        {/* PRODUCT VARIANTS */}
        <SectionCard
          id="variants"
          icon="🎛️"
          title="Product Variants"
          subtitle="Optional — e.g. Color: Red, Blue · Size: S, M, L"
        >
          {variantGroups.length === 0 && (
            <p className="apf-hint">No variant options yet. Add one if this product comes in different colors, sizes, or styles.</p>
          )}
          {variantGroups.map((group) => (
            <VariantGroupEditor
              key={group.id}
              group={group}
              onRename={(name) => renameVariantGroup(group.id, name)}
              onAddValue={(v) => addVariantValue(group.id, v)}
              onRemoveValue={(v) => removeVariantValue(group.id, v)}
              onRemoveGroup={() => removeVariantGroup(group.id)}
            />
          ))}
          <button type="button" className="apf-add-variant-btn" onClick={addVariantGroup}>
            + Add variant option (e.g. Color, Size)
          </button>
          <div className="apf-variant-note">
            Variant groups are saved with your listing's specifications and are fully preserved when you edit this listing.
          </div>
        </SectionCard>

        {/* PRODUCT SPECIFICATIONS */}
        <SectionCard id="specs" icon="⚙️" title="Product Specifications" subtitle="Detailed attributes buyers search for">
          <div className="apf-row">
            <FloatField label="Material" value={form.material} onChange={update('material')} title="Example: Aluminum, Cotton, Leather" />
            <FloatField label="Color" value={form.color} onChange={update('color')} helper="Black, White, Blue…" />
          </div>
          <div className="apf-row">
            <FloatField label="Size" value={form.size} onChange={update('size')} helper="Small, Medium, Large, 42…" />
            <FloatField label="Weight" value={form.weight} onChange={update('weight')} helper="Example: 1.5kg" />
          </div>
          <FloatField label="Dimensions" value={form.dimensions} onChange={update('dimensions')} helper="Example: 20cm x 15cm x 5cm" />
          <div className="apf-row">
            <FloatField label="Warranty" value={form.warranty} onChange={update('warranty')} helper="Example: 12 Months" />
            <FloatField label="Country of Origin" value={form.countryOfOrigin} onChange={update('countryOfOrigin')} helper="Example: Uganda, China, USA" />
          </div>

          <div className="apf-card-sub" style={{ margin: '18px 0 10px', fontWeight: 700, color: 'var(--forest)' }}>
            Search optimization
          </div>
          <FloatField label="Search Keywords" value={form.keywords} onChange={update('keywords')} helper="phone, samsung, smartphone, electronics" />
          <FloatField label="Meta Title" value={form.metaTitle} onChange={update('metaTitle')} helper="Product title for search engines" />
          <FloatField label="Meta Description" textarea rows={3} value={form.metaDescription} onChange={update('metaDescription')} helper="Short description shown in search results" />
        </SectionCard>

        {/* REVIEW & PUBLISH */}
        <SectionCard id="review" icon="✅" title="Review & Publish" subtitle="Double-check before it goes live">
          <div className="apf-review-grid">
            {coverImage ? (
              <img src={coverImage} alt="Cover preview" className="apf-review-image" />
            ) : (
              <div className="apf-review-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B7BEB4', fontSize: '0.8rem' }}>
                No cover photo yet
              </div>
            )}
            <div>
              <h4 className="apf-review-title">{form.title || 'Untitled product'}</h4>
              <div className="apf-review-price">
                {form.currency} {form.price || '0.00'}
                {form.originalPrice ? <span className="apf-strike">{form.currency} {form.originalPrice}</span> : null}
              </div>
              <div className="apf-review-meta">
                {form.brand && <span>{form.brand}</span>}
                <span>{CATEGORIES.find((c) => c.value === form.category)?.label || form.category}</span>
                <span>{CONDITIONS.find((c) => c.value === form.condition)?.label || form.condition}</span>
                {(form.locationCity || form.locationCountry) && (
                  <span>{[form.locationCity, form.locationCountry].filter(Boolean).join(', ')}</span>
                )}
              </div>
              <p style={{ fontSize: '0.85rem', color: '#5B6760', margin: 0 }}>
                {form.shortDescription || 'No short description yet.'}
              </p>

              <div className="apf-checklist">
                {SECTIONS.filter((s) => s.id !== 'review').map((s) => (
                  <div key={s.id} className={`apf-checklist-item ${completeness[s.id] ? 'ok' : 'missing'}`}>
                    <span>{completeness[s.id] ? '✓' : '○'}</span>
                    <span>{s.label}{completeness[s.id] ? ' — complete' : ' — not filled in yet'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="apf-action-bar">
            <button type="button" className="apf-btn apf-btn-ghost" onClick={handleCancel} disabled={busy || draftBusy}>
              Cancel
            </button>
            <button type="button" className="apf-btn apf-btn-secondary" onClick={() => setPreview(true)}>
              👁 Preview
            </button>
            <button
              type="button"
              className="apf-btn apf-btn-secondary"
              onClick={handleSaveDraft}
              disabled={draftBusy || busy}
            >
              {draftBusy && <span className="apf-spinner" />}
              {draftBusy ? 'Saving draft…' : '💾 Save Draft'}
            </button>
            <button
              type="submit"
              className="apf-btn apf-btn-primary"
              disabled={busy || draftBusy}
            >
              {busy && <span className="apf-spinner" />}
              {busy
                ? (editProduct ? 'Saving...' : 'Publishing...')
                : (editProduct ? '💾 Save Changes' : '🚀 Publish Product')}
            </button>
          </div>
        </SectionCard>
      </form>

      {preview && (
        <div className="apf-modal-backdrop" onClick={() => setPreview(false)}>
          <div className="apf-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="apf-modal-close" onClick={() => setPreview(false)} aria-label="Close preview">✕</button>
            <h3>{form.title || 'Product Preview'}</h3>
            {form.media[0] && (
              form.media[0].type === 'video' ? (
                <video src={form.media[0].url} controls style={{ width: '100%', height: 250, objectFit: 'cover', borderRadius: 10 }} />
              ) : (
                <img src={form.media[0].url} alt="preview" style={{ width: '100%', height: 250, objectFit: 'cover', borderRadius: 10 }} />
              )
            )}
            <h4 style={{ marginTop: 16 }}>Price</h4>
            <p>{form.currency} {form.price}</p>
            {variantGroups.length > 0 && (
              <>
                <h4>Options</h4>
                {variantGroups.map((g) => (
                  <p key={g.id}>{g.name || 'Option'}: {g.values.join(', ') || '—'}</p>
                ))}
              </>
            )}
            <h4>Specifications</h4>
            <p>Brand: {form.brand}</p>
            <p>Manufacturer: {form.manufacturer}</p>
            <p>Material: {form.material}</p>
            <p>Location: {form.locationCity}, {form.locationCountry}</p>
            <button className="apf-btn apf-btn-secondary" onClick={() => setPreview(false)} style={{ marginTop: 10 }}>
              Close Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function VariantGroupEditor({ group, onRename, onAddValue, onRemoveValue, onRemoveGroup }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    if (draft.trim()) {
      onAddValue(draft);
      setDraft('');
    }
  };
  return (
    <div className="apf-variant-group">
      <div className="apf-variant-group-head">
        <input
          type="text"
          placeholder="Option name — e.g. Color"
          value={group.name}
          onChange={(e) => onRename(e.target.value)}
        />
        <button type="button" className="apf-icon-btn-remove" onClick={onRemoveGroup} title="Remove this option group">✕</button>
      </div>
      <div className="apf-chip-input">
        {group.values.map((v) => (
          <span className="apf-chip" key={v}>
            {v}
            <button type="button" onClick={() => onRemoveValue(v)}>✕</button>
          </span>
        ))}
        <input
          type="text"
          placeholder="Type a value and press Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
        />
      </div>
    </div>
  );
}
