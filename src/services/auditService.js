import AuditLog from '../models/AuditLog.js';
export async function writeAudit(req, action, resourceType, resourceId = '', metadata = {}) {
  try {
    await AuditLog.create({
      actorId: req.user?._id || null,
      action,
      resourceType,
      resourceId: String(resourceId || ''),
      metadata,
      ipAddress: req.ip || ''
    });
  } catch (error) {
    // Auditing must not expose sensitive payloads or turn a successful request into a failure.
    console.error('Audit log write failed:', error.message);
  }
}
