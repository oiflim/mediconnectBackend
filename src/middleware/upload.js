import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const allowed = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowed.has(file.mimetype)) return callback(new AppError(415, 'Only JPG, PNG, and PDF files are accepted', 'UNSUPPORTED_FILE_TYPE'));
    callback(null, true);
  }
});
export const singleMedicalFile = uploader.single('file');
