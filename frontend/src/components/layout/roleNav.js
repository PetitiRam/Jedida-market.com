// Central nav map for all 5 role dashboards. Each item's `key` should match
// the existing tab keys already used in SellerDashboard.jsx / DeliveryDashboard.jsx
// etc. wherever a panel already exists, so wiring this in doesn't require
// renaming routes or panels — only replacing the TabBar with a Sidebar/BottomNav
// that reads from this list.
//
// seller/manufacturer/supplier/dropshipper all share SellerDashboard.jsx,
// which computes its own per-role tab list (navItemsForRole, including the
// dynamic B2B/dropshipper tabs like Sourcing, Trade Hub, Dropship Products)
// and passes it to <JdDashboardShell items={...} />. JdSidebar/JdBottomNav
// use that `items` list when given one — the entries below are only the
// fallback for a caller that doesn't pass `items` (currently: delivery),
// so they're kept to each role's fixed baseline tabs that always exist,
// not the full dynamic set.

export const ROLE_NAV = {
  seller: [
    { key: 'shop', label: 'Dashboard', icon: 'dashboard' },
    { key: 'products', label: 'Products', icon: 'products' },
    { key: 'orders', label: 'Orders', icon: 'orders' },
    { key: 'growthHub', label: 'Marketing', icon: 'marketing' },
    { key: 'wallet', label: 'Wallet', icon: 'wallet' },
    { key: 'chat', label: 'Messages', icon: 'messages' },
    { key: 'shopSettings', label: 'Store Settings', icon: 'settings' },
  ],
  manufacturer: [
    { key: 'shop', label: 'Dashboard', icon: 'dashboard' },
    { key: 'products', label: 'Products', icon: 'products' },
    { key: 'orders', label: 'Orders', icon: 'orders' },
    { key: 'businessAnalytics', label: 'Analytics', icon: 'analytics' },
    { key: 'wallet', label: 'Wallet', icon: 'wallet' },
    { key: 'chat', label: 'Messages', icon: 'messages' },
    { key: 'shopSettings', label: 'Settings', icon: 'settings' },
  ],
  supplier: [
    { key: 'shop', label: 'Dashboard', icon: 'dashboard' },
    { key: 'products', label: 'Products', icon: 'products' },
    { key: 'orders', label: 'Orders', icon: 'orders' },
    { key: 'businessAnalytics', label: 'Analytics', icon: 'analytics' },
    { key: 'wallet', label: 'Wallet', icon: 'wallet' },
    { key: 'chat', label: 'Messages', icon: 'messages' },
    { key: 'shopSettings', label: 'Settings', icon: 'settings' },
  ],
  dropshipper: [
    { key: 'shop', label: 'Dashboard', icon: 'dashboard' },
    { key: 'dropshipProducts', label: 'My Imports', icon: 'imports' },
    { key: 'orders', label: 'Orders', icon: 'orders' },
    { key: 'dropshipSales', label: 'Earnings', icon: 'earnings' },
    { key: 'wallet', label: 'Wallet', icon: 'wallet' },
    { key: 'chat', label: 'Messages', icon: 'messages' },
    { key: 'shopSettings', label: 'Settings', icon: 'settings' },
  ],
  // Delivery's web dashboard is intentionally the minimal 3-panel version
  // today (DeliveryDashboard.jsx) — keep this list matching exactly what
  // exists so the sidebar/bottom nav never points at an empty panel. The
  // richer field-ops build (routes, earnings, performance) lives in the
  // separate native DriverDashboard for now; expand this list if/when that
  // functionality moves into the shared web dashboard too.
  delivery: [
    { key: 'orders', label: 'Assigned Deliveries', icon: 'deliveries' },
    { key: 'wallet', label: 'Wallet', icon: 'wallet' },
    { key: 'chat', label: 'Chat with Admin', icon: 'messages' },
  ],
};

// Mobile bottom nav shows only the top 4-5 items + "More" (which opens the
// full sidebar list as a sheet). Keep this to 5 slots max per spec section 11.
// Keys must exist in whatever list actually renders for that role — for
// seller/manufacturer/supplier/dropshipper that's the dynamic `items` list
// SellerDashboard.jsx passes in, not the ROLE_NAV fallback above, so these
// stick to keys that are present in every one of those roles' tab sets.
export const ROLE_BOTTOM_NAV = {
  seller: ['shop', 'orders', 'products', 'wallet'],
  manufacturer: ['shop', 'orders', 'products', 'wallet'],
  supplier: ['shop', 'orders', 'products', 'wallet'],
  dropshipper: ['shop', 'dropshipProducts', 'orders', 'dropshipSales'],
  delivery: ['orders', 'wallet', 'chat'],
};

export const ROLE_LABEL = {
  seller: 'Seller',
  manufacturer: 'Manufacturer',
  supplier: 'Supplier',
  dropshipper: 'Dropshipper',
  delivery: 'Delivery Partner',
};
