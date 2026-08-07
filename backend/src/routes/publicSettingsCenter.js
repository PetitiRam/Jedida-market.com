import express from 'express';
import { getMaintenanceMode, getLegalDocumentsMeta } from '../services/LegalAndSystemService.js';
import { query } from '../config/db.js';

const router = express.Router();

router.get('/maintenance', async (req, res) => {
  const maintenance = await getMaintenanceMode();
  res.json({ maintenance });
});

// Public Legal Center index — every Buyer, Seller, Delivery Partner, or
// visitor can browse the full policy list without authenticating.
router.get('/legal', async (req, res) => {
  try {
    const documents = await getLegalDocumentsMeta();
    res.json({ documents });
  } catch (err) {
    console.error('Legal Center index error:', err);
    res.status(500).json({ error: 'Could not load the Legal Center.' });
  }
});

router.get('/announcement', async (req, res) => {
  const result = await query('SELECT notification_settings FROM platform_settings WHERE id = 1');
  const settings = result.rows[0]?.notification_settings || {};
  res.json({
    announcementBanner: settings.announcementBanner || '',
    maintenanceNotice: settings.maintenanceNotice || ''
  });
});

router.get('/legal/:docType', async (req, res) => {
  const { getLegalDocument } = await import('../services/LegalAndSystemService.js');
  try {
    const doc = await getLegalDocument(req.params.docType);
    res.json({ document: doc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
