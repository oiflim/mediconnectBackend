import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { sendSuccess } from './utils/http.js';
import { AppError } from './utils/errors.js';
import { checkPneumoniaService } from './services/pneumoniaService.js';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import slotsRoutes from './routes/slots.routes.js';
import bookingsRoutes from './routes/bookings.routes.js';
import medicinesRoutes from './routes/medicines.routes.js';
import recordsRoutes from './routes/records.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';

const app = express();
if (env.trustProxy > 0) app.set('trust proxy', env.trustProxy);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.clientOrigins.includes('*') || env.clientOrigins.includes(origin)) return callback(null, true);
    return callback(new AppError(403, 'Origin is not allowed by CORS', 'CORS_ORIGIN_DENIED'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: env.jsonBodyLimit }));
app.use(express.urlencoded({ extended: false, limit: env.jsonBodyLimit }));
if (env.nodeEnv !== 'test') app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev', { skip: (_req, res) => res.statusCode >= 500 }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many authentication requests; try again later' } } });
app.get('/api/health', async (req, res) => {
  const ml = await checkPneumoniaService();
  sendSuccess(res, {
    service: 'MediConnect API',
    status: mongoose.connection.readyState === 1 ? 'ok' : 'degraded',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    mlService: ml,
    timestamp: new Date().toISOString()
  }, 'Health check');
});
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', requireAuth, requireRole('admin'), adminRoutes);
app.use('/api/slots', requireAuth, slotsRoutes);
app.use('/api/bookings', requireAuth, bookingsRoutes);
app.use('/api/medicines', requireAuth, medicinesRoutes);
app.use('/api/records', requireAuth, recordsRoutes);
app.use('/api/notifications', requireAuth, notificationsRoutes);
app.use(notFoundHandler);
app.use(errorHandler);
export default app;

// use