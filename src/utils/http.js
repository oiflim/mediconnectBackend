export function sendSuccess(res, data, message = 'OK', status = 200) {
  return res.status(status).json({ success: true, message, data });
}
export function parseBoolean(value) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
}
export function parseJsonField(value, fallback = undefined) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}
