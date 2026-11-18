import { Router } from "express";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { badRequest, forbidden, notFound } from "../utils/errors.js";
import { createAndDispatchNotification } from "../services/notificationService.js";
import { canAccessPatient } from "../utils/patientAccess.js";
const router = Router();

router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const notifications = await Notification.find({ recipientId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 100, 300));
    sendSuccess(res, notifications);
  }),
);
router.post(
  "/device-token",
  asyncHandler(async (req, res) => {
    const token = String(req.body?.token || "").trim();
    if (!/^ExponentPushToken\[[^\]]+\]$/.test(token))
      throw badRequest("A valid Expo push token is required");
    await User.updateOne(
      { _id: req.user._id },
      { $addToSet: { expoPushTokens: token } },
    );
    sendSuccess(res, null, "Device token registered");
  }),
);
router.patch(
  "/read-all",
  asyncHandler(async (req, res) => {
    const result = await Notification.updateMany(
      { recipientId: req.user._id, readAt: null },
      { $set: { readAt: new Date() } },
    );
    sendSuccess(
      res,
      { modifiedCount: result.modifiedCount },
      "Notifications marked as read",
    );
  }),
);
router.patch(
  "/:notificationId/read",
  asyncHandler(async (req, res) => {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, recipientId: req.user._id },
      { $set: { readAt: new Date() } },
      { new: true },
    );
    if (!notification) throw notFound("Notification not found");
    sendSuccess(res, notification, "Notification marked as read");
  }),
);
router.delete(
  "/:notificationId",
  asyncHandler(async (req, res) => {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.notificationId,
      recipientId: req.user._id,
    });
    if (!notification) throw notFound("Notification not found");
    sendSuccess(res, null, "Notification deleted");
  }),
);
router.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!["admin", "doctor", "diagnosis_lab_manager"].includes(req.user.role))
      throw forbidden();
    const { title, body, idCardNumber, recipientEmail, type, data } =
      req.body || {};
    if (!title || !body || (!idCardNumber && !recipientEmail))
      throw badRequest(
        "title, body, and idCardNumber or recipientEmail are required",
      );
    const recipientFilter = idCardNumber
      ? { idCardNumber: String(idCardNumber).trim().toUpperCase() }
      : { email: String(recipientEmail).trim().toLowerCase() };
    const recipient = await User.findOne({
      ...recipientFilter,
      isActive: true,
    }).select("+idCardNumber");
    if (!recipient) throw notFound("Active notification recipient not found");
    if (
      req.user.role !== "admin" &&
      !(await canAccessPatient(req.user, recipient._id))
    )
      throw forbidden(
        "You do not have an authorized care relationship with this patient",
      );
    const notification = await createAndDispatchNotification({
      recipientId: recipient._id,
      senderId: req.user._id,
      title,
      body,
      type: type || "personal",
      data: data || {},
    });
    sendSuccess(res, notification, "Notification created", 201);
  }),
);
export default router;
