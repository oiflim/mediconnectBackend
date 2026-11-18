import { Router } from "express";
import Medicine from "../models/Medicine.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess, parseBoolean } from "../utils/http.js";
import { badRequest, notFound, forbidden } from "../utils/errors.js";
import { writeAudit } from "../services/auditService.js";
const router = Router();
const managers = ["medicine_manager", "admin"];
const editable = [
  "name",
  "genericName",
  "category",
  "batchNumber",
  "quantity",
  "reorderLevel",
  "expiryDate",
  "isActive",
  "unit",
  "manufacturer",
  "description",
];
function requireManager(req) {
  if (!managers.includes(req.user.role))
    throw forbidden("Medicine manager or admin access is required");
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    requireManager(req);
    const body = req.body || {};
    for (const field of ["name", "category", "batchNumber", "expiryDate"])
      if (!body[field]) throw badRequest(`${field} is required`);
    if (Number(body.quantity ?? 0) < 0 || Number(body.reorderLevel ?? 10) < 0)
      throw badRequest("Stock quantities cannot be negative");
    const medicine = await Medicine.create({
      ...Object.fromEntries(
        editable
          .filter((key) => body[key] !== undefined)
          .map((key) => [key, body[key]]),
      ),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
    await writeAudit(req, "medicine.created", "Medicine", medicine._id);
    sendSuccess(res, medicine, "Medicine created", 201);
  }),
);
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.category) filter.category = String(req.query.category);
    if (req.query.search) filter.$text = { $search: String(req.query.search) };
    if (req.query.isActive !== undefined)
      filter.isActive = parseBoolean(req.query.isActive);
    const medicines = await Medicine.find(filter)
      .sort({ name: 1 })
      .limit(Math.min(Number(req.query.limit) || 200, 500));
    sendSuccess(res, medicines);
  }),
);
router.get(
  "/low-stock",
  asyncHandler(async (_req, res) => {
    const items = await Medicine.find({
      isActive: true,
      $expr: { $lte: ["$quantity", "$reorderLevel"] },
    }).sort({ quantity: 1 });
    sendSuccess(res, items);
  }),
);
router.get(
  "/expired",
  asyncHandler(async (_req, res) => {
    const items = await Medicine.find({ expiryDate: { $lt: new Date() } }).sort(
      { expiryDate: 1 },
    );
    sendSuccess(res, items);
  }),
);
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) throw notFound("Medicine not found");
    sendSuccess(res, medicine);
  }),
);
router.patch(
  "/:id/stock",
  asyncHandler(async (req, res) => {
    requireManager(req);
    const type = req.body?.type;
    const amount = Number(req.body?.amount);
    if (
      !["add", "remove"].includes(type) ||
      !Number.isInteger(amount) ||
      amount <= 0
    )
      throw badRequest(
        "type must be add/remove and amount must be a positive integer",
      );
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) throw notFound("Medicine not found");
    if (type === "remove" && medicine.quantity < amount)
      throw badRequest("Not enough stock to remove that quantity");
    medicine.quantity += type === "add" ? amount : -amount;
    medicine.updatedBy = req.user._id;
    await medicine.save();
    await writeAudit(req, "medicine.stock_changed", "Medicine", medicine._id, {
      type,
      amount,
    });
    sendSuccess(res, medicine, "Stock updated");
  }),
);
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    requireManager(req);
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) throw notFound("Medicine not found");
    const changed = [];
    for (const field of editable)
      if (req.body?.[field] !== undefined) {
        medicine[field] = req.body[field];
        changed.push(field);
      }
    if (!changed.length)
      throw badRequest("No supported medicine fields were supplied");
    medicine.updatedBy = req.user._id;
    await medicine.save();
    await writeAudit(req, "medicine.updated", "Medicine", medicine._id, {
      changedFields: changed,
    });
    sendSuccess(res, medicine, "Medicine updated");
  }),
);
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    requireManager(req);
    const medicine = await Medicine.findByIdAndDelete(req.params.id);
    if (!medicine) throw notFound("Medicine not found");
    await writeAudit(req, "medicine.deleted", "Medicine", medicine._id);
    sendSuccess(res, null, "Medicine deleted");
  }),
);
export default router;
