import { validationResult } from 'express-validator';

// express-validator was already a dependency but nothing in the codebase
// used it — every route validated its own body/params by hand, so
// coverage and error shape varied route to route. This is the one hook
// every validator chain runs through: attach validation rules to a route
// as `[...rules, handleValidationErrors, controllerFn]`, and any failed
// rule short-circuits here with a consistent 400 response, before the
// controller (or the database) ever sees the malformed input.
export function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(400).json({
    error: 'Invalid request.',
    details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
  });
}
