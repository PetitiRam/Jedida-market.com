import { useEffect, useState, useCallback } from 'react';
import { normalizeError } from '../../api/client';
import * as api from '../../api/marketplaceBuilder';
import { CATEGORIES } from '../../constants/categories';
import '../../styles/marketplace-builder.css';

const KIND_LABEL = { products: 'Products', shops: 'Shops', categories: 'Categories' };
const SOURCE_LABEL = { query: 'Live query', manual: 'Curated list', category: 'Live category' };

function fmtDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Draggable, reorderable section list
// ---------------------------------------------------------------------------
function SectionRow({ section, index, onDragStart, onDragOver, onDrop, dragIndex, onOpen, onToggle, onDelete }) {
  const now = new Date();
  const scheduled = section.starts_at || section.ends_at;
  const upcoming = section.starts_at && new Date(section.starts_at) > now;
  const expired = section.ends_at && new Date(section.ends_at) < now;

  return (
    <div
      className={`jd-mb-row${dragIndex === index ? ' is-dragging' : ''}${!section.is_enabled ? ' is-disabled' : ''}`}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(index); }}
      onDrop={() => onDrop(index)}
    >
      <span className="jd-mb-handle" title="Drag to reorder">⠿</span>
      <div className="jd-mb-row-main" onClick={() => onOpen(section)}>
        <div className="jd-mb-row-title">
          {section.title}
          {section.is_system && <span className="jd-mb-badge is-system">Built-in</span>}
          {section.ai_managed && <span className="jd-mb-badge is-ai">AI-managed</span>}
          {scheduled && <span className={`jd-mb-badge is-scheduled`}>{upcoming ? 'Scheduled' : expired ? 'Expired' : 'Time-limited'}</span>}
          {!section.is_enabled && <span className="jd-mb-badge is-off">Disabled</span>}
        </div>
        <div className="jd-mb-row-sub">
          {KIND_LABEL[section.section_kind]} · {SOURCE_LABEL[section.source_type]} · {section.layout === 'rail' ? 'Horizontal scroll' : 'Grid'}
          {section.section_kind === 'products' && ` · ${section.product_count} item${section.product_count === 1 ? '' : 's'} attached`}
          {section.section_kind === 'shops' && ` · ${section.shop_count} shop${section.shop_count === 1 ? '' : 's'} attached`}
          {section.section_kind === 'categories' && ` · ${section.category_count} categor${section.category_count === 1 ? 'y' : 'ies'}`}
        </div>
      </div>
      <div className="jd-mb-row-actions">
        <button
          type="button"
          className={`jd-mb-switch${section.is_enabled ? ' is-on' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggle(section); }}
          aria-label={section.is_enabled ? 'Disable section' : 'Enable section'}
        />
        <button type="button" className="jd-mb-icon-btn" onClick={() => onOpen(section)} title="Edit">✎</button>
        {!section.is_system && (
          <button type="button" className="jd-mb-icon-btn is-danger" onClick={() => onDelete(section)} title="Delete">🗑</button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attach picker — search + add, with drag-to-reorder on the attached list
// ---------------------------------------------------------------------------
function ProductAttachPicker({ sectionId, items, onChange }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [dragIndex, setDragIndex] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim().length < 2) { setResults([]); return; }
      api.searchProducts(search).then(({ data }) => setResults(data.products || [])).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const add = async (product) => {
    if (items.some((i) => i.id === product.id)) return;
    const nextIds = [...items.map((i) => i.id), product.id];
    await api.attachProducts(sectionId, nextIds);
    onChange([...items, { ...product, added_by: 'admin' }]);
  };

  const remove = async (productId) => {
    await api.detachProduct(sectionId, productId);
    onChange(items.filter((i) => i.id !== productId));
  };

  const commitOrder = async (next) => {
    onChange(next);
    await api.reorderSectionProducts(sectionId, next.map((i) => i.id));
  };

  const handleDrop = (dropIndex) => {
    if (dragIndex === null || dragIndex === dropIndex) return;
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    setDragIndex(null);
    commitOrder(next);
  };

  return (
    <div>
      <div className="jd-mb-attach-search">
        <input placeholder="Search products by title or category…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {results.length > 0 && (
        <div className="jd-mb-attach-results" style={{ marginTop: 8 }}>
          {results.map((p) => (
            <div className="jd-mb-attach-result" key={p.id}>
              {p.images?.[0] && <img src={p.images[0]} alt="" />}
              <span>{p.title} — {p.currency} {p.price}</span>
              <button type="button" onClick={() => add(p)}>Add</button>
            </div>
          ))}
        </div>
      )}
      <div className="jd-mb-attached-list" style={{ marginTop: 10 }}>
        {items.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>No products attached yet — search above to add some, or let Tausi AI curate this section.</p>}
        {items.map((item, i) => (
          <div
            key={item.id}
            className={`jd-mb-attached-item${dragIndex === i ? ' is-dragging' : ''}`}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(i)}
          >
            <span className="jd-mb-handle">⠿</span>
            {item.images?.[0] && <img src={item.images[0]} alt="" />}
            <span>{item.title}</span>
            {item.added_by === 'ai' && <span className="jd-mb-ai-tag">AI</span>}
            <button type="button" onClick={() => remove(item.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShopAttachPicker({ sectionId, items, onChange }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [dragIndex, setDragIndex] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim().length < 2) { setResults([]); return; }
      api.searchShops(search).then(({ data }) => setResults(data.shops || [])).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const add = async (shop) => {
    if (items.some((i) => i.id === shop.id)) return;
    const nextIds = [...items.map((i) => i.id), shop.id];
    await api.attachShops(sectionId, nextIds);
    onChange([...items, { ...shop, added_by: 'admin' }]);
  };

  const remove = async (shopId) => {
    await api.detachShop(sectionId, shopId);
    onChange(items.filter((i) => i.id !== shopId));
  };

  const handleDrop = async (dropIndex) => {
    if (dragIndex === null || dragIndex === dropIndex) return;
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    setDragIndex(null);
    onChange(next);
    await api.attachShops(sectionId, next.map((i) => i.id));
  };

  return (
    <div>
      <div className="jd-mb-attach-search">
        <input placeholder="Search shops by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {results.length > 0 && (
        <div className="jd-mb-attach-results" style={{ marginTop: 8 }}>
          {results.map((s) => (
            <div className="jd-mb-attach-result" key={s.id}>
              {s.logo_url && <img src={s.logo_url} alt="" />}
              <span>{s.name}</span>
              <button type="button" onClick={() => add(s)}>Add</button>
            </div>
          ))}
        </div>
      )}
      <div className="jd-mb-attached-list" style={{ marginTop: 10 }}>
        {items.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>No shops attached yet — search above to add some.</p>}
        {items.map((item, i) => (
          <div
            key={item.id}
            className={`jd-mb-attached-item${dragIndex === i ? ' is-dragging' : ''}`}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(i)}
          >
            <span className="jd-mb-handle">⠿</span>
            {item.logo_url && <img src={item.logo_url} alt="" />}
            <span>{item.name}</span>
            <button type="button" onClick={() => remove(item.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryAttachPicker({ sectionId, selected, onChange }) {
  const toggle = async (value) => {
    const next = selected.includes(value) ? selected.filter((c) => c !== value) : [...selected, value];
    onChange(next);
    await api.attachCategories(sectionId, next);
  };
  return (
    <div className="jd-mb-cat-chip-grid">
      {CATEGORIES.map((c) => (
        <button
          type="button"
          key={c.value}
          className={`jd-mb-cat-chip${selected.includes(c.value) ? ' is-active' : ''}`}
          onClick={() => toggle(c.value)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor drawer — every field a section can have: layout, schedule,
// AI-managed toggle, and (for manual/custom sections) attachments.
// ---------------------------------------------------------------------------
function SectionEditorDrawer({ sectionId, onClose, onSaved }) {
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getSection(sectionId).then(({ data }) => {
      setDetail(data);
      setForm({
        title: data.section.title,
        subtitle: data.section.subtitle || '',
        layout: data.section.layout,
        maxItems: data.section.max_items,
        aiManaged: data.section.ai_managed,
        filterCategory: data.section.filter_category || '',
        startsAt: fmtDateInput(data.section.starts_at),
        endsAt: fmtDateInput(data.section.ends_at),
      });
    }).catch((err) => setError(normalizeError(err).friendlyMessage));
  }, [sectionId]);

  if (!detail || !form) {
    return (
      <div className="jd-mb-drawer-backdrop" onClick={onClose}>
        <div className="jd-mb-drawer" onClick={(e) => e.stopPropagation()}>
          <p>Loading section…</p>
        </div>
      </div>
    );
  }

  const { section } = detail;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api.updateSection(section.id, {
        title: form.title,
        subtitle: form.subtitle,
        layout: form.layout,
        maxItems: Number(form.maxItems) || 12,
        aiManaged: form.aiManaged,
        filterCategory: section.source_type === 'category' ? form.filterCategory : undefined,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      });
      onSaved();
    } catch (err) {
      setError(normalizeError(err).friendlyMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="jd-mb-drawer-backdrop" onClick={onClose}>
      <div className="jd-mb-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="jd-mb-drawer-head">
          <h3>Edit section</h3>
          <button type="button" className="jd-mb-close" onClick={onClose}>✕</button>
        </div>

        {error && <p style={{ color: '#C94B4B', fontSize: 13 }}>{error}</p>}

        <div className="jd-mb-field">
          <label>Title</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="jd-mb-field">
          <label>Subtitle</label>
          <textarea rows={2} value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
        </div>

        <div className="jd-mb-row2">
          <div className="jd-mb-field">
            <label>Layout</label>
            <select value={form.layout} onChange={(e) => setForm({ ...form, layout: e.target.value })}>
              <option value="rail">Horizontal scroll (rail)</option>
              <option value="grid">Grid</option>
            </select>
          </div>
          <div className="jd-mb-field">
            <label>Max items shown</label>
            <input type="number" min={1} max={48} value={form.maxItems} onChange={(e) => setForm({ ...form, maxItems: e.target.value })} />
          </div>
        </div>

        {section.source_type === 'category' && (
          <div className="jd-mb-field">
            <label>Category this section pulls from</label>
            <select value={form.filterCategory} onChange={(e) => setForm({ ...form, filterCategory: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        )}

        <div className="jd-mb-row2">
          <div className="jd-mb-field">
            <label>Show from</label>
            <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          </div>
          <div className="jd-mb-field">
            <label>Show until</label>
            <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </div>
        </div>

        {section.section_kind !== 'categories' && (
          <label className="jd-mb-check-row">
            <input type="checkbox" checked={form.aiManaged} onChange={(e) => setForm({ ...form, aiManaged: e.target.checked })} />
            Let Tausi AI automatically curate this section's products
          </label>
        )}

        <button type="button" className="jd-mb-save-btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>

        {section.source_type === 'manual' && section.section_kind === 'products' && (
          <>
            <hr className="jd-mb-section-divider" />
            <h4 style={{ margin: 0 }}>Attached products</h4>
            <ProductAttachPicker
              sectionId={section.id}
              items={detail.products.map((p) => ({ ...p }))}
              onChange={(next) => setDetail({ ...detail, products: next })}
            />
          </>
        )}

        {section.section_kind === 'shops' && section.source_type === 'manual' && (
          <>
            <hr className="jd-mb-section-divider" />
            <h4 style={{ margin: 0 }}>Attached shops</h4>
            <ShopAttachPicker
              sectionId={section.id}
              items={detail.shops.map((s) => ({ ...s }))}
              onChange={(next) => setDetail({ ...detail, shops: next })}
            />
          </>
        )}

        {section.section_kind === 'categories' && (
          <>
            <hr className="jd-mb-section-divider" />
            <h4 style={{ margin: 0 }}>Spotlighted categories</h4>
            <CategoryAttachPicker
              sectionId={section.id}
              selected={detail.categories.map((c) => c.category)}
              onChange={(next) => setDetail({ ...detail, categories: next.map((category) => ({ category })) })}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New section form
// ---------------------------------------------------------------------------
function NewSectionForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({
    title: '', subtitle: '', sectionKind: 'products', sourceType: 'manual',
    filterCategory: 'electronics', layout: 'rail', maxItems: 12, aiManaged: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await api.createSection({
        title: form.title,
        subtitle: form.subtitle,
        sectionKind: form.sectionKind,
        sourceType: form.sectionKind === 'categories' ? 'manual' : form.sourceType,
        filterCategory: form.sourceType === 'category' ? form.filterCategory : undefined,
        layout: form.layout,
        maxItems: Number(form.maxItems) || 12,
        aiManaged: form.aiManaged,
      });
      onCreated(data.section);
    } catch (err) {
      setError(normalizeError(err).friendlyMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="jd-mb-drawer-backdrop" onClick={onCancel}>
      <form className="jd-mb-drawer" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="jd-mb-drawer-head">
          <h3>New section</h3>
          <button type="button" className="jd-mb-close" onClick={onCancel}>✕</button>
        </div>
        {error && <p style={{ color: '#C94B4B', fontSize: 13 }}>{error}</p>}
        <div className="jd-mb-field">
          <label>Title</label>
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Back to School Picks" />
        </div>
        <div className="jd-mb-field">
          <label>Subtitle (optional)</label>
          <input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
        </div>
        <div className="jd-mb-row2">
          <div className="jd-mb-field">
            <label>Section type</label>
            <select value={form.sectionKind} onChange={(e) => setForm({ ...form, sectionKind: e.target.value })}>
              <option value="products">Product rail</option>
              <option value="shops">Shop rail</option>
              <option value="categories">Category spotlight</option>
            </select>
          </div>
          <div className="jd-mb-field">
            <label>Layout</label>
            <select value={form.layout} onChange={(e) => setForm({ ...form, layout: e.target.value })}>
              <option value="rail">Horizontal scroll (rail)</option>
              <option value="grid">Grid</option>
            </select>
          </div>
        </div>

        {form.sectionKind !== 'categories' && (
          <div className="jd-mb-field">
            <label>Where do products/shops come from?</label>
            <select value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })}>
              <option value="manual">I'll hand-pick them (or let Tausi AI curate)</option>
              {form.sectionKind === 'products' && <option value="category">Always show top products from one category</option>}
            </select>
          </div>
        )}

        {form.sourceType === 'category' && form.sectionKind === 'products' && (
          <div className="jd-mb-field">
            <label>Category</label>
            <select value={form.filterCategory} onChange={(e) => setForm({ ...form, filterCategory: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        )}

        {form.sourceType === 'manual' && form.sectionKind !== 'categories' && (
          <label className="jd-mb-check-row">
            <input type="checkbox" checked={form.aiManaged} onChange={(e) => setForm({ ...form, aiManaged: e.target.checked })} />
            Let Tausi AI automatically curate this section's products
          </label>
        )}

        <button type="submit" className="jd-mb-save-btn" disabled={saving}>{saving ? 'Creating…' : 'Create section'}</button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections tab
// ---------------------------------------------------------------------------
function SectionsTab() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.listSections()
      .then(({ data }) => setSections(data.sections || []))
      .catch((err) => setError(normalizeError(err).friendlyMessage))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleDrop = async (dropIndex) => {
    if (dragIndex === null || dragIndex === dropIndex) { setDragIndex(null); return; }
    const next = [...sections];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    setSections(next);
    setDragIndex(null);
    try {
      await api.reorderSections(next.map((s) => s.id));
    } catch (err) {
      setError(normalizeError(err).friendlyMessage);
      load();
    }
  };

  const toggle = async (section) => {
    setSections((prev) => prev.map((s) => (s.id === section.id ? { ...s, is_enabled: !s.is_enabled } : s)));
    try {
      await api.toggleSectionEnabled(section.id, !section.is_enabled);
    } catch (err) {
      setError(normalizeError(err).friendlyMessage);
      load();
    }
  };

  const remove = async (section) => {
    if (!window.confirm(`Delete "${section.title}"? This can't be undone.`)) return;
    try {
      await api.deleteSection(section.id);
      setSections((prev) => prev.filter((s) => s.id !== section.id));
    } catch (err) {
      setError(normalizeError(err).friendlyMessage);
    }
  };

  return (
    <div className="jd-mb">
      <div className="jd-mb-toolbar">
        <p>Drag rows to reorder the homepage. Toggle a section off to hide it instantly, or give it a schedule so it appears and disappears automatically.</p>
        <button type="button" className="jd-mb-add-btn" onClick={() => setCreating(true)}>+ Add section</button>
      </div>

      {error && <p style={{ color: '#C94B4B', fontSize: 13 }}>{error}</p>}
      {loading && <p>Loading sections…</p>}

      <div className="jd-mb-list">
        {sections.map((section, i) => (
          <SectionRow
            key={section.id}
            section={section}
            index={i}
            dragIndex={dragIndex}
            onDragStart={setDragIndex}
            onDragOver={() => {}}
            onDrop={handleDrop}
            onOpen={(s) => setEditingId(s.id)}
            onToggle={toggle}
            onDelete={remove}
          />
        ))}
      </div>

      {editingId && (
        <SectionEditorDrawer
          sectionId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); load(); }}
        />
      )}
      {creating && (
        <NewSectionForm
          onCancel={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tausi AI automation tab
// ---------------------------------------------------------------------------
const BEHAVIORS = [
  { key: 'choose_best_products', label: 'Choose the best products', desc: 'Fills AI-managed sections with the current top-performing active products.' },
  { key: 'replace_low_performers', label: 'Replace low performers', desc: 'Swaps out underperforming products in AI-managed sections for stronger ones.' },
  { key: 'detect_outdated_banners', label: 'Detect outdated banners', desc: 'Deactivates ads that have lapsed or gone unreviewed for 30+ days.' },
  { key: 'rotate_featured_products', label: 'Rotate featured products', desc: 'Unfeatures the weakest featured listings and promotes fresh top performers.' },
  { key: 'refresh_category_images', label: 'Refresh category images', desc: 'Re-checks the live best photo per category and logs what changed.' },
  { key: 'recommend_promotions', label: 'Recommend promotions', desc: 'Flags high-traffic, low-conversion products as coupon candidates for your review.' },
  { key: 'suggest_seasonal_campaigns', label: 'Suggest seasonal campaigns', desc: 'Checks the calendar against your live hero campaigns and suggests gaps to fill.' },
];

function AiAutomationTab() {
  const [settings, setSettings] = useState({});
  const [actions, setActions] = useState([]);
  const [running, setRunning] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    Promise.all([api.getTausiSettings(), api.getTausiActions()])
      .then(([s, a]) => {
        setSettings(Object.fromEntries((s.data.settings || []).map((row) => [row.behavior, row])));
        setActions(a.data.actions || []);
      })
      .catch((err) => setError(normalizeError(err).friendlyMessage));
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleBehavior = async (behavior, isEnabled) => {
    setSettings((prev) => ({ ...prev, [behavior]: { ...prev[behavior], is_enabled: isEnabled } }));
    try {
      await api.setTausiBehaviorEnabled(behavior, isEnabled);
    } catch (err) {
      setError(normalizeError(err).friendlyMessage);
    }
  };

  const run = async (behavior) => {
    setRunning(behavior);
    setError('');
    try {
      await api.runTausiBehavior(behavior);
      load();
    } catch (err) {
      setError(normalizeError(err).friendlyMessage);
    } finally {
      setRunning('');
    }
  };

  const decide = async (id, status) => {
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    try {
      await api.decideTausiAction(id, status);
    } catch (err) {
      setError(normalizeError(err).friendlyMessage);
    }
  };

  const suggestions = actions.filter((a) => a.status === 'suggested');
  const history = actions.filter((a) => a.status !== 'suggested').slice(0, 20);

  return (
    <div className="jd-mb">
      <div className="jd-mb-toolbar">
        <p>Tausi AI keeps the homepage fresh automatically. Turn any behavior off if you'd rather curate it by hand, or run one right now.</p>
        <button type="button" className="jd-mb-add-btn" onClick={() => run('all')} disabled={running !== ''}>
          {running === 'all' ? 'Running…' : '▶ Run all enabled now'}
        </button>
      </div>
      {error && <p style={{ color: '#C94B4B', fontSize: 13 }}>{error}</p>}

      <div className="jd-mb-ai-grid">
        {BEHAVIORS.map((b) => (
          <div className="jd-mb-ai-card" key={b.key}>
            <button
              type="button"
              className={`jd-mb-switch${settings[b.key]?.is_enabled ? ' is-on' : ''}`}
              onClick={() => toggleBehavior(b.key, !settings[b.key]?.is_enabled)}
              aria-label="Toggle behavior"
            />
            <div className="jd-mb-ai-card-body">
              <strong>{b.label}</strong>
              <span>{b.desc}</span>
              {settings[b.key]?.last_run_at && (
                <span> · Last ran {new Date(settings[b.key].last_run_at).toLocaleString()}</span>
              )}
            </div>
            <button type="button" className="jd-mb-ai-run-btn" onClick={() => run(b.key)} disabled={running !== ''}>
              {running === b.key ? 'Running…' : 'Run now'}
            </button>
          </div>
        ))}
      </div>

      {suggestions.length > 0 && (
        <>
          <h4 style={{ marginBottom: 0 }}>Awaiting your decision</h4>
          <div className="jd-mb-ai-log">
            {suggestions.map((a) => (
              <div className="jd-mb-ai-log-item" key={a.id}>
                <div className="jd-mb-ai-log-meta"><span>{a.behavior.replace(/_/g, ' ')}</span><span>{new Date(a.created_at).toLocaleString()}</span></div>
                <div>{a.summary}</div>
                <div className="jd-mb-ai-log-actions">
                  <button type="button" className="is-accept" onClick={() => decide(a.id, 'accepted')}>Acknowledge</button>
                  <button type="button" className="is-dismiss" onClick={() => decide(a.id, 'dismissed')}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h4 style={{ marginBottom: 0 }}>Recent activity</h4>
      <div className="jd-mb-ai-log">
        {history.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No AI activity yet — run a behavior above to see it here.</p>}
        {history.map((a) => (
          <div className="jd-mb-ai-log-item" key={a.id}>
            <div className="jd-mb-ai-log-meta"><span>{a.behavior.replace(/_/g, ' ')}</span><span>{new Date(a.created_at).toLocaleString()}</span></div>
            <div>{a.summary}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function AdminMarketplaceBuilder() {
  const [tab, setTab] = useState('sections');
  return (
    <div>
      <div className="tab-scroll" style={{ marginBottom: 16 }}>
        <button className={`tab-pill ${tab === 'sections' ? 'tab-pill-active' : ''}`} onClick={() => setTab('sections')}>🧩 Homepage Sections</button>
        <button className={`tab-pill ${tab === 'ai' ? 'tab-pill-active' : ''}`} onClick={() => setTab('ai')}>🤖 Tausi AI Automation</button>
      </div>
      {tab === 'sections' ? <SectionsTab /> : <AiAutomationTab />}
    </div>
  );
}
