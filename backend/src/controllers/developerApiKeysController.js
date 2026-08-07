import * as svc from '../services/developerApiKeysService.js';
import * as developerPlatformService from '../services/developerPlatformService.js';

function handleError(res, err, fallbackMessage) {
  if (err.code === 'BAD_REQUEST') return res.status(400).json({ error: err.message });
  if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
  console.error(fallbackMessage, err);
  return res.status(500).json({ error: fallbackMessage });
}

// Every endpoint here needs a developer profile to act as — resolve it once
// and 403 up front rather than repeating the check in every handler.
async function requireDeveloperProfile(req, res) {
  const profile = await developerPlatformService.getMyDeveloperProfile(req.user.id);
  if (!profile) {
    res.status(403).json({ error: 'You need a developer profile before managing API keys, apps, or sandbox data.' });
    return null;
  }
  return profile;
}

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------
export async function listApiKeys(req, res) {
  try {
    const profile = await requireDeveloperProfile(req, res);
    if (!profile) return;
    res.json({ keys: await svc.listApiKeys(profile) });
  } catch (err) {
    handleError(res, err, 'Failed to load your API keys.');
  }
}

export async function createApiKey(req, res) {
  try {
    const profile = await requireDeveloperProfile(req, res);
    if (!profile) return;
    const key = await svc.createApiKey(profile, req.body);
    res.status(201).json({
      key,
      message: 'Save this key now — the full secret is only shown once and cannot be retrieved again.',
    });
  } catch (err) {
    handleError(res, err, 'Failed to create the API key.');
  }
}

export async function revokeApiKey(req, res) {
  try {
    const profile = await requireDeveloperProfile(req, res);
    if (!profile) return;
    const key = await svc.revokeApiKey(profile, req.params.id, req.body?.reason);
    res.json({ key });
  } catch (err) {
    handleError(res, err, 'Failed to revoke the API key.');
  }
}

// ---------------------------------------------------------------------------
// OAuth Applications
// ---------------------------------------------------------------------------
export async function listOAuthApps(req, res) {
  try {
    const profile = await requireDeveloperProfile(req, res);
    if (!profile) return;
    res.json({ applications: await svc.listOAuthApps(profile) });
  } catch (err) {
    handleError(res, err, 'Failed to load your OAuth applications.');
  }
}

export async function createOAuthApp(req, res) {
  try {
    const profile = await requireDeveloperProfile(req, res);
    if (!profile) return;
    const app = await svc.createOAuthApp(profile, req.body);
    res.status(201).json({
      application: app,
      message: 'Save the client secret now — it is only shown once and cannot be retrieved again.',
    });
  } catch (err) {
    handleError(res, err, 'Failed to create the OAuth application.');
  }
}

export async function suspendOAuthApp(req, res) {
  try {
    const profile = await requireDeveloperProfile(req, res);
    if (!profile) return;
    const app = await svc.suspendOAuthApp(profile, req.params.id);
    res.json({ application: app });
  } catch (err) {
    handleError(res, err, 'Failed to suspend the OAuth application.');
  }
}

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------
export async function listSandboxResources(req, res) {
  try {
    const profile = await requireDeveloperProfile(req, res);
    if (!profile) return;
    res.json({ resources: await svc.listSandboxResources(profile, req.query.type) });
  } catch (err) {
    handleError(res, err, 'Failed to load sandbox data.');
  }
}

export async function createSandboxResource(req, res) {
  try {
    const profile = await requireDeveloperProfile(req, res);
    if (!profile) return;
    const resource = await svc.createSandboxResource(profile, req.body);
    res.status(201).json({ resource });
  } catch (err) {
    handleError(res, err, 'Failed to create the sandbox resource.');
  }
}

export async function resetSandbox(req, res) {
  try {
    const profile = await requireDeveloperProfile(req, res);
    if (!profile) return;
    const result = await svc.resetSandbox(profile, req.body?.orgId);
    res.json(result);
  } catch (err) {
    handleError(res, err, 'Failed to reset the sandbox.');
  }
}

export function listResourceTypes(req, res) {
  res.json({ resourceTypes: svc.RESOURCE_TYPES });
}
