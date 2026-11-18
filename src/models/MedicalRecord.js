import mongoose from "mongoose";
const fileSchema = new mongoose.Schema(
  {
    storageProvider: {
      type: String,
      enum: ["imagekit", "local"],
      required: true,
    },
    fileId: String,
    url: String,
    filePath: String,
    storageName: String,
    originalName: String,
    mimeType: String,
    size: Number,
  },
  { _id: false },
);
const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    dosage: String,
    frequency: String,
    duration: String,
    instructions: String,
  },
  { _id: false },
);
const medicalRecordSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    patientIdCardNumber: {
      type: String,
      required: true,
      uppercase: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["lab_report", "prescription"],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    reportType: { type: String, default: "" },
    diagnosis: { type: String, default: "" },
    notes: { type: String, default: "" },
    medicines: { type: [medicineSchema], default: [] },
    file: { type: fileSchema, default: undefined },
    aiPrediction: { type: mongoose.Schema.Types.Mixed, default: undefined },
    recordedAt: { type: Date, default: Date.now },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
medicalRecordSchema.index({ patientId: 1, type: 1, recordedAt: -1 });
medicalRecordSchema.index({ patientIdCardNumber: 1, type: 1, recordedAt: -1 });
medicalRecordSchema.index({ "aiPrediction.status": 1, patientId: 1 });
export default mongoose.model("MedicalRecord", medicalRecordSchema);
