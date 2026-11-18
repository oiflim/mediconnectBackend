import { Router } from "express";
import User from "../models/User.js";
import MedicalRecord from "../models/MedicalRecord.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess, parseJsonField } from "../utils/http.js";
import { badRequest, notFound, forbidden } from "../utils/errors.js";
import { singleMedicalFile } from "../middleware/upload.js";
import {
  uploadMedicalFile,
  deleteStoredFile,
  getProtectedFileUrl,
  getLegacyLocalFilePath,
} from "../services/fileStorageService.js";
import { predictChestXray } from "../services/pneumoniaService.js";
import { createAndDispatchNotification } from "../services/notificationService.js";
import { writeAudit } from "../services/auditService.js";
import { canAccessPatient } from "../utils/patientAccess.js";
const router = Router();
const staffRoles = ["doctor", "diagnosis_lab_manager", "admin"];
const images = new Set(["image/jpeg", "image/png"]);
function publicRecord(record, req) {
  const item = record.toObject ? record.toObject() : { ...record };
  if (item.file) {
    // Never expose ImageKit file IDs, storage paths, or provider URLs to clients.
    const storedFile = item.file;
    item.file = {
      originalName: storedFile.originalName,
      mimeType: storedFile.mimeType,
      size: storedFile.size,
    };
    item.downloadUrl = `${process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`}/api/records/${item._id}/file`;
  }
  delete item.__v;
  return item;
}
async function getPatientByCard(idCardNumber) {
  const card = String(idCardNumber || "")
    .trim()
    .toUpperCase();
  if (!card) throw badRequest("idCardNumber is required");
  const patient = await User.findOne({
    idCardNumber: card,
    role: "patient",
    isActive: true,
  }).select("+idCardNumber");
  if (!patient)
    throw notFound("Active patient not found for this ID-card number");
  return patient;
}
function ensureRecordEditor(record, user) {
  if (user.role === "admin") return;
  const validCreatorRole =
    (user.role === "doctor" && record.type === "prescription") ||
    (user.role === "diagnosis_lab_manager" && record.type === "lab_report");
  if (!validCreatorRole || !record.uploadedBy.equals(user._id))
    throw forbidden(
      "You can edit only clinical records you created in your assigned role",
    );
}
async function ensureRecordAccess(record, user) {
  const patientOwner =
    user.role === "patient" && record.patientId.equals(user._id);
  const staffRole = ["admin", "doctor", "diagnosis_lab_manager"].includes(
    user.role,
  );
  if (!patientOwner && !staffRole) throw forbidden();
  if (!patientOwner && user.role !== "admin") {
    const authorizedContext = await canAccessPatient(user, record.patientId);
    if (!authorizedContext)
      throw forbidden(
        "No authorized care context exists for this patient's record",
      );
  }
}

router.get(
  "/my",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "patient")
      throw forbidden("Only patients can view this route");
    const records = await MedicalRecord.find({
      patientId: req.user._id,
      isDeleted: false,
    }).sort({ recordedAt: -1 });
    sendSuccess(
      res,
      records.map((record) => publicRecord(record, req)),
    );
  }),
);
router.get(
  "/my/ai-predictions",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "patient")
      throw forbidden("Only patients can view this route");
    const records = await MedicalRecord.find({
      patientId: req.user._id,
      type: "lab_report",
      "aiPrediction.status": "completed",
      isDeleted: false,
    }).sort({ recordedAt: -1 });
    sendSuccess(
      res,
      records.map((record) => publicRecord(record, req)),
    );
  }),
);
router.get(
  "/patient/:idCardNumber",
  asyncHandler(async (req, res) => {
    if (!staffRoles.includes(req.user.role)) throw forbidden();
    const patient = await getPatientByCard(req.params.idCardNumber);
    const records = await MedicalRecord.find({
      patientId: patient._id,
      isDeleted: false,
    })
      .populate("uploadedBy", "name role")
      .sort({ recordedAt: -1 });
    sendSuccess(res, {
      patient: {
        id: patient._id,
        name: patient.name,
        idCardNumber: patient.idCardNumber,
      },
      records: records.map((record) => publicRecord(record, req)),
    });
  }),
);
router.get(
  "/patient/:idCardNumber/ai-predictions",
  asyncHandler(async (req, res) => {
    if (!staffRoles.includes(req.user.role)) throw forbidden();
    const patient = await getPatientByCard(req.params.idCardNumber);
    const records = await MedicalRecord.find({
      patientId: patient._id,
      type: "lab_report",
      "aiPrediction.status": "completed",
      isDeleted: false,
    }).sort({ recordedAt: -1 });
    sendSuccess(
      res,
      records.map((record) => publicRecord(record, req)),
    );
  }),
);

router.post(
  "/lab-reports",
  singleMedicalFile,
  asyncHandler(async (req, res) => {
    if (!["diagnosis_lab_manager", "admin"].includes(req.user.role))
      throw forbidden("Diagnosis lab manager or admin access is required");
    if (!req.file)
      throw badRequest('A report file is required in multipart field "file"');
    const patient = await getPatientByCard(req.body?.idCardNumber);
    const reportType = String(req.body?.reportType || "general");
    const title = String(
      req.body?.title || req.file.originalname || "Lab report",
    ).trim();
    if (reportType === "chest_xray" && !images.has(req.file.mimetype)) {
      throw badRequest(
        "Chest X-ray AI prediction accepts JPG or PNG images only",
      );
    }
    const file = await uploadMedicalFile(req.file);
    let aiPrediction;
    if (reportType === "chest_xray") {
      try {
        const result = await predictChestXray(req.file);
        aiPrediction = {
          status: "completed",
          result,
          model: "existing-fastapi-pneumonia-service",
          predictedAt: new Date(),
          disclaimer: "Decision-support output only; not a medical diagnosis.",
        };
      } catch (error) {
        aiPrediction = {
          status: "failed",
          errorCode: "ML_SERVICE_UNAVAILABLE",
          predictedAt: new Date(),
          disclaimer:
            "No AI result is available. A clinician must review the X-ray.",
        };
        console.error("Chest X-ray inference failed:", error.message);
      }
    }
    const record = await MedicalRecord.create({
      patientId: patient._id,
      patientIdCardNumber: patient.idCardNumber,
      type: "lab_report",
      title,
      reportType,
      diagnosis: String(req.body?.diagnosis || ""),
      notes: String(req.body?.notes || ""),
      recordedAt: req.body?.recordedAt
        ? new Date(req.body.recordedAt)
        : new Date(),
      file,
      aiPrediction,
      uploadedBy: req.user._id,
    });
    await createAndDispatchNotification({
      recipientId: patient._id,
      senderId: req.user._id,
      title: "New lab report available",
      body: `A new report has been added to your MediConnect records: ${title}`,
      type: "medical_record",
      data: { recordId: String(record._id) },
    });
    await writeAudit(
      req,
      "medical_record.lab_report_created",
      "MedicalRecord",
      record._id,
      { reportType, aiStatus: aiPrediction?.status || "not_applicable" },
    );
    sendSuccess(
      res,
      publicRecord(record, req),
      aiPrediction?.status === "failed"
        ? "Lab report saved; AI inference is currently unavailable"
        : "Lab report uploaded",
      201,
    );
  }),
);

router.patch(
  "/lab-reports/by-card/:idCardNumber",
  asyncHandler(async (req, res) => {
    if (!["diagnosis_lab_manager", "admin"].includes(req.user.role))
      throw forbidden();
    const patient = await getPatientByCard(req.params.idCardNumber);
    const record = await MedicalRecord.findOne({
      patientId: patient._id,
      type: "lab_report",
      isDeleted: false,
    }).sort({ recordedAt: -1 });
    if (!record) throw notFound("No lab report found for this patient");
    ensureRecordEditor(record, req.user);
    return updateRecord(req, res, record);
  }),
);
router.patch(
  "/lab-reports/:recordId",
  asyncHandler(async (req, res) => {
    if (!["diagnosis_lab_manager", "admin"].includes(req.user.role))
      throw forbidden();
    const record = await MedicalRecord.findOne({
      _id: req.params.recordId,
      type: "lab_report",
      isDeleted: false,
    });
    if (!record) throw notFound("Lab report not found");
    ensureRecordEditor(record, req.user);
    return updateRecord(req, res, record);
  }),
);

router.post(
  "/prescriptions",
  singleMedicalFile,
  asyncHandler(async (req, res) => {
    if (!["doctor", "admin"].includes(req.user.role))
      throw forbidden("Doctor or admin access is required");
    const patient = await getPatientByCard(req.body?.idCardNumber);
    const medicines = parseJsonField(
      req.body?.medicines,
      req.body?.medicines || [],
    );
    if (!Array.isArray(medicines))
      throw badRequest("medicines must be an array");
    const file = req.file ? await uploadMedicalFile(req.file) : undefined;
    const record = await MedicalRecord.create({
      patientId: patient._id,
      patientIdCardNumber: patient.idCardNumber,
      type: "prescription",
      title: String(req.body?.title || "Prescription"),
      diagnosis: String(req.body?.diagnosis || ""),
      notes: String(req.body?.notes || ""),
      medicines,
      recordedAt: req.body?.recordedAt
        ? new Date(req.body.recordedAt)
        : new Date(),
      file,
      uploadedBy: req.user._id,
    });
    await createAndDispatchNotification({
      recipientId: patient._id,
      senderId: req.user._id,
      title: "New prescription available",
      body: "A doctor added a prescription to your MediConnect records.",
      type: "medical_record",
      data: { recordId: String(record._id) },
    });
    await writeAudit(
      req,
      "medical_record.prescription_created",
      "MedicalRecord",
      record._id,
    );
    sendSuccess(res, publicRecord(record, req), "Prescription created", 201);
  }),
);

async function updateRecord(req, res, record) {
  const fields = [
    "title",
    "diagnosis",
    "notes",
    "reportType",
    "recordedAt",
    "medicines",
  ];
  const changed = [];
  for (const field of fields) {
    if (req.body?.[field] !== undefined) {
      let value = req.body[field];
      if (field === "medicines") value = parseJsonField(value, value);
      if (field === "recordedAt") value = new Date(value);
      if (field === "medicines" && !Array.isArray(value))
        throw badRequest("medicines must be an array");
      record[field] = value;
      changed.push(field);
    }
  }
  if (!changed.length)
    throw badRequest("No supported record fields were supplied");
  await record.save();
  await writeAudit(req, "medical_record.updated", "MedicalRecord", record._id, {
    changedFields: changed,
  });
  sendSuccess(res, publicRecord(record, req), "Medical record updated");
}
router.patch(
  "/:recordId",
  asyncHandler(async (req, res) => {
    const record = await MedicalRecord.findOne({
      _id: req.params.recordId,
      isDeleted: false,
    });
    if (!record) throw notFound("Medical record not found");
    ensureRecordEditor(record, req.user);
    return updateRecord(req, res, record);
  }),
);
router.delete(
  "/:recordId",
  asyncHandler(async (req, res) => {
    const record = await MedicalRecord.findOne({
      _id: req.params.recordId,
      isDeleted: false,
    });
    if (!record) throw notFound("Medical record not found");
    ensureRecordEditor(record, req.user);
    record.isDeleted = true;
    record.deletedAt = new Date();
    await record.save();
    try {
      await deleteStoredFile(record.file);
    } catch (error) {
      console.warn("Stored file cleanup failed:", error.message);
    }
    await writeAudit(
      req,
      "medical_record.soft_deleted",
      "MedicalRecord",
      record._id,
      { fileCleanupAttempted: Boolean(record.file) },
    );
    sendSuccess(
      res,
      null,
      "Medical record archived; file cleanup was attempted",
    );
  }),
);
router.get(
  "/:recordId",
  asyncHandler(async (req, res) => {
    const record = await MedicalRecord.findOne({
      _id: req.params.recordId,
      isDeleted: false,
    });
    if (!record) throw notFound("Medical record not found");
    await ensureRecordAccess(record, req.user);
    sendSuccess(res, publicRecord(record, req));
  }),
);
router.get(
  "/:recordId/file",
  asyncHandler(async (req, res) => {
    const record = await MedicalRecord.findOne({
      _id: req.params.recordId,
      isDeleted: false,
    });
    if (!record?.file) throw notFound("Medical record file not found");
    await ensureRecordAccess(record, req.user);
    if (record.file.storageProvider === "local") {
      const localPath = getLegacyLocalFilePath(record.file);
      return res.download(
        localPath,
        record.file.originalName || "medical-record-file",
        (error) => {
          if (error && !res.headersSent)
            console.warn("Legacy file download failed:", error.message);
        },
      );
    }
    const url = getProtectedFileUrl(record.file);
    res.redirect(302, url);
  }),
);
export default router;
