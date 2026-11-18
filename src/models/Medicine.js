import mongoose from "mongoose";
import { medicineAvailabilityStatus } from "../utils/medicine.js";
const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    genericName: { type: String, trim: true, default: "" },
    category: { type: String, required: true, trim: true },
    batchNumber: { type: String, required: true, trim: true, uppercase: true },
    quantity: { type: Number, required: true, min: 0, default: 0 },
    reorderLevel: { type: Number, min: 0, default: 10 },
    expiryDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    unit: { type: String, default: "unit" },
    manufacturer: { type: String, default: "" },
    description: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);
medicineSchema.index({
  name: "text",
  genericName: "text",
  batchNumber: "text",
});
medicineSchema.virtual("availabilityStatus").get(function () {
  return medicineAvailabilityStatus(this);
});
export default mongoose.model("Medicine", medicineSchema);
