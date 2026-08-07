import * as settingsService from '../services/settingsService.js';
import * as legalSystem from '../services/LegalAndSystemService.js';

export async function getSection(req, res) {
  try {
    const value = await settingsService.getSection(req.params.section);
    res.json({ section: req.params.section, value });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// Public — the buyer-facing payment method selector needs to know which
// methods are actually enabled, without needing admin access to the rest
// of the payment settings.
export async function getPublicPaymentSettings(req, res) {
  try {
    const value = await settingsService.getSection('payment');
    res.json({
      enableMobileMoney: !!value.enableMobileMoney,
      enableBankTransfer: !!value.enableBankTransfer,
      enableCash: !!value.enableCash,
      enableCardPayments: !!value.enableCardPayments,
      mobileMoneyNumber: value.mobileMoneyNumber || null,
      bankName: value.bankName || null,
      bankAccount: value.bankAccount || null,
      accountName: value.accountName || null,
      paymentInstructions: value.paymentInstructions || null,
    });
  } catch (err) {
    res.status(400).json({ error: 'Could not load payment methods.' });
  }
}

export async function updateSection(req, res) {
  try {
    const value = await settingsService.updateSection(req.params.section, req.body, req.user.id);
    res.json({ message: `${req.params.section} settings updated.`, section: req.params.section, value });
  } catch (err) {
    console.error('Update settings section error:', err);
    res.status(400).json({ error: err.message || 'Could not update settings.' });
  }
}

export async function getAllSettings(req, res) {
  try {
    const settings = await settingsService.getAllSettings();
    res.json({ settings });
  } catch (err) {
    console.error('Get all settings error:', err);
    res.status(500).json({ error: 'Could not load settings.' });
  }
}

export async function updateIdentity(req, res) {
  try {
    const settings = await settingsService.updateIdentity(req.body, req.user.id);
    res.json({ message: 'Platform identity updated.', settings });
  } catch (err) {
    console.error('Update identity error:', err);
    res.status(400).json({ error: 'Could not update platform identity.' });
  }
}

export async function updateBranding(req, res) {
  try {
    const settings = await settingsService.updateBranding(req.body, req.user.id);
    res.json({ message: 'Branding updated.', settings });
  } catch (err) {
    console.error('Update branding error:', err);
    res.status(400).json({ error: 'Could not update branding.' });
  }
}

export async function getAuditLog(req, res) {
  try {
    const logs = await settingsService.getAuditLog(req.query.section, Number(req.query.limit) || 50);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Could not load audit log.' });
  }
}

export async function listLegalDocuments(req, res) {
  const documents = await legalSystem.getLegalDocumentsMeta();
  res.json({ documents });
}

export async function getLegalDocument(req, res) {
  try {
    const doc = await legalSystem.getLegalDocument(req.params.docType);
    res.json({ document: doc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function updateLegalDocument(req, res) {
  const { contentMd } = req.body;
  if (contentMd === undefined) return res.status(400).json({ error: 'contentMd is required.' });
  try {
    const doc = await legalSystem.updateLegalDocument(req.params.docType, contentMd, req.user.id);
    res.status(201).json({ message: 'Document updated (new version created).', document: doc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getSystemInfo(req, res) {
  try {
    const info = await legalSystem.getSystemInfo();
    res.json({ info });
  } catch (err) {
    console.error('Get system info error:', err);
    res.status(500).json({ error: 'Could not load system info.' });
  }
}

export async function createBackup(req, res) {
  try {
    const result = await legalSystem.createBackup(req.user.id);
    res.status(201).json({ message: 'Backup created successfully.', ...result });
  } catch (err) {
    console.error('Create backup error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function listBackups(req, res) {
  const backups = await legalSystem.listBackups();
  res.json({ backups });
}

export async function restoreBackup(req, res) {
  const { filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'filePath is required.' });
  try {
    const result = await legalSystem.restoreBackup(filePath, req.user.id);
    res.json({ message: 'Database restored successfully.', ...result });
  } catch (err) {
    console.error('Restore backup error:', err);
    res.status(500).json({ error: err.message });
  }
}
