import mongoose from 'mongoose';
import multer from 'multer';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
}
export function errorHandler(error, _req, res, _next) {
  let status = error.statusCode || 500;
  let code = error.code || 'INTERNAL_SERVER_ERROR';
  let message = error.isOperational ? error.message : 'An unexpected server error occurred';
  let details = error.details;
  if (error instanceof mongoose.Error.ValidationError) {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Submitted data is invalid';
    details = Object.values(error.errors).map((item) => ({ field: item.path, message: item.message }));
  } else if (error instanceof mongoose.Error.CastError) {
    status = 400; code = 'INVALID_ID'; message = 'A supplied resource ID is invalid';
  } else if (error?.code === 11000) {
    status = 409; code = 'DUPLICATE_RESOURCE'; message = 'A record with one of these unique values already exists';
    details = Object.keys(error.keyPattern || {});
  } else if (error instanceof multer.MulterError) {
    status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = 'UPLOAD_ERROR'; message = error.code === 'LIMIT_FILE_SIZE' ? `File exceeds the ${env.maxUploadMb} MB limit` : 'File upload could not be processed';
  }
  if (status >= 500) console.error(error);
  const response = { success: false, error: { code, message } };
  if (details && env.nodeEnv !== 'production') response.error.details = details;
  res.status(status).json(response);
}
