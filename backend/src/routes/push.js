import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { registerDeviceToken, unregisterDeviceToken } from '../services/pushService.js';
import { query } from '../config/db.js';

const router = express.Router();

// Called once the native shell has a device token (see
// jedidaNativeBridge.registerPush + native/pushNotifications.js on the
// frontend). Safe to call repeatedly — same token just refreshes last_seen_at.
router.post('/register', requireAuth, async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token || !['ios', 'android', 'web'].includes(platform)) {
      return res.status(400).json({ error: 'token and a valid platform (ios/android/web) are required.' });
    }
    const device = await registerDeviceToken({ userId: req.user.id, token, platform });
    res.json({ device });
  } catch (err) {
    console.error('push register error:', err.message);
    res.status(500).json({ error: 'Could not register device for push notifications.' });
  }
});

// Called on logout so a signed-out device stops receiving another
// account's notifications.
router.delete('/register', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required.' });
    await unregisterDeviceToken({ userId: req.user.id, token });
    res.json({ success: true });
  } catch (err) {
    console.error('push unregister error:', err.message);
    res.status(500).json({ error: 'Could not unregister device.' });
  }
});

// Settings > Notifications toggle for chat push specifically.
router.put('/preferences', requireAuth, async (req, res) => {
  try {
    const { chatPushEnabled } = req.body;
    await query('UPDATE users SET chat_push_enabled = $1 WHERE id = $2', [Boolean(chatPushEnabled), req.user.id]);
    res.json({ success: true, chatPushEnabled: Boolean(chatPushEnabled) });
  } catch (err) {
    console.error('push preferences error:', err.message);
    res.status(500).json({ error: 'Could not update push preferences.' });
  }
});

export default router;
