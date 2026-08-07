import { useEffect, useState } from 'react';
import DropdownShell from './DropdownShell';
import Icon from '../icons/icon';

// A lightweight delivery-location picker for the header. There is no
// storefront-wide "current delivery address" concept in the backend yet
// (checkout collects its own address per order), so this stores the
// person's chosen city locally and is purely a display/filter convenience —
// it does not change what /products returns.
const CITIES = ['Kampala, UG', 'Entebbe, UG', 'Jinja, UG', 'Mbale, UG', 'Gulu, UG', 'Mbarara, UG'];
const STORAGE_KEY = 'jedida_delivery_city';

export default function DeliveryLocationMenu() {
  const [city, setCity] = useState(CITIES[0]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setCity(saved);
  }, []);

  const select = (value, close) => {
    setCity(value);
    localStorage.setItem(STORAGE_KEY, value);
    close();
  };

  return (
    <DropdownShell
      width={220}
      trigger={({ open, toggle }) => (
        <button type="button" className={`jd-deliver-trigger ${open ? 'is-active' : ''}`} onClick={toggle}>
          <Icon name="mapPin" size={16} />
          <span className="jd-deliver-text">
            <span className="jd-deliver-label">Deliver to</span>
            <span className="jd-deliver-value">{city}</span>
          </span>
          <Icon name="chevronDown" size={13} className={`jd-chevron ${open ? 'is-open' : ''}`} />
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="jd-menu-header"><span>Choose your city</span></div>
          <div className="jd-menu-list">
            {CITIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`jd-menu-row jd-lang-row ${c === city ? 'is-active' : ''}`}
                onClick={() => select(c, close)}
              >
                <span className="jd-menu-row-title">{c}</span>
                {c === city && <span className="jd-lang-check">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </DropdownShell>
  );
}
