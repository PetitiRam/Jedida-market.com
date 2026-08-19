import { query } from '../config/db.js';
import * as tracking from '../services/trackingService.js';
import { getIO } from '../chat/chatSocket.js';
import { applyPaymentConfirmation } from './ordersController.js';

export async function registerDriver(req, res) {
  const { vehicleType, licensePlate } = req.body;
  const result = await query(
    `INSERT INTO drivers (user_id, vehicle_type, license_plate) VALUES ($1,$2,$3) RETURNING *`,
    [req.user.id, vehicleType || null, licensePlate || null]
  );
  res.status(201).json({ driver: result.rows[0] });
}

export async function myDriverProfile(req, res) {
  const result = await query('SELECT * FROM drivers WHERE user_id = $1', [req.user.id]);
  res.json({ driver: result.rows[0] || null });
}

export async function listDrivers(req, res) {
  const result = await query(`
    SELECT d.*, u.full_name, u.phone_number FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.is_available = TRUE
  `);
  res.json({ drivers: result.rows });
}

export async function createDelivery(req, res) {
  const { orderId, pickupAddress, dropoffAddress } = req.body;
  const delivery = await tracking.createDeliveryForOrder(orderId, { pickupAddress, dropoffAddress });
  res.status(201).json({ delivery });
}

export async function assignDriver(req, res) {
  const { id } = req.params;
  const { driverId } = req.body;
  const result = await query('UPDATE deliveries SET driver_id = $1 WHERE id = $2 RETURNING *', [driverId, id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Delivery not found.' });
  await tracking.updateStatus(id, 'assigned_to_driver', 'Driver assigned by admin.', req.user.id);
  res.json({ message: 'Driver assigned.', delivery: result.rows[0] });
}

export async function updateStatus(req, res) {
  const { id } = req.params;
  const { status, note, lat, lng } = req.body;
  const location = (lat != null && lng != null) ? `${lat},${lng}` : null;
  try {
    const delivery = await tracking.updateStatus(id, status, note, req.user.id, location);
    getIO()?.to(`delivery:${id}`).emit('delivery:status', { delivery, note, location });
    res.json({ message: 'Status updated.', delivery });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// Frequent GPS pings from the driver's device while a delivery is en route.
export async function updateLocation(req, res) {
  const { id } = req.params;
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng must be numbers.' });
  }
  try {
    const delivery = await tracking.updateDriverLocation(id, lat, lng);
    getIO()?.to(`delivery:${id}`).emit('delivery:location', { lat, lng, updatedAt: delivery.location_updated_at });
    res.json({ message: 'Location updated.', delivery });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getTimeline(req, res) {
  const timeline = await tracking.getTimeline(req.params.id);
  res.json({ timeline });
}

export async function getByOrder(req, res) {
  const delivery = await tracking.getByOrderId(req.params.orderId);
  if (!delivery) return res.status(404).json({ error: 'No delivery record for this order yet.' });
  const timeline = await tracking.getTimeline(delivery.id);
  res.json({ delivery, timeline });
}

export async function myDriverDeliveries(req, res) {
  const driverResult = await query('SELECT id FROM drivers WHERE user_id = $1', [req.user.id]);
  if (driverResult.rows.length === 0) return res.json({ deliveries: [] });
  const result = await query('SELECT * FROM deliveries WHERE driver_id = $1 ORDER BY created_at DESC', [driverResult.rows[0].id]);
  res.json({ deliveries: result.rows });
}

// Records the cash handoff for a Cash on Delivery order. This is the ONLY
// place COD moves from 'pending' to 'succeeded' — never at order creation,
// never from the buyer or seller side. Only an admin, or the driver
// actually assigned to this delivery, can call it. Reuses the same
// applyPaymentConfirmation() escrow-crediting path every other payment
// method uses once it's confirmed, so COD orders flow through the rest of
// the (unmodified) order lifecycle identically to a card/mobile-money order.
export async function collectCash(req, res) {
  const { id } = req.params;
  const { collectedAmount } = req.body;

  if (collectedAmount == null || Number.isNaN(Number(collectedAmount))) {
    return res.status(400).json({ error: 'collectedAmount is required.' });
  }

  try {
    const deliveryResult = await query('SELECT * FROM deliveries WHERE id = $1', [id]);
    const delivery = deliveryResult.rows[0];
    if (!delivery) return res.status(404).json({ error: 'Delivery not found.' });

    const isAdmin = !!req.user.is_admin;
    const driverResult = await query('SELECT id FROM drivers WHERE user_id = $1', [req.user.id]);
    const callerDriverId = driverResult.rows[0]?.id || null;
    const isAssignedDriver = !!callerDriverId && callerDriverId === delivery.driver_id;
    if (!isAdmin && !isAssignedDriver) {
      return res.status(403).json({ error: 'Only the assigned driver or an admin can record cash collection.' });
    }
    // cod_collected_by always records the driver on the delivery, even
    // when an admin is the one submitting the collection on their behalf.
    const collectedByDriverId = delivery.driver_id || callerDriverId;

    const paymentResult = await query(
      `SELECT p.* FROM payments p WHERE p.order_id = $1 AND p.method = 'cash_on_delivery'`,
      [delivery.order_id]
    );
    const payment = paymentResult.rows[0];
    if (!payment) return res.status(400).json({ error: 'This delivery is not attached to a Cash on Delivery order.' });
    if (payment.status === 'succeeded') {
      return res.status(409).json({ error: 'Cash has already been recorded as collected for this order.' });
    }

    const expected = delivery.cod_expected_amount != null ? Number(delivery.cod_expected_amount) : Number(payment.amount);
    const collected = Number(collectedAmount);
    const discrepancy = Math.round((collected - expected) * 100) / 100;

    const updated = await query(
      `UPDATE deliveries
       SET cod_collected_amount = $1, cod_collected_at = now(), cod_collected_by = $2, cod_discrepancy = $3
       WHERE id = $4 RETURNING *`,
      [collected, collectedByDriverId, discrepancy, id]
    );

    // Same guarded, idempotent path every other payment method uses to move
    // an order into paid_escrow and credit escrow — see ordersController.js.
    const order = await applyPaymentConfirmation(delivery.order_id, { userId: req.user.id, confirmedVia: 'cod_cash_collected' });

    await tracking.addEvent(id, delivery.status, `Cash collected: ${collected} (expected ${expected}, discrepancy ${discrepancy}).`, req.user.id);

    res.json({ message: 'Cash collection recorded.', delivery: updated.rows[0], order, discrepancy });
  } catch (err) {
    if (err.code === 'ALREADY_PROCESSED') return res.status(409).json({ error: 'This payment has already been confirmed.' });
    console.error('Collect cash error:', err);
    res.status(500).json({ error: 'Could not record cash collection.' });
  }
}

export async function allDeliveries(req, res) {
  const { status, search, page = 1, pageSize = 50 } = req.query;
  const conditions = [];
  const values = [];
  let i = 1;
  if (status) { conditions.push(`de.status = $${i}`); values.push(status); i += 1; }
  if (search) {
    conditions.push(`(de.order_id::text ILIKE $${i} OR u.full_name ILIKE $${i} OR de.dropoff_address ILIKE $${i})`);
    values.push(`%${search}%`);
    i += 1;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Number(pageSize) || 50, 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const [result, countResult] = await Promise.all([
    query(
      `SELECT de.*, u.full_name AS driver_name, u.phone_number AS driver_phone
       FROM deliveries de
       LEFT JOIN drivers d ON d.id = de.driver_id
       LEFT JOIN users u ON u.id = d.user_id
       ${where}
       ORDER BY de.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM deliveries de LEFT JOIN drivers d ON d.id = de.driver_id LEFT JOIN users u ON u.id = d.user_id ${where}`, values),
  ]);
  res.json({ deliveries: result.rows, total: Number(countResult.rows[0].count), page: Number(page), pageSize: limit });
}
