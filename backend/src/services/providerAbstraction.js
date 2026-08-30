// JEDIDA payment provider abstraction — phase 95.
//
// Wraps the existing services/paymentProviders.js ADAPTERS (unchanged —
// still the only place that actually talks to Stripe/PesaJet/etc.) with
// a provider/method catalog so:
//   - a seller can connect a provider (existing seller_provider_connections,
//     phase 83) and then see + enable its individual real methods
//     (provider_methods, phase 95) instead of one flat provider = method
//   - checkout/POS can ask "what can this shop actually accept right now"
//     and get real, seller-configured methods back — never a hard-coded
//     list (spec #8, #35)
//   - every adapter call goes through one normalized shape regardless of
//     provider (spec #12): providerTransactionId, providerReference,
//     amount, currency, status, failureReason, raw
//
// This does not change how createOrder() in ordersController.js resolves
// a payment method today (METHOD_PROVIDER_CODE/ADAPTERS lookup) — that
// flow is careful, idempotency-sensitive, and out of scope to touch in
// this pass. initiatePayment() here is the entry point the checkout
// redesign (next phase) and POS will call instead.

import { query } from '../config/db.js';
import { ADAPTERS } from './paymentProviders.js';

/**
 * Full nested catalog for one shop: every active payment provider,
 * whether this shop has connected it, and each of its methods with this
 * shop's activation state. This is what the Seller Payments page (spec
 * #45) renders.
 */
export async function listProviderCatalogForShop(shopId) {
  const providersResult = await query(
    `SELECT id, code, name, description, status FROM provider_registry
     WHERE category = 'payment' AND status = 'active' ORDER BY name`
  );

  const connectionsResult = await query(
    `SELECT provider_id, status, destination, connected_at FROM seller_provider_connections WHERE shop_id = $1`,
    [shopId]
  );
  const connectionByProvider = new Map(connectionsResult.rows.map((c) => [c.provider_id, c]));

  const methodsResult = await query(
    `SELECT pm.*, spma.active AS shop_active, spma.activated_at
     FROM provider_methods pm
     LEFT JOIN seller_provider_method_activations spma
       ON spma.provider_method_id = pm.id AND spma.shop_id = $1
     WHERE pm.is_active = TRUE
     ORDER BY pm.display_order, pm.name`,
    [shopId]
  );
  const methodsByProvider = new Map();
  for (const m of methodsResult.rows) {
    if (!methodsByProvider.has(m.provider_id)) methodsByProvider.set(m.provider_id, []);
    methodsByProvider.get(m.provider_id).push({
      id: m.id,
      code: m.code,
      name: m.name,
      active: Boolean(m.shop_active),
      activatedAt: m.activated_at,
      requiresFields: m.requires_fields,
    });
  }

  return providersResult.rows.map((p) => {
    const connection = connectionByProvider.get(p.id);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      connected: connection?.status === 'connected',
      destination: connection?.destination || null,
      connectedAt: connection?.connected_at || null,
      methods: methodsByProvider.get(p.id) || [],
    };
  });
}

/**
 * Flat list of methods this shop can actually accept right now — the
 * dynamic source checkout/POS read instead of a hard-coded list.
 * Requires BOTH the provider connected AND the specific method active.
 */
export async function getSellerEnabledMethods(shopId) {
  const result = await query(
    `SELECT pm.id, pm.code, pm.name, pm.adapter_key, pm.adapter_params, pm.requires_fields,
            pr.code AS provider_code, pr.name AS provider_name
     FROM seller_provider_method_activations spma
     JOIN provider_methods pm ON pm.id = spma.provider_method_id AND pm.is_active = TRUE
     JOIN provider_registry pr ON pr.id = pm.provider_id AND pr.status = 'active'
     JOIN seller_provider_connections spc ON spc.provider_id = pr.id AND spc.shop_id = spma.shop_id AND spc.status = 'connected'
     WHERE spma.shop_id = $1 AND spma.active = TRUE
     ORDER BY pm.display_order, pm.name`,
    [shopId]
  );
  return result.rows;
}

async function requireConnectedMethod(shopId, providerMethodId) {
  const result = await query(
    `SELECT pm.*, pr.id AS provider_id, spc.status AS connection_status
     FROM provider_methods pm
     JOIN provider_registry pr ON pr.id = pm.provider_id
     LEFT JOIN seller_provider_connections spc ON spc.provider_id = pr.id AND spc.shop_id = $2
     WHERE pm.id = $1`,
    [providerMethodId, shopId]
  );
  const method = result.rows[0];
  if (!method) { const err = new Error('METHOD_NOT_FOUND'); err.code = 'METHOD_NOT_FOUND'; throw err; }
  if (method.connection_status !== 'connected') {
    const err = new Error('PROVIDER_NOT_CONNECTED');
    err.code = 'PROVIDER_NOT_CONNECTED';
    err.message = 'Connect this method\'s provider before enabling it.';
    throw err;
  }
  return method;
}

/** Seller enables one specific method of an already-connected provider. */
export async function activateMethodForShop(shopId, providerMethodId) {
  await requireConnectedMethod(shopId, providerMethodId);
  const result = await query(
    `INSERT INTO seller_provider_method_activations (shop_id, provider_method_id, active, activated_at)
     VALUES ($1,$2,TRUE,now())
     ON CONFLICT (shop_id, provider_method_id)
     DO UPDATE SET active = TRUE, activated_at = now(), deactivated_at = NULL, updated_at = now()
     RETURNING *`,
    [shopId, providerMethodId]
  );
  return result.rows[0];
}

/** Seller disables one method without disconnecting the whole provider. */
export async function deactivateMethodForShop(shopId, providerMethodId) {
  const result = await query(
    `UPDATE seller_provider_method_activations SET active = FALSE, deactivated_at = now(), updated_at = now()
     WHERE shop_id = $1 AND provider_method_id = $2 RETURNING *`,
    [shopId, providerMethodId]
  );
  if (result.rows.length === 0) {
    const err = new Error('NOT_ACTIVATED'); err.code = 'NOT_ACTIVATED'; throw err;
  }
  return result.rows[0];
}

/**
 * Deposits and other user->platform payments (not user->seller) have no
 * shop to scope against — initiatePayment() above requires shop-level
 * activation, which doesn't apply here. This looks up any globally
 * active provider_methods row directly (provider connected at the
 * registry level, not per-seller) and calls the same normalized adapter
 * path.
 */
export async function initiatePlatformPayment({ methodCode, amount, currency, orderId, returnUrl, fields = {} }) {
  const result = await query(
    `SELECT pm.*, pr.code AS provider_code, pr.name AS provider_name
     FROM provider_methods pm
     JOIN provider_registry pr ON pr.id = pm.provider_id AND pr.status = 'active'
     WHERE pm.code = $1 AND pm.is_active = TRUE`,
    [methodCode]
  );
  const method = result.rows[0];
  if (!method) {
    const err = new Error('METHOD_NOT_ENABLED');
    err.code = 'METHOD_NOT_ENABLED';
    err.message = 'This payment method is not available.';
    throw err;
  }

  const missing = (method.requires_fields || []).filter((f) => !fields[f]);
  if (missing.length > 0) {
    const err = new Error('MISSING_FIELDS');
    err.code = 'MISSING_FIELDS';
    err.message = `Missing required field(s) for ${method.name}: ${missing.join(', ')}`;
    throw err;
  }

  const adapter = ADAPTERS[method.adapter_key];
  if (!adapter) {
    const err = new Error('ADAPTER_NOT_IMPLEMENTED');
    err.code = 'ADAPTER_NOT_IMPLEMENTED';
    throw err;
  }

  const raw = await adapter({ amount, currency, orderId, returnUrl, ...(method.adapter_params || {}), ...fields });

  return {
    providerCode: method.provider_code,
    providerName: method.provider_name,
    methodCode: method.code,
    methodName: method.name,
    providerTransactionId: raw.providerReference || null,
    providerReference: raw.providerReference || null,
    checkoutUrl: raw.checkoutUrl || null,
    amount,
    currency,
    status: 'pending',
    failureReason: null,
    raw: raw.raw,
  };
}
// Normalized payment initiation for a shop-scoped (seller) charge — the
// one call site checkout/POS use regardless of provider. Merges the
// method's fixed adapter_params (e.g. PesaJet's network:'mtn') with
// caller-supplied fields (e.g. phoneNumber), calls the matching
// ADAPTERS[adapter_key], and returns a shape that's the same no matter
// which provider handled it. Throws METHOD_NOT_ENABLED if the shop
// hasn't activated this exact method — never silently falls back to a
// different provider. For a payment that isn't to a seller (e.g. a
// wallet deposit), see initiatePlatformPayment() above instead.
export async function initiatePayment({ shopId, methodCode, amount, currency, orderId, returnUrl, fields = {} }) {
  const enabled = await getSellerEnabledMethods(shopId);
  const method = enabled.find((m) => m.code === methodCode);
  if (!method) {
    const err = new Error('METHOD_NOT_ENABLED');
    err.code = 'METHOD_NOT_ENABLED';
    err.message = 'This shop has not enabled that payment method.';
    throw err;
  }

  const missing = (method.requires_fields || []).filter((f) => !fields[f]);
  if (missing.length > 0) {
    const err = new Error('MISSING_FIELDS');
    err.code = 'MISSING_FIELDS';
    err.message = `Missing required field(s) for ${method.name}: ${missing.join(', ')}`;
    throw err;
  }

  const adapter = ADAPTERS[method.adapter_key];
  if (!adapter) {
    const err = new Error('ADAPTER_NOT_IMPLEMENTED');
    err.code = 'ADAPTER_NOT_IMPLEMENTED';
    throw err;
  }

  const initiatedAt = new Date().toISOString();
  const raw = await adapter({
    amount, currency, orderId, returnUrl,
    ...(method.adapter_params || {}),
    ...fields,
  });

  return {
    providerCode: method.provider_code,
    providerName: method.provider_name,
    methodCode: method.code,
    methodName: method.name,
    providerTransactionId: raw.providerReference || null,
    providerReference: raw.providerReference || null,
    checkoutUrl: raw.checkoutUrl || null,
    amount,
    currency,
    status: 'pending',
    initiatedAt,
    failureReason: null,
    raw: raw.raw,
  };
}
