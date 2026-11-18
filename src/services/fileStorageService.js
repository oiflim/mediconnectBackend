import { getImageKit } from '../config/imagekit.js';
import { toFile } from '@imagekit/nodejs';
import path from 'node:path';
import fs from 'node:fs';
import { unavailable, notFound } from '../utils/errors.js';

export async function uploadMedicalFile(file) {
  const imagekit = getImageKit();
  if (!imagekit) throw unavailable('ImageKit storage is not configured; set IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT');
  const fileName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const uploaded = await imagekit.files.upload({
    file: await toFile(file.buffer, fileName),
    fileName,
    folder: process.env.IMAGEKIT_UPLOAD_FOLDER || '/mediconnect/medical-records',
    useUniqueFileName: true,
    isPrivateFile: true
  });
  return {
    storageProvider: 'imagekit',
    fileId: uploaded.fileId,
    url: uploaded.url,
    filePath: uploaded.filePath,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size
  };
}
export async function deleteStoredFile(file) {
  if (!file || file.storageProvider !== 'imagekit' || !file.fileId) return;
  const imagekit = getImageKit();
  if (!imagekit) return;
  await imagekit.files.delete(file.fileId);
}
export function getLegacyLocalFilePath(file) {
  if (!file || file.storageProvider !== 'local') throw notFound('Legacy file not found');
  const uploadRoot = path.resolve(process.cwd(), 'uploads');
  const storedPath = file.filePath || file.storageName || '';
  const candidate = path.resolve(process.cwd(), storedPath);
  if (!candidate.startsWith(`${uploadRoot}${path.sep}`) || !fs.existsSync(candidate)) throw notFound('Legacy stored file is unavailable');
  return candidate;
}

export function getProtectedFileUrl(file) {
  if (!file) throw notFound('File not found');
  if (file.storageProvider === 'imagekit' && file.filePath) {
    const imagekit = getImageKit();
    if (!imagekit) throw unavailable('ImageKit storage is not configured');
    return imagekit.helper.buildSrc({ urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT, src: file.filePath, signed: true, expiresIn: 60 });
  }
  throw notFound('File is not available');
}
