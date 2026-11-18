import mongoose from "mongoose";
const emailOtpSchema = new mongoose.Schema(
  {
    challengeId: { type: String, required: true, unique: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    purpose: {
      type: String,
      enum: ["login"],
      default: "login",
      required: true,
    },
    otpHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    resendAvailableAt: { type: Date, required: true },
  },
  { timestamps: true },
);
emailOtpSchema.index({ userId: 1, purpose: 1 }, { unique: true });
emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("EmailOtp", emailOtpSchema);
