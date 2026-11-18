import { validateStartupConfig, env } from '../src/config/env.js';
import { connectDatabase } from '../src/config/db.js';
import User from '../src/models/User.js';

validateStartupConfig();
if (!env.admin.email) throw new Error('ADMIN_EMAIL must be set before seeding');
await connectDatabase();
const email = env.admin.email.trim().toLowerCase();
let admin = await User.findOne({ email }).select('+idCardNumber');
if (admin) {
  admin.role = 'admin'; admin.isActive = true;
  if (admin.idCardNumber !== env.admin.idCardNumber) admin.idCardNumber = env.admin.idCardNumber;
  await admin.save();
  console.log(`Existing account promoted to admin: ${email}`);
} else {
  admin = await User.create({ name: env.admin.name, email, idCardNumber: env.admin.idCardNumber, role: 'admin', isActive: true, emailVerified: true });
  console.log(`Admin account created: ${email}`);
}
const mongoose = await import('mongoose');
await mongoose.default.disconnect();
