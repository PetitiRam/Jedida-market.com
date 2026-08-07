import { useMemo } from 'react';
import { COUNTRIES, CITIES_BY_COUNTRY } from '../constants/countries';

/**
 * Renders: Country select, City select (options change with country),
 * and a phone number input with a dial-code prefix select attached.
 * Controlled via props — parent owns the state, this is purely presentational.
 */
export default function LocationPhoneSelector({
  countryIso2, onCountryChange,
  city, onCityChange,
  dialCode, onDialCodeChange,
  phoneNumber, onPhoneNumberChange
}) {
  const cityOptions = useMemo(() => CITIES_BY_COUNTRY[countryIso2] || [], [countryIso2]);

const handleCountryChange = (e) => {
  const iso2 = e.target.value;
  const country = COUNTRIES.find((c) => c.iso2 === iso2);

  // 1. update country first
  onCountryChange(iso2);

  // 2. force UI sync after React batch
  setTimeout(() => {
    if (country) {
      onDialCodeChange(country.dialCode);
    } else {
      onDialCodeChange('');
    }
  }, 0);

  // 3. reset city
  onCityChange('');
};
  return (
    <>
      <div className="field-row">
        <div className="field-group">
          <label>Country</label>
          <select value={countryIso2} onChange={handleCountryChange} required>
            <option value="">Select country</option>
            {COUNTRIES.map((c) => (
              <option key={c.iso2} value={c.iso2}>{c.flag} {c.name}</option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label>City</label>
          {cityOptions.length > 0 ? (
            <select value={city} onChange={(e) => onCityChange(e.target.value)}>
              <option value="">Select city</option>
              {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <input value={city} onChange={(e) => onCityChange(e.target.value)} placeholder="Your city" />
          )}
        </div>
      </div>

      <div className="field-group">
        <label>Phone number</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={dialCode}
            onChange={(e) => onDialCodeChange(e.target.value)}
            style={{ maxWidth: 110, flexShrink: 0 }}
            required
          >
            <option value="">Code</option>
            {COUNTRIES.map((c) => (
              <option key={c.iso2} value={c.dialCode}>{c.flag} {c.dialCode}</option>
            ))}
          </select>
          <input
            style={{ flex: 1 }}
            keyboardType="phone-pad"
            value={phoneNumber}
            onChange={(e) => onPhoneNumberChange(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="7XX XXX XXX"
            required
          />
        </div>
      </div>
    </>
  );
}
