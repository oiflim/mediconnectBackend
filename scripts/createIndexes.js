import { validateStartupConfig } from '../src/config/env.js';
import { connectDatabase } from '../src/config/db.js';
import User from '../src/models/User.js';
import EmailOtp from '../src/models/EmailOtp.js';
import Slot from '../src/models/Slot.js';
import Medicine from '../src/models/Medicine.js';
import MedicalRecord from '../src/models/MedicalRecord.js';
import Notification from '../src/models/Notification.js';
import AuditLog from '../src/models/AuditLog.js';

validateStartupConfig();
await connectDatabase();
try {
  const indexes = await User.collection.indexes();
  const idCardIndex = indexes.find((index) => index.key?.idCardNumber === 1);
  if (idCardIndex && !idCardIndex.sparse) {
    await User.collection.dropIndex(idCardIndex.name);
  }
} catch (error) {
  if (error.code !== 26) throw error;
}
for (const model of [User, EmailOtp, Slot, Medicine, MedicalRecord, Notification, AuditLog]) {
  await model.createIndexes();
  console.log(`Indexes ready: ${model.modelName}`);
}
const mongoose = await import('mongoose');
await mongoose.default.disconnect();
