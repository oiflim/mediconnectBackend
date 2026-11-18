import { verifyAccessToken } from '../utils/security.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { unauthorized, forbidden } from '../utils/errors.js';
import User from '../models/User.js';
import { isClerkSessionToken, verifyClerkSessionToken } from '../services/clerkService.js';

export const requireClerkIdentity = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw unauthorized('Provide a Clerk session in the Authorization: Bearer header');
  }
  req.clerkIdentity = await verifyClerkSessionToken(token);
  next();
});

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized('Provide an Authorization: Bearer <token> header');
  let user;
  if (isClerkSessionToken(token)) {
    const identity = await verifyClerkSessionToken(token);
    user = await User.findOne({ clerkUserId: identity.userId });
  } else {
    let payload;
    try { payload = verifyAccessToken(token); } catch { throw unauthorized('Access token is invalid or expired'); }
    user = await User.findById(payload.sub);
  }
  if (!user || !user.isActive) throw unauthorized('Account is unavailable; sign in again or contact an administrator');
  req.user = user;
  next();
});
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
  next();
};
