import { getTradeCase, logTradeCaseEvent, assignTradeCase } from '../services/tradeCaseService.js';

export async function viewTradeCase(req, res) {
  const result = await getTradeCase(req.params.orderId, req.user);
  if (!result) return res.status(404).json({ error: 'Trade case not found.' });
  if (result.forbidden) return res.status(403).json({ error: 'Not part of this trade case.' });
  res.json(result);
}

export async function addTradeCaseEvent(req, res) {
  const { message, isAdminOnly } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message is required.' });

  const result = await getTradeCase(req.params.orderId, req.user);
  if (!result) return res.status(404).json({ error: 'Trade case not found.' });
  if (result.forbidden) return res.status(403).json({ error: 'Not part of this trade case.' });

  // Only an admin can mark a note admin-only; anyone else's note is visible to both parties.
  const event = await logTradeCaseEvent(req.params.orderId, req.user.id, 'note', message.trim(), req.user.isAdmin && Boolean(isAdminOnly));
  res.status(201).json(event);
}

export async function adminAssignTradeCase(req, res) {
  try {
    const { adminId, logisticsProviderId } = req.body;
    const order = await assignTradeCase(req.params.orderId, { adminId, logisticsProviderId }, req.user.id);
    res.json(order);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to assign trade case.' });
  }
}
