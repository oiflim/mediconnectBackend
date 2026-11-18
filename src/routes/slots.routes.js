import { Router } from "express";
import User from "../models/User.js";
import Slot from "../models/Slot.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { badRequest, notFound, forbidden, conflict } from "../utils/errors.js";
import { generateIntervals, parseDate } from "../utils/time.js";
import { writeAudit } from "../services/auditService.js";
const router = Router();

router.get(
  "/doctors",
  asyncHandler(async (_req, res) => {
    const doctors = await User.find({ role: "doctor", isActive: true })
      .select("name email role experienceYears specialization")
      .sort({ name: 1 });
    sendSuccess(res, doctors);
  }),
);

router.post(
  "/availability",
  asyncHandler(async (req, res) => {
    const start = parseDate(req.body?.startTime, "startTime");
    const end = parseDate(req.body?.endTime, "endTime");
    if (start <= new Date())
      throw badRequest("Availability must start in the future");
    const duration = Number(req.body?.slotDurationMinutes || 30);
    const intervals = generateIntervals(start, end, duration);
    const overlaps = await Slot.findOne({
      doctorId: req.user._id,
      startTime: { $lt: end },
      endTime: { $gt: start },
    }).select("_id");
    if (overlaps)
      throw conflict("This availability window overlaps an existing slot");
    try {
      const slots = await Slot.insertMany(
        intervals.map((item) => ({ ...item, doctorId: req.user._id })),
        { ordered: true },
      );
      await writeAudit(req, "availability.created", "Slot", "", {
        count: slots.length,
        startTime: start,
        endTime: end,
        durationMinutes: duration,
      });
      sendSuccess(
        res,
        { count: slots.length, slots },
        "Availability created",
        201,
      );
    } catch (error) {
      if (error?.code === 11000)
        throw conflict("One or more slots already exist in this time window");
      throw error;
    }
  }),
);

router.get(
  "/doctors/:doctorId/slots",
  asyncHandler(async (req, res) => {
    const doctor = await User.findOne({
      _id: req.params.doctorId,
      role: "doctor",
      isActive: true,
    }).select("_id");
    if (!doctor) throw notFound("Doctor not found");
    const filter = { doctorId: doctor._id };
    if (req.query.from || req.query.to) {
      filter.startTime = {};
      if (req.query.from)
        filter.startTime.$gte = parseDate(req.query.from, "from");
      if (req.query.to) filter.startTime.$lte = parseDate(req.query.to, "to");
    }
    if (req.query.status) filter.status = String(req.query.status);
    const slots = await Slot.find(filter)
      .populate("doctorId", "name email")
      .populate("patientId", "name")
      .sort({ startTime: 1 })
      .limit(1000);
    sendSuccess(res, slots);
  }),
);

async function loadEditableSlot(req) {
  const slot = await Slot.findById(req.params.slotId);
  if (!slot) throw notFound("Slot not found");
  if (req.user.role !== "admin" && !slot.doctorId.equals(req.user._id))
    throw forbidden("You can only manage your own slots");
  if (slot.status !== "available" || slot.startTime <= new Date())
    throw conflict("Only unbooked future slots can be changed");
  return slot;
}
router.patch(
  "/slots/:slotId",
  asyncHandler(async (req, res) => {
    const slot = await loadEditableSlot(req);
    const start = req.body?.startTime
      ? parseDate(req.body.startTime, "startTime")
      : slot.startTime;
    const end = req.body?.endTime
      ? parseDate(req.body.endTime, "endTime")
      : slot.endTime;
    const duration =
      req.body?.slotDurationMinutes === undefined
        ? slot.durationMinutes
        : Number(req.body.slotDurationMinutes);
    if (
      start <= new Date() ||
      end <= start ||
      end - start !== duration * 60_000
    )
      throw badRequest(
        "A slot must be a future interval matching slotDurationMinutes",
      );
    const overlap = await Slot.findOne({
      _id: { $ne: slot._id },
      doctorId: slot.doctorId,
      startTime: { $lt: end },
      endTime: { $gt: start },
    });
    if (overlap) throw conflict("Updated slot overlaps another slot");
    slot.startTime = start;
    slot.endTime = end;
    slot.durationMinutes = duration;
    await slot.save();
    await writeAudit(req, "slot.updated", "Slot", slot._id);
    sendSuccess(res, slot, "Slot updated");
  }),
);
router.delete(
  "/slots/:slotId",
  asyncHandler(async (req, res) => {
    const slot = await loadEditableSlot(req);
    await slot.deleteOne();
    await writeAudit(req, "slot.deleted", "Slot", slot._id);
    sendSuccess(res, null, "Slot deleted");
  }),
);
export default router;
