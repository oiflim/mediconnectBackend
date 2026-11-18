import { Router } from "express";
import Slot from "../models/Slot.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { badRequest, notFound, forbidden, conflict } from "../utils/errors.js";
import { createAndDispatchNotification } from "../services/notificationService.js";
import { writeAudit } from "../services/auditService.js";
const router = Router();

router.post(
  "/",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "patient")
      throw forbidden("Only patients can book appointments");
    if (!req.body?.slotId) throw badRequest("slotId is required");
    const slot = await Slot.findOneAndUpdate(
      {
        _id: req.body.slotId,
        status: "available",
        patientId: null,
        startTime: { $gt: new Date() },
      },
      {
        $set: {
          status: "booked",
          patientId: req.user._id,
          bookingCreatedAt: new Date(),
        },
      },
      { new: true },
    ).populate("doctorId", "name email");
    if (!slot)
      throw conflict("This slot is no longer available or is in the past");
    await createAndDispatchNotification({
      recipientId: slot.doctorId._id,
      senderId: req.user._id,
      title: "New appointment booked",
      body: `${req.user.name} booked an appointment for ${slot.startTime.toISOString()}`,
      type: "appointment",
      data: { slotId: String(slot._id) },
    });
    await writeAudit(req, "appointment.booked", "Slot", slot._id);
    sendSuccess(res, slot, "Appointment booked", 201);
  }),
);

router.get(
  "/my",
  asyncHandler(async (req, res) => {
    const filter =
      req.user.role === "patient"
        ? { patientId: req.user._id }
        : req.user.role === "doctor"
          ? { doctorId: req.user._id }
          : null;
    if (!filter)
      throw forbidden("This route is available to patients and doctors");
    const bookings = await Slot.find({ ...filter, status: "booked" })
      .populate("doctorId", "name email")
      .populate("patientId", "name email")
      .sort({ startTime: -1 });
    sendSuccess(res, bookings);
  }),
);

router.get(
  "/all",
  asyncHandler(async (_req, res) => {
    const bookings = await Slot.find({ status: "booked" })
      .populate("doctorId", "name email")
      .populate("patientId", "name email")
      .sort({ startTime: -1 })
      .limit(2000);
    sendSuccess(res, bookings);
  }),
);

router.patch(
  "/:slotId/reschedule",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "patient")
      throw forbidden("Only patients can reschedule their own appointments");
    const newSlotId = req.body?.newSlotId;
    if (!newSlotId || String(newSlotId) === String(req.params.slotId))
      throw badRequest("A different newSlotId is required");
    const oldSlot = await Slot.findOne({
      _id: req.params.slotId,
      patientId: req.user._id,
      status: "booked",
      startTime: { $gt: new Date() },
    });
    if (!oldSlot) throw notFound("Future booking not found for this patient");
    const newSlot = await Slot.findOneAndUpdate(
      {
        _id: newSlotId,
        status: "available",
        patientId: null,
        startTime: { $gt: new Date() },
        doctorId: oldSlot.doctorId,
      },
      {
        $set: {
          status: "booked",
          patientId: req.user._id,
          bookingCreatedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!newSlot)
      throw conflict(
        "The requested new slot is unavailable; choose another slot with the same doctor",
      );
    const released = await Slot.updateOne(
      { _id: oldSlot._id, patientId: req.user._id, status: "booked" },
      {
        $set: { patientId: null, status: "available", bookingCreatedAt: null },
      },
    );
    if (released.modifiedCount !== 1) {
      await Slot.updateOne(
        { _id: newSlot._id, patientId: req.user._id, status: "booked" },
        {
          $set: {
            patientId: null,
            status: "available",
            bookingCreatedAt: null,
          },
        },
      );
      throw conflict(
        "The original booking changed while rescheduling; no new booking was kept",
      );
    }
    await writeAudit(req, "appointment.rescheduled", "Slot", oldSlot._id, {
      newSlotId: String(newSlot._id),
    });
    sendSuccess(res, newSlot, "Appointment rescheduled");
  }),
);

async function cancelBooking(req, actorRole) {
  const slot = await Slot.findOne({
    _id: req.params.slotId,
    status: "booked",
    startTime: { $gt: new Date() },
  });
  if (!slot) throw notFound("Future active booking not found");
  if (actorRole === "patient" && !slot.patientId?.equals(req.user._id))
    throw forbidden("You can only cancel your own appointment");
  if (actorRole === "doctor" && !slot.doctorId.equals(req.user._id))
    throw forbidden("You can only cancel appointments assigned to you");
  const result = await Slot.updateOne(
    { _id: slot._id, status: "booked", patientId: slot.patientId },
    { $set: { status: "available", patientId: null, bookingCreatedAt: null } },
  );
  if (result.modifiedCount !== 1)
    throw conflict("Booking changed before cancellation completed");
  await writeAudit(req, "appointment.cancelled", "Slot", slot._id, {
    cancelledByRole: actorRole,
  });
  return slot;
}
router.delete(
  "/:slotId",
  asyncHandler(async (req, res) => {
    const allowed = ["patient", "doctor", "admin"];
    if (!allowed.includes(req.user.role)) throw forbidden();
    const slot = await cancelBooking(req, req.user.role);
    sendSuccess(
      res,
      { slotId: slot._id },
      "Appointment cancelled and slot reopened",
    );
  }),
);
router.patch(
  "/:slotId/cancel",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "patient") throw forbidden();
    const slot = await cancelBooking(req, "patient");
    sendSuccess(res, { slotId: slot._id }, "Appointment cancelled");
  }),
);
router.patch(
  "/:slotId/doctor-cancel",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "doctor") throw forbidden();
    const slot = await cancelBooking(req, "doctor");
    sendSuccess(res, { slotId: slot._id }, "Appointment cancelled by doctor");
  }),
);
router.patch(
  "/:slotId/admin-cancel",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "admin") throw forbidden();
    const slot = await cancelBooking(req, "admin");
    sendSuccess(
      res,
      { slotId: slot._id },
      "Appointment cancelled by administrator",
    );
  }),
);
export default router;
