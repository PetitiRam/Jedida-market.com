import * as affiliateService from '../services/affiliateService.js';

function handleError(res, err, fallbackMessage) {
  if (err.code === 'BAD_REQUEST') return res.status(400).json({ error: err.message });
  if (err.code === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'Your available affiliate balance is lower than the requested amount.' });
  if (err.code === 'ALREADY_REVIEWED') return res.status(409).json({ error: 'This item has already been reviewed.' });
  console.error(fallbackMessage, err);
  return res.status(500).json({ error: fallbackMessage });
}

// ---------------------------------------------------------------------------
// User-facing
// ---------------------------------------------------------------------------
export async function getMyReferralInfo(req, res) {
  try {
    const info = await affiliateService.getMyReferralInfo(req.user.id);
    res.json(info);
  } catch (err) {
    handleError(res, err, 'Failed to load your referral link.');
  }
}

export async function getMyWallet(req, res) {
  try {
    const wallet = await affiliateService.getAffiliateWallet(req.user.id);
    res.json(wallet);
  } catch (err) {
    handleError(res, err, 'Failed to load your affiliate wallet.');
  }
}

export async function getMyCommissions(req, res) {
  try {
    const { type, status } = req.query;
    const commissions = await affiliateService.listMyCommissions(req.user.id, { type, status });
    res.json({ commissions });
  } catch (err) {
    handleError(res, err, 'Failed to load your commission history.');
  }
}

export async function getMyReferrals(req, res) {
  try {
    const referrals = await affiliateService.listMyReferrals(req.user.id);
    res.json({ referrals });
  } catch (err) {
    handleError(res, err, 'Failed to load your referral history.');
  }
}

export async function getMyWithdrawals(req, res) {
  try {
    const withdrawals = await affiliateService.listMyWithdrawals(req.user.id);
    res.json({ withdrawals });
  } catch (err) {
    handleError(res, err, 'Failed to load your withdrawal history.');
  }
}

export async function postWithdrawal(req, res) {
  try {
    const { amount, method, destination } = req.body || {};
    const result = await affiliateService.requestWithdrawal(req.user.id, { amount, method, destination });
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, 'Failed to submit your withdrawal request.');
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export async function adminGetOverview(req, res) {
  try {
    const overview = await affiliateService.adminOverview();
    res.json(overview);
  } catch (err) {
    handleError(res, err, 'Failed to load affiliate program overview.');
  }
}

export async function adminGetReferrals(req, res) {
  try {
    const { flagged } = req.query;
    const referrals = await affiliateService.adminListReferrals({ flagged });
    res.json({ referrals });
  } catch (err) {
    handleError(res, err, 'Failed to load referrals.');
  }
}

export async function adminGetHeldCommissions(req, res) {
  try {
    const commissions = await affiliateService.adminListHeldCommissions();
    res.json({ commissions });
  } catch (err) {
    handleError(res, err, 'Failed to load held commissions.');
  }
}

export async function adminPostCommissionReview(req, res) {
  try {
    const { decision } = req.body || {};
    const commission = await affiliateService.adminReviewCommission(req.params.id, decision, req.user.id);
    res.json({ commission });
  } catch (err) {
    handleError(res, err, 'Failed to review this commission.');
  }
}

export async function adminGetWithdrawals(req, res) {
  try {
    const { status } = req.query;
    const withdrawals = await affiliateService.adminListWithdrawals({ status });
    res.json({ withdrawals });
  } catch (err) {
    handleError(res, err, 'Failed to load withdrawal requests.');
  }
}

export async function adminPostWithdrawalReview(req, res) {
  try {
    const { decision } = req.body || {};
    const status = await affiliateService.adminReviewWithdrawal(req.params.id, decision, req.user.id);
    res.json({ status });
  } catch (err) {
    handleError(res, err, 'Failed to review this withdrawal.');
  }
}
