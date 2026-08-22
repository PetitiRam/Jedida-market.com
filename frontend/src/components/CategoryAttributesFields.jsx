import { useEffect, useState } from 'react';
import * as categoryAttributesApi from '../api/categoryAttributesApi';

// Drop-in, self-contained renderer for category-specific product
// attributes (master brief section 11). Given a category and the
// current values object, renders the right input for each attribute
// this category defines (text/number/boolean/select/multiselect) and
// calls onChange(updatedValues) as the seller fills them in.
//
// Deliberately standalone rather than wired into AddProductPanel.jsx's
// existing Specifications step — that form already has its own large,
// working set of generic fields (material, color, size, weight,
// dimensions, warranty…) wired through specific state and submit
// logic. Bolting this in without fully re-verifying that flow risks
// breaking working product creation, which the master brief explicitly
// warns against. This component is ready to adopt there (or anywhere
// else a category-aware product form is needed) whenever that
// integration is done deliberately.
export default function CategoryAttributesFields({ category, values, onChange }) {
  const [attributes, setAttributes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!category) return;
    setLoading(true);
    categoryAttributesApi.getSchemaForCategory(category)
      .then(({ data }) => setAttributes(data.attributes || []))
      .finally(() => setLoading(false));
  }, [category]);

  const setField = (key, value) => onChange({ ...values, [key]: value });

  if (loading) return <div className="empty-state">Loading fields for this category…</div>;
  if (attributes.length === 0) return null;

  return (
    <div>
      {attributes.map((attr) => {
        const value = values?.[attr.key] ?? '';
        return (
          <div className="field-group" key={attr.key}>
            <label>{attr.label}{attr.unit ? ` (${attr.unit})` : ''}{attr.required ? ' *' : ''}</label>
            {attr.type === 'boolean' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                <input type="checkbox" checked={Boolean(value)} onChange={(e) => setField(attr.key, e.target.checked)} />
                Yes
              </label>
            )}
            {attr.type === 'number' && (
              <input type="number" value={value} onChange={(e) => setField(attr.key, e.target.value)} />
            )}
            {attr.type === 'text' && (
              <input type="text" value={value} onChange={(e) => setField(attr.key, e.target.value)} />
            )}
            {attr.type === 'select' && (
              <select value={value} onChange={(e) => setField(attr.key, e.target.value)}>
                <option value="">Select…</option>
                {attr.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            {attr.type === 'multiselect' && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {attr.options.map((o) => {
                  const selected = Array.isArray(value) ? value : [];
                  return (
                    <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={selected.includes(o)}
                        onChange={(e) => setField(attr.key, e.target.checked ? [...selected, o] : selected.filter((v) => v !== o))}
                      />
                      {o}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
