import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function hashOtp(userId, otp) {
  return crypto.createHmac('sha256', env.otpHashSecret).update(`${userId}:${otp}`).digest('hex');
}
export function safeEqualHex(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
export function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}
export function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id) }, env.jwtSecret, { expiresIn: env.jwtExpiresIn, issuer: 'mediconnect-api', audience: 'mediconnect-client' });
}
export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret, { issuer: 'mediconnect-api', audience: 'mediconnect-client' });
}
