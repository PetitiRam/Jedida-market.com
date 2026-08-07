import { useMemo } from 'react';
import { COUNTRIES, CITIES_BY_COUNTRY } from '../../constants/countries';
import Icon from '../icons/icon';

export default function LocationPhoneSelectorV2({
  countryIso2, onCountryChange,
  city, onCityChange,
  dialCode, onDialCodeChange,
  phoneNumber, onPhoneNumberChange,
}) {
  const cityOptions = useMemo(() => CITIES_BY_COUNTRY[countryIso2] || [], [countryIso2]);

  const handleCountryChange = (e) => {
    const iso2 = e.target.value;
    const country = COUNTRIES.find((c) => c.iso2 === iso2);

    onCountryChange(iso2);

    setTimeout(() => {
      onDialCodeChange(country ? country.dialCode : '');
    }, 0);

    onCityChange('');
  };

  return (
    <>
      <div className="jd-field-row">
        <div className={`jd-field jd-has-icon-left ${countryIso2 ? '' : ''}`}>
          <div className="jd-field-input-wrap">
            <span className="jd-field-icon-left"><Icon name="globe" size={16} /></span>
            <select
              id="countryIso2"
              value={countryIso2}
              onChange={handleCountryChange}
              required
              className={countryIso2 ? 'jd-filled' : ''}
            >
              <option value="" />
              {COUNTRIES.map((c) => (
                <option key={c.iso2} value={c.iso2}>{c.flag} {c.name}</option>
              ))}
            </select>
            <label htmlFor="countryIso2" className={`jd-field-label ${countryIso2 ? 'jd-float' : ''}`}>Country</label>
          </div>
        </div>

        <div className="jd-field">
          <div className="jd-field-input-wrap">
            {cityOptions.length > 0 ? (
              <select
                id="city"
                value={city}
                onChange={(e) => onCityChange(e.target.value)}
                className={city ? 'jd-filled' : ''}
              >
                <option value="" />
                {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input
                id="city"
                value={city}
                onChange={(e) => onCityChange(e.target.value)}
                className={city ? 'jd-filled' : ''}
              />
            )}
            <label htmlFor="city" className={`jd-field-label ${city ? 'jd-float' : ''}`}>City</label>
          </div>
        </div>
      </div>

      <div className="jd-field-row">
        <div className="jd-field" style={{ maxWidth: 128, flex: '0 0 118px' }}>
          <div className="jd-field-input-wrap">
            <select
              id="dialCode"
              value={dialCode}
              onChange={(e) => onDialCodeChange(e.target.value)}
              required
              className={dialCode ? 'jd-filled' : ''}
            >
              <option value="" />
              {COUNTRIES.map((c) => (
                <option key={c.iso2} value={c.dialCode}>{c.flag} {c.dialCode}</option>
              ))}
            </select>
            <label htmlFor="dialCode" className={`jd-field-label ${dialCode ? 'jd-float' : ''}`}>Code</label>
          </div>
        </div>
        <div className="jd-field jd-has-icon-left" style={{ flex: 1 }}>
          <div className="jd-field-input-wrap">
            <span className="jd-field-icon-left"><Icon name="phone" size={16} /></span>
            <input
              id="phoneNumber"
              inputMode="numeric"
              value={phoneNumber}
              onChange={(e) => onPhoneNumberChange(e.target.value.replace(/[^\d]/g, ''))}
              required
              className={phoneNumber ? 'jd-filled' : ''}
            />
            <label htmlFor="phoneNumber" className={`jd-field-label ${phoneNumber ? 'jd-float' : ''}`}>Phone number</label>
          </div>
        </div>
      </div>
    </>
  );
}
