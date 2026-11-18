export class AppError extends Error {
  constructor(statusCode, message, code = 'REQUEST_ERROR', details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}
export const badRequest = (message, details) => new AppError(400, message, 'VALIDATION_ERROR', details);
export const unauthorized = (message = 'Authentication required') => new AppError(401, message, 'UNAUTHORIZED');
export const forbidden = (message = 'You do not have permission to perform this action') => new AppError(403, message, 'FORBIDDEN');
export const notFound = (message = 'Resource not found') => new AppError(404, message, 'NOT_FOUND');
export const conflict = (message = 'Resource already exists') => new AppError(409, message, 'CONFLICT');
export const unavailable = (message = 'A required service is not configured') => new AppError(503, message, 'SERVICE_UNAVAILABLE');
