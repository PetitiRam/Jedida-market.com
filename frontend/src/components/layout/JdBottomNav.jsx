import React, { useState } from 'react';
import JdIcon from './JdIcons';
import { ROLE_NAV, ROLE_BOTTOM_NAV } from './roleNav';
import './jd-shell.css';

export default function JdBottomNav({ role, items, activeTab, onSelect }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const allItems = items || ROLE_NAV[role] || ROLE_NAV.seller;
  const primaryKeys = ROLE_BOTTOM_NAV[role] || allItems.slice(0, 4).map((i) => i.key);
  const primaryItems = primaryKeys
    .map((k) => allItems.find((i) => i.key === k))
    .filter(Boolean);
  const overflowItems = allItems.filter((i) => !primaryKeys.includes(i.key));

  return (
    <>
      <nav className="jd-bottomnav" data-role={role}>
        {primaryItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`jd-bottomnav-item ${activeTab === item.key ? 'active' : ''}`}
            onClick={() => onSelect(item.key)}
          >
            <JdIcon name={item.icon} size={20} />
            <span>{item.label}</span>
          </button>
        ))}
        {overflowItems.length > 0 && (
          <button
            type="button"
            className={`jd-bottomnav-item ${moreOpen ? 'active' : ''}`}
            onClick={() => setMoreOpen(true)}
          >
            <JdIcon name="more" size={20} />
            <span>More</span>
          </button>
        )}
      </nav>

      {moreOpen && overflowItems.length > 0 && (
        <div className="jd-more-sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="jd-more-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="jd-more-sheet-handle" />
            <div className="jd-more-sheet-grid">
              {overflowItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`jd-more-sheet-item ${activeTab === item.key ? 'active' : ''}`}
                  onClick={() => { onSelect(item.key); setMoreOpen(false); }}
                >
                  <JdIcon name={item.icon} size={20} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
