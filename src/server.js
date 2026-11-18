import { validateStartupConfig, env } from './config/env.js';
import { connectDatabase } from './config/db.js';
import app from './app.js';

validateStartupConfig();
await connectDatabase();
const server = app.listen(env.port, () => console.log(`MediConnect API listening on port ${env.port}`));

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  server.close(async () => {
    const mongoose = await import('mongoose');
    await mongoose.default.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));


// http://localhost:5000/api/health