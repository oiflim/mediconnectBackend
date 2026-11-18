import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.connection.on('connected', () => console.log('MongoDB connected'));
mongoose.connection.on('error', (error) => console.error('MongoDB connection error:', error.message));
mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10000,
    autoIndex: env.nodeEnv !== 'production'
  });
}
