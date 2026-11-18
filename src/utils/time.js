import { badRequest } from './errors.js';
export const SLOT_DURATIONS = [5, 10, 15, 20, 30, 60];
export function parseDate(value, fieldName) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw badRequest(`${fieldName} must be a valid ISO date/time`);
  return date;
}
export function generateIntervals(start, end, durationMinutes) {
  if (!SLOT_DURATIONS.includes(Number(durationMinutes))) throw badRequest(`slotDurationMinutes must be one of ${SLOT_DURATIONS.join(', ')}`);
  const durationMs = Number(durationMinutes) * 60_000;
  const total = end.getTime() - start.getTime();
  if (total <= 0) throw badRequest('endTime must be later than startTime');
  if (total % durationMs !== 0) throw badRequest('Availability window length must be an exact multiple of slot duration');
  const count = total / durationMs;
  if (count > 500) throw badRequest('A single availability request cannot create more than 500 slots');
  return Array.from({ length: count }, (_, index) => ({
    startTime: new Date(start.getTime() + index * durationMs),
    endTime: new Date(start.getTime() + (index + 1) * durationMs),
    durationMinutes: Number(durationMinutes)
  }));
}
