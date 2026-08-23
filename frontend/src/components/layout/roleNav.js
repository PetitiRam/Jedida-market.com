// Central nav map for all 5 role dashboards. Each item's `key` should match
// the existing tab keys already used in SellerDashboard.jsx / DeliveryDashboard.jsx
// etc. wherever a panel already exists, so wiring this in doesn't require
// renaming routes or panels — only replacing the TabBar with a Sidebar/BottomNav
// that reads from this list.

export const ROLE_NAV = {
  seller: [
    { key: 'shop', label: 'Dashboard', icon: 'dashboard' },
    { key: 'products', label: 'Products', icon: 'products' },
    { key: 'orders', label: 'Orders', icon: 'orders' },
    { key: 'customers', label: 'Customers', icon: 'customers' },
    { key: 'growthHub', label: 'Marketing', icon: 'marketing' },
    { key: 'wallet', label: 'Wallet', icon: 'wallet' },
    { key: 'analytics', label: 'Analytics', icon: 'analytics' },
    { key: 'chat', label: 'Messages', icon: 'messages' },
    { key: 'shopSettings', label: 'Store Settings', icon: 'settings' },
  ],
  manufacturer: [
    { key: 'shop', label: 'Dashboard', icon: 'dashboard' },
    { key: 'production', label: 'Production', icon: 'production' },
    { key: 'products', label: 'Products', icon: 'products' },
    { key: 'inventory', label: 'Inventory', icon: 'inventory' },
    { key: 'orders', label: 'Orders', icon: 'orders' },
    { key: 'quality', label: 'Quality Control', icon: 'quality' },
    { key: 'wholesale', label: 'Wholesale', icon: 'wholesale' },
    { key: 'analytics', label: 'Analytics', icon: 'analytics' },
    { key: 'chat', label: 'Messages', icon: 'messages' },
    { key: 'shopSettings', label: 'Settings', icon: 'settings' },
  ],
  supplier: [
    { key: 'shop', label: 'Dashboard', icon: 'dashboard' },
    { key: 'products', label: 'Products', icon: 'products' },
    { key: 'stock', label: 'Stock', icon: 'stock' },
    { key: 'purchaseOrders', label: 'Purchase Orders', icon: 'purchase' },
    { key: 'customers', label: 'Customers', icon: 'customers' },
    { key: 'shipments', label: 'Shipments', icon: 'shipments' },
    { key: 'analytics', label: 'Analytics', icon: 'analytics' },
    { key: 'chat', label: 'Messages', icon: 'messages' },
    { key: 'shopSettings', label: 'Settings', icon: 'settings' },
  ],
  dropshipper: [
    { key: 'shop', label: 'Dashboard', icon: 'dashboard' },
    { key: 'dropshipProducts', label: 'My Imports', icon: 'imports' },
    { key: 'products', label: 'Products', icon: 'products' },
    { key: 'orders', label: 'Orders', icon: 'orders' },
    { key: 'customers', label: 'Customers', icon: 'customers' },
    { key: 'dropshipSales', label: 'Earnings', icon: 'earnings' },
    { key: 'analytics', label: 'Analytics', icon: 'analytics' },
    { key: 'shopSettings', label: 'Settings', icon: 'settings' },
  ],
  delivery: [
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { key: 'deliveries', label: 'Deliveries', icon: 'deliveries' },
    { key: 'routes', label: 'Routes', icon: 'routes' },
    { key: 'earnings', label: 'Earnings', icon: 'earnings' },
    { key: 'performance', label: 'Performance', icon: 'performance' },
    { key: 'chat', label: 'Messages', icon: 'messages' },
    { key: 'profile', label: 'Profile', icon: 'profile' },
    { key: 'settings', label: 'Settings', icon: 'settings' },
  ],
};

// Mobile bottom nav shows only the top 4-5 items + "More" (which opens the
// full sidebar list as a sheet). Keep this to 5 slots max per spec section 11.
export const ROLE_BOTTOM_NAV = {
  seller: ['shop', 'orders', 'products', 'wallet'],
  manufacturer: ['shop', 'production', 'orders', 'inventory'],
  supplier: ['shop', 'stock', 'purchaseOrders', 'shipments'],
  dropshipper: ['shop', 'dropshipProducts', 'orders', 'dropshipSales'],
  delivery: ['dashboard', 'deliveries', 'routes', 'earnings'],
};

export const ROLE_LABEL = {
  seller: 'Seller',
  manufacturer: 'Manufacturer',
  supplier: 'Supplier',
  dropshipper: 'Dropshipper',
  delivery: 'Delivery Partner',
};
