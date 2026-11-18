import mongoose from "mongoose";
const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, default: "" },
    outcome: { type: String, enum: ["success", "failure"], default: "success" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: "" },
  },
  { timestamps: true },
);
auditLogSchema.index({ createdAt: -1 });
export default mongoose.model("AuditLog", auditLogSchema);
