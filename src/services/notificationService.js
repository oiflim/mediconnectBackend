import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { env } from '../config/env.js';

export async function createAndDispatchNotification({ recipientId, senderId = null, title, body, type = 'general', data = {} }) {
  const notification = await Notification.create({ recipientId, senderId, title, body, type, data });
  const recipient = await User.findById(recipientId).select('+expoPushTokens');
  const tokens = recipient?.expoPushTokens || [];
  if (!tokens.length) {
    notification.pushStatus = 'no_device_token';
    await notification.save();
    return notification;
  }
  try {
    const messages = tokens.map((to) => ({ to, sound: 'default', title, body, data }));
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (env.expoAccessToken) headers.Authorization = `Bearer ${env.expoAccessToken}`;
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers, body: JSON.stringify(messages)
    });
    if (!response.ok) throw new Error(`Expo push HTTP ${response.status}`);
    const payload = await response.json();
    const tickets = Array.isArray(payload.data) ? payload.data : [payload.data];
    notification.pushStatus = tickets.some((ticket) => ticket?.status === 'ok') ? 'sent' : 'failed';
  } catch (error) {
    console.warn('Expo push delivery failed:', error.message);
    notification.pushStatus = 'failed';
  }
  await notification.save();
  return notification;
}
