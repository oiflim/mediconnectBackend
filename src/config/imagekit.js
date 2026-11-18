import ImageKit from '@imagekit/nodejs';
import { env } from './env.js';

let client;
export function getImageKit() {
  if (!env.imagekit.privateKey || !env.imagekit.urlEndpoint) return null;
  if (!client) client = new ImageKit({ privateKey: env.imagekit.privateKey });
  return client;
}
