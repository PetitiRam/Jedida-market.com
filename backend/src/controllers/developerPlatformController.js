import * as developerPlatformService from '../services/developerPlatformService.js';

function handleError(res, err, fallbackMessage) {
  if (err.code === 'BAD_REQUEST') return res.status(400).json({ error: err.message });
  if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
  console.error(fallbackMessage, err);
  return res.status(500).json({ error: fallbackMessage });
}

// ---------------------------------------------------------------------------
// Developer profile
// ---------------------------------------------------------------------------
export async function getMe(req, res) {
  try {
    const profile = await developerPlatformService.getMyDeveloperProfile(req.user.id);
    res.json({ developer: profile });
  } catch (err) {
    handleError(res, err, 'Failed to load your developer profile.');
  }
}

export async function register(req, res) {
  try {
    const developer = await developerPlatformService.registerDeveloper(req.user.id, req.body);
    res.status(201).json({
      developer,
      message: "Application received — you'll be notified once it's reviewed. Approval is never automatic.",
    });
  } catch (err) {
    handleError(res, err, 'Failed to submit your developer application.');
  }
}

// ---------------------------------------------------------------------------
// API catalog
// ---------------------------------------------------------------------------
export async function getCatalog(req, res) {
  try {
    const catalog = await developerPlatformService.listApiCatalog();
    res.json({ catalog });
  } catch (err) {
    handleError(res, err, 'Failed to load the API catalog.');
  }
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------
export async function createOrganization(req, res) {
  try {
    const profile = await developerPlatformService.getMyDeveloperProfile(req.user.id);
    if (!profile || profile.status !== 'approved') {
      return res.status(403).json({ error: 'Your developer application must be approved before you can create an organization.' });
    }
    const org = await developerPlatformService.createOrganization(profile.id, req.body);
    res.status(201).json({ organization: org });
  } catch (err) {
    handleError(res, err, 'Failed to create the organization.');
  }
}

export async function listMyOrganizations(req, res) {
  try {
    const profile = await developerPlatformService.getMyDeveloperProfile(req.user.id);
    if (!profile) return res.json({ organizations: [] });
    const orgs = await developerPlatformService.listMyOrganizations(profile.id);
    res.json({ organizations: orgs });
  } catch (err) {
    handleError(res, err, 'Failed to load your organizations.');
  }
}

export async function inviteMember(req, res) {
  try {
    const profile = await developerPlatformService.getMyDeveloperProfile(req.user.id);
    if (!profile) return res.status(403).json({ error: 'You need an approved developer profile to do this.' });
    const member = await developerPlatformService.inviteMember(req.params.orgId, profile.id, req.body);
    res.status(201).json({ member });
  } catch (err) {
    handleError(res, err, 'Failed to invite that team member.');
  }
}

export async function listMembers(req, res) {
  try {
    const members = await developerPlatformService.listMembers(req.params.orgId);
    res.json({ members });
  } catch (err) {
    handleError(res, err, 'Failed to load organization members.');
  }
}

// ---------------------------------------------------------------------------
// Admin review queue
// ---------------------------------------------------------------------------
export async function adminListDevelopers(req, res) {
  try {
    const developers = await developerPlatformService.adminListDevelopers({ status: req.query.status });
    res.json({ developers });
  } catch (err) {
    handleError(res, err, 'Failed to load developer applications.');
  }
}

export async function adminReviewDeveloper(req, res) {
  try {
    const developer = await developerPlatformService.adminReviewDeveloper(req.params.id, req.user.id, req.body);
    res.json({ developer });
  } catch (err) {
    handleError(res, err, 'Failed to review that developer application.');
  }
}

export async function adminListOrganizations(req, res) {
  try {
    const organizations = await developerPlatformService.adminListOrganizations({ status: req.query.status });
    res.json({ organizations });
  } catch (err) {
    handleError(res, err, 'Failed to load developer organizations.');
  }
}

export async function adminReviewOrganization(req, res) {
  try {
    const organization = await developerPlatformService.adminReviewOrganization(req.params.id, req.body);
    res.json({ organization });
  } catch (err) {
    handleError(res, err, 'Failed to review that organization.');
  }
}
