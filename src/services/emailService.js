import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { unavailable } from '../utils/errors.js';

let transporter;
function getTransporter() {
  if (!env.mail.user || !env.mail.password) throw unavailable('Gmail SMTP is not configured');
  if (!transporter) transporter = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.secure,
    auth: { user: env.mail.user, pass: env.mail.password }
  });
  return transporter;
}
export async function sendLoginOtp({ to, name, otp, ttlMinutes }) {
  const transport = getTransporter();
  await transport.sendMail({
    from: env.mail.from,
    to,
    subject: 'Your MediConnect login verification code',
    text: `Hello ${name || 'there'},\n\nYour MediConnect login code is ${otp}. It expires in ${ttlMinutes} minutes. Do not share this code with anyone.\n\nIf you did not request this code, you can ignore this email.`,
    html: `<p>Hello ${escapeHtml(name || 'there')},</p><p>Your MediConnect login code is <strong style="font-size:24px;letter-spacing:4px">${otp}</strong>.</p><p>It expires in ${ttlMinutes} minutes. Do not share this code with anyone.</p><p>If you did not request this code, ignore this email.</p>`
  });
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
