const SPEC_FIELDS = [
  ['brand', 'Brand'], ['manufacturer', 'Manufacturer'], ['model_number', 'Model Number'],
  ['material', 'Material'], ['color', 'Color'], ['size', 'Size'], ['weight', 'Weight'],
  ['dimensions', 'Dimensions'], ['storage', 'Storage'], ['memory', 'Memory'], ['processor', 'Processor'],
  ['operating_system', 'Operating System'], ['battery', 'Battery'], ['voltage', 'Voltage'], ['power', 'Power'],
  ['warranty', 'Warranty'], ['country_of_origin', 'Country of Origin'], ['certification', 'Certification'],
  ['production_capacity', 'Production Capacity'], ['packaging', 'Packaging'],
  ['custom_logo_support', 'Custom Logo Support'], ['oem_odm', 'OEM/ODM Available'], ['quality_inspection', 'Quality Inspection']
];

// specs is the existing JSONB column — sellers/Colline already populate
// category-relevant keys here. sku is a real dedicated column, included
// separately since it always exists regardless of specs content.
export default function SpecsTable({ specs = {}, sku }) {
  const rows = [
    ...(sku ? [['SKU', sku]] : []),
    ...SPEC_FIELDS.filter(([key]) => specs[key]).map(([key, label]) => [label, specs[key]])
  ];

  if (rows.length === 0) {
    return <p style={{ color: '#8A9189' }}>The seller hasn't added detailed specifications for this product yet.</p>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} style={{ borderBottom: '1px solid var(--line)' }}>
            <td style={{ padding: '10px 12px', fontWeight: 600, width: '35%', color: '#5B6760', fontSize: '0.88rem' }}>{label}</td>
            <td style={{ padding: '10px 12px', fontSize: '0.9rem' }}>{String(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
