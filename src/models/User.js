import mongoose from "mongoose";
import bcrypt from "bcryptjs";

export const USER_ROLES = [
  "patient",
  "doctor",
  "medicine_manager",
  "diagnosis_lab_manager",
  "admin",
];
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    clerkUserId: { type: String, select: false },
    password: { type: String, select: false, minlength: 8 },
    idCardNumber: {
      type: String,
      trim: true,
      uppercase: true,
      select: false,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: "patient",
      required: true,
      index: true,
    },
    experienceYears: { type: Number, min: 0, max: 80 },
    specialization: { type: String, trim: true, maxlength: 120 },
    isActive: { type: Boolean, default: true, index: true },
    emailVerified: { type: Boolean, default: false },
    expoPushTokens: { type: [String], default: [], select: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: hidePrivate },
    toObject: { virtuals: true },
  },
);
function hidePrivate(_doc, ret) {
  delete ret.password;
  delete ret.idCardNumber;
  delete ret.expoPushTokens;
  delete ret.__v;
  return ret;
}
userSchema.pre("save", async function hashPassword() {
  if (this.isModified("password"))
    this.password = await bcrypt.hash(this.password, 12);
});
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ idCardNumber: 1 }, { unique: true, sparse: true });
userSchema.index({ clerkUserId: 1 }, { unique: true, sparse: true });
export default mongoose.model("User", userSchema);
