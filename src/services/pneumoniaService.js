import axios from 'axios';
import FormData from 'form-data';
import { env } from '../config/env.js';
import { unavailable } from '../utils/errors.js';

export async function predictChestXray(file) {
  if (!env.pneumonia.apiUrl) throw unavailable('PNEUMONIA_API_URL is not configured');
  const form = new FormData();
  form.append('file', file.buffer, { filename: file.originalname || 'chest-xray.jpg', contentType: file.mimetype });
  const headers = { ...form.getHeaders() };
  if (env.pneumonia.apiKey) headers['x-api-key'] = env.pneumonia.apiKey;
  const response = await axios.post(env.pneumonia.apiUrl, form, {
    headers,
    timeout: env.pneumonia.timeoutMs,
    maxBodyLength: env.maxUploadMb * 1024 * 1024 + 1024 * 1024,
    maxContentLength: 5 * 1024 * 1024,
    validateStatus: (status) => status >= 200 && status < 300
  });
  const payload = response.data;
  if (payload?.success === false) throw new Error('ML service reported an unsuccessful prediction');
  return payload?.result ?? payload;
}
export async function checkPneumoniaService() {
  if (!env.pneumonia.healthUrl) return { configured: Boolean(env.pneumonia.apiUrl), reachable: null };
  try {
    const response = await axios.get(env.pneumonia.healthUrl, { timeout: 3000 });
    return { configured: Boolean(env.pneumonia.apiUrl), reachable: response.status >= 200 && response.status < 300 };
  } catch {
    return { configured: Boolean(env.pneumonia.apiUrl), reachable: false };
  }
}
