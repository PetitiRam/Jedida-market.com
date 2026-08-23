import React from 'react';
import JdIcon from './JdIcons';

/**
 * <JdKpiCard label="Total Sales" value="UGX 12,456,000" delta={18.6} icon="wallet" />
 * `delta` is a signed percentage number; pass null/undefined to hide it.
 */
export default function JdKpiCard({ label, value, delta, deltaLabel = 'vs last period', icon, loading }) {
  if (loading) {
    return (
      <div className="jd-card jd-kpi-card">
        <div className="jd-skeleton" style={{ width: '60%', height: 12 }} />
        <div className="jd-skeleton" style={{ width: '80%', height: 26, marginTop: 6 }} />
        <div className="jd-skeleton" style={{ width: '40%', height: 10, marginTop: 6 }} />
      </div>
    );
  }
  const up = typeof delta === 'number' && delta >= 0;
  return (
    <div className="jd-card jd-kpi-card">
      <span className="jd-kpi-label">
        {icon && <JdIcon name={icon} size={15} />}
        {label}
      </span>
      <span className="jd-kpi-value">{value}</span>
      {typeof delta === 'number' && (
        <span className={`jd-kpi-delta ${up ? 'up' : 'down'}`}>
          <JdIcon name={up ? 'arrowUp' : 'arrowDown'} size={12} />
          {Math.abs(delta)}% {deltaLabel}
        </span>
      )}
    </div>
  );
}
