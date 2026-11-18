import 'dotenv/config';

const number = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const bool = (value, fallback = false) => value == null ? fallback : String(value).toLowerCase() === 'true';

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: number(process.env.PORT, 5000),
  trustProxy: number(process.env.TRUST_PROXY, 0),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mediconnect',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
    || process.env.CLERK_PUBLISHABLE_KEY
    || '',
  clerkSecretKey: process.env.CLERK_SECRET_KEY || '',
  otpHashSecret: process.env.OTP_HASH_SECRET || '',
  otpTtlMinutes: number(process.env.LOGIN_OTP_TTL_MINUTES, 5),
  otpResendSeconds: number(process.env.LOGIN_OTP_RESEND_SECONDS, 60),
  otpMaxAttempts: number(process.env.LOGIN_OTP_MAX_ATTEMPTS, 5),
  otpExposeInDev: bool(process.env.OTP_EXPOSE_IN_DEV, false),
  mail: {
    user: process.env.GMAIL_USER || '',
    password: process.env.GMAIL_APP_PASSWORD || '',
    from: process.env.MAIL_FROM || process.env.GMAIL_USER || '',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: number(process.env.SMTP_PORT, 465),
    secure: bool(process.env.SMTP_SECURE, true)
  },
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:8081')
    .split(',').map((value) => value.trim()).filter(Boolean),
  maxUploadMb: number(process.env.MAX_UPLOAD_MB, 10),
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '1mb',
  apiPublicUrl: (process.env.API_PUBLIC_URL || '').replace(/\/$/, ''),
  imagekit: {
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY || '',
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || '',
    folder: process.env.IMAGEKIT_UPLOAD_FOLDER || '/mediconnect/medical-records'
  },
  pneumonia: {
    apiUrl: process.env.PNEUMONIA_API_URL || '',
    healthUrl: process.env.PNEUMONIA_HEALTH_URL || '',
    apiKey: process.env.PNEUMONIA_API_KEY || '',
    timeoutMs: number(process.env.PNEUMONIA_TIMEOUT_MS, 120000)
  },
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN || '',
  admin: {
    name: process.env.ADMIN_NAME || 'Hospital Administrator',
    email: process.env.ADMIN_EMAIL || '',
    idCardNumber: process.env.ADMIN_ID_CARD_NUMBER || 'ADMIN-001'
  }
});

export function validateStartupConfig() {
  const missing = [];
  if (env.jwtSecret.length < 32) missing.push('JWT_SECRET (minimum 32 characters)');
  if (env.otpHashSecret.length < 32) missing.push('OTP_HASH_SECRET (minimum 32 characters)');
  if (!env.mongoUri) missing.push('MONGODB_URI');
  if (!env.clerkPublishableKey || /replace_with/i.test(env.clerkPublishableKey)) {
    missing.push('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY (valid Clerk publishable key)');
  }
  if (missing.length) throw new Error(`Invalid startup configuration: ${missing.join(', ')}`);
  if (env.nodeEnv === 'production' && env.otpExposeInDev) {
    throw new Error('OTP_EXPOSE_IN_DEV must be false in production');
  }
  if (env.nodeEnv === 'production') {
    const productionMissing = [];
    if (!env.apiPublicUrl.startsWith('https://')) productionMissing.push('API_PUBLIC_URL (public HTTPS API origin)');
    if (!env.mail.user || !env.mail.password) productionMissing.push('GMAIL_USER and GMAIL_APP_PASSWORD');
    if (!env.imagekit.privateKey || !env.imagekit.urlEndpoint) productionMissing.push('IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT');
    if (productionMissing.length) throw new Error(`Production configuration is incomplete: ${productionMissing.join(', ')}`);
  }
}
