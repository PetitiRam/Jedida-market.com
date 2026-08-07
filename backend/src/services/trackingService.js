import { query } from '../config/db.js';

export const STATUS_FLOW = [
  'pending', 'confirmed', 'processing', 'packed', 'assigned_to_driver',
  'out_for_delivery', 'delivered', 'failed_delivery', 'returned'
];

export async function createDeliveryForOrder(orderId, { pickupAddress, dropoffAddress } = {}) {
  const result = await query(
    `INSERT INTO deliveries (order_id, pickup_address, dropoff_address) VALUES ($1,$2,$3) RETURNING *`,
    [orderId, pickupAddress || null, dropoffAddress || null]
  );
  await addEvent(result.rows[0].id, 'pending', 'Delivery record created.');
  return result.rows[0];
}

export async function addEvent(deliveryId, status, note, createdBy = null, location = null) {
  const result = await query(
    `INSERT INTO tracking_events (delivery_id, status, note, created_by, location) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [deliveryId, status, note || null, createdBy, location]
  );
  return result.rows[0];
}

export async function updateStatus(deliveryId, status, note, createdBy = null, location = null) {
  if (!STATUS_FLOW.includes(status)) throw new Error('Invalid delivery status.');
  const result = await query(
    `UPDATE deliveries SET status = $1, delivered_at = CASE WHEN $1 = 'delivered' THEN now() ELSE delivered_at END
     WHERE id = $2 RETURNING *`,
    [status, deliveryId]
  );
  if (result.rows.length === 0) throw new Error('Delivery not found.');
  await addEvent(deliveryId, status, note, createdBy, location);
  return result.rows[0];
}

// High-frequency GPS pings while a driver is en route — kept separate from
// the status timeline (an append-only event log isn't the right place for
// a ping every few seconds).
export async function updateDriverLocation(deliveryId, lat, lng) {
  const result = await query(
    `UPDATE deliveries SET current_lat = $1, current_lng = $2, location_updated_at = now()
     WHERE id = $3 RETURNING *`,
    [lat, lng, deliveryId]
  );
  if (result.rows.length === 0) throw new Error('Delivery not found.');
  return result.rows[0];
}

export async function getTimeline(deliveryId) {
  const result = await query('SELECT * FROM tracking_events WHERE delivery_id = $1 ORDER BY created_at ASC', [deliveryId]);
  return result.rows;
}

export async function getByOrderId(orderId) {
  const result = await query('SELECT * FROM deliveries WHERE order_id = $1', [orderId]);
  return result.rows[0] || null;
}
