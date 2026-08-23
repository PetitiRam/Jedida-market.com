/* Small hand-rolled line-icon set so the redesign doesn't require adding
   lucide-react / heroicons as a new dependency. Swap for lucide-react later
   by find-replacing <JdIcon name="x" /> usages if the team prefers a full
   library — the call sites below already isolate that decision. */
import React from 'react';

const PATHS = {
  dashboard: 'M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h8v8H3v-8zm10-3h8v11h-8V10z',
  products: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  orders: 'M4 4h16v4H4V4zm0 6h16v10H4V10zm4 3h8',
  customers: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  marketing: 'M3 11l18-7-7 18-2-8-9-3z',
  wallet: 'M3 7h18v12H3V7zm0 0l2-3h14l2 3M16 13h2',
  analytics: 'M4 20V10m6 10V4m6 16v-7',
  messages: 'M4 4h16v12H8l-4 4V4z',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.3l2-1.6-2-3.4-2.4 1a7 7 0 00-2.2-1.3L14 2h-4l-.3 2.4a7 7 0 00-2.2 1.3l-2.4-1-2 3.4 2 1.6A7 7 0 005 12c0 .4 0 .9.1 1.3l-2 1.6 2 3.4 2.4-1a7 7 0 002.2 1.3L10 22h4l.3-2.4a7 7 0 002.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z',
  production: 'M3 21V9l6 4V9l6 4V9l6 12H3z',
  inventory: 'M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4',
  quality: 'M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  wholesale: 'M3 21V8l9-5 9 5v13M9 21v-6h6v6',
  stock: 'M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z',
  purchase: 'M6 6h15l-1.5 9h-12L4 3H2m6 18a1 1 0 100-2 1 1 0 000 2zm10 0a1 1 0 100-2 1 1 0 000 2z',
  shipments: 'M3 7h11v8H3V7zm11 3h4l3 3v2h-7v-5zM6 18a2 2 0 100-4 2 2 0 000 4zm12 0a2 2 0 100-4 2 2 0 000 4z',
  imports: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v3a1 1 0 001 1h14a1 1 0 001-1v-3',
  earnings: 'M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  deliveries: 'M3 7h11v8H3V7zm11 3h4l3 3v2h-7v-5zM6 18a2 2 0 100-4 2 2 0 000 4zm12 0a2 2 0 100-4 2 2 0 000 4z',
  routes: 'M9 20l-5-2V6l5 2 6-2 5 2v12l-5-2-6 2zM9 8v12M15 6v12',
  performance: 'M4 20V10m6 10V4m6 16v-7',
  profile: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.3-4.3',
  bell: 'M6 8a6 6 0 1112 0c0 4 1.5 5 1.5 6H4.5C4.5 13 6 12 6 8zM10 20a2 2 0 004 0',
  help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9a2.5 2.5 0 015 0c0 1.5-2 1.5-2.5 3M12 17h.01',
  chevronDown: 'M6 9l6 6 6-6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
};

export default function JdIcon({ name, size = 18, strokeWidth = 1.8, className = '' }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      className={`jd-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
