// Presentation metadata for admin sub-roles, used only by the Roles &
// Permissions console (GET /admin/roles/definitions). Access control itself
// is entirely driven by ADMIN_ROLE_PERMISSIONS in middleware/auth.js — this
// file never grants or restricts anything, it only supplies copy so the
// frontend doesn't hardcode role labels/descriptions/risk tiers.

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  staff: 'Staff',
  moderator: 'Moderator',
  support: 'Support',
  finance: 'Finance',
  marketing: 'Marketing',
  approvals: 'Approvals',
  ai_manager: 'AI Manager',
  chat_assistant: 'Chat Assistant',
  business_rep: 'Business Representative',
  security_agent: 'Security Agent',
};

export const ROLE_DESCRIPTIONS = {
  super_admin: 'Full, unrestricted access to every area of the platform.',
  staff: 'Handles day-to-day order fulfilment: orders, delivery, products.',
  moderator: 'Reviews listings, shops and user accounts for policy compliance.',
  support: 'Front-line customer support: chat and user accounts.',
  finance: 'Wallets, withdrawals, payments, order payouts, affiliates, disputes.',
  marketing: 'Ads, campaigns and marketplace merchandising.',
  approvals: 'Approves products, shops, role upgrades, withdrawals, partners and affiliates.',
  ai_manager: 'Manages the AI assistant and AI-driven tooling.',
  chat_assistant: 'Handles buyer/seller chat only.',
  business_rep: 'Handles manufacturer/supplier/seller escalations routed from the AI assistant.',
  security_agent: 'Handles fraud, account-abuse and policy-violation escalations.',
};

// Risk tier is derived from how broad/sensitive a role's areas are — used
// only to sort/flag roles in the console, never to grant access.
export const ROLE_RISK = {
  super_admin: 'critical',
  finance: 'high',
  approvals: 'high',
  security_agent: 'high',
  moderator: 'medium',
  staff: 'medium',
  marketing: 'medium',
  ai_manager: 'medium',
  business_rep: 'medium',
  support: 'low',
  chat_assistant: 'low',
};

export const AREA_LABELS = {
  '*': 'Everything',
  orders: 'Orders',
  delivery: 'Delivery',
  products: 'Products',
  shops: 'Shops',
  users: 'Users',
  chat: 'Chat',
  wallets: 'Wallets',
  withdrawals: 'Withdrawals',
  payments: 'Payments',
  affiliates: 'Affiliates',
  disputes: 'Disputes',
  ai_handler: 'AI Handler',
  ads: 'Ads',
  campaigns: 'Campaigns',
  marketplace: 'Marketplace',
  upgrades: 'Role Upgrades',
  partners: 'Partners',
  representatives: 'Representatives',
  developer_platform: 'Developer Platform',
  ai: 'AI Command Center',
  fraud: 'Fraud Signals',
  security: 'Security',
};
