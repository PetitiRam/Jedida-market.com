-- Phase 29: Close a duplicate-submit race in KYC submissions.
--
-- submitKyc() checked "do I already have a pending submission?" with a
-- plain SELECT before INSERTing — two rapid double-clicks (or a retried
-- request) can both pass that check before either INSERT lands, producing
-- two pending submissions for the same user. Low severity (no money moves
-- here), but same class of bug as the ones fixed elsewhere, so closing it
-- the same way: a DB-enforced constraint instead of a check-then-act race.
CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_one_pending_per_user
  ON kyc_submissions(user_id)
  WHERE status = 'pending';
