import mongoose from "mongoose";
const slotSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    durationMinutes: {
      type: Number,
      enum: [5, 10, 15, 20, 30, 60],
      default: 30,
    },
    status: {
      type: String,
      enum: ["available", "booked"],
      default: "available",
      index: true,
    },
    bookingCreatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
slotSchema.index({ doctorId: 1, startTime: 1 }, { unique: true });
slotSchema.index({ startTime: 1, status: 1 });
slotSchema.index({ patientId: 1, startTime: -1 });
export default mongoose.model("Slot", slotSchema);
