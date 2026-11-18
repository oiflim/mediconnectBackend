import { Router } from "express";
import User, { USER_ROLES } from "../models/User.js";
import Slot from "../models/Slot.js";
import MedicalRecord from "../models/MedicalRecord.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess, parseBoolean } from "../utils/http.js";
import { badRequest, notFound, conflict } from "../utils/errors.js";
import { writeAudit } from "../services/auditService.js";
const router = Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  idCardNumber: user.idCardNumber,
  role: user.role,
  isActive: user.isActive,
  emailVerified: user.emailVerified,
  createdAt: user.createdAt,
});

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.email)
      filter.email = String(req.query.email).trim().toLowerCase();
    if (req.query.role) filter.role = String(req.query.role);
    if (req.query.isActive !== undefined)
      filter.isActive = parseBoolean(req.query.isActive);
    const users = await User.find(filter)
      .select("+idCardNumber")
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 100, 500));
    sendSuccess(res, users.map(publicUser));
  }),
);

router.patch(
  "/users/role",
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const role = req.body?.role;
    if (!emailPattern.test(email) || !USER_ROLES.includes(role))
      throw badRequest(
        `Valid email and role are required. Roles: ${USER_ROLES.join(", ")}`,
      );
    const user = await User.findOne({ email }).select("+idCardNumber");
    if (!user) throw notFound("User not found");
    if (user._id.equals(req.user._id) && role !== "admin")
      throw conflict("An administrator cannot demote their own active session");
    user.role = role;
    await user.save();
    await writeAudit(req, "admin.user_role_changed", "User", user._id, {
      role,
    });
    sendSuccess(res, publicUser(user), "User role updated");
  }),
);

router.patch(
  "/users/active",
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const isActive = parseBoolean(req.body?.isActive);
    if (!emailPattern.test(email) || isActive === undefined)
      throw badRequest("Valid email and boolean isActive are required");
    const user = await User.findOne({ email }).select(
      "+idCardNumber +expoPushTokens",
    );
    if (!user) throw notFound("User not found");
    if (user._id.equals(req.user._id) && !isActive)
      throw conflict("Use DELETE /api/auth/me to deactivate your own account");
    user.isActive = isActive;
    if (!isActive) user.expoPushTokens = [];
    await user.save();
    await writeAudit(req, "admin.user_active_changed", "User", user._id, {
      isActive,
    });
    sendSuccess(
      res,
      publicUser(user),
      `User ${isActive ? "activated" : "deactivated"}`,
    );
  }),
);

router.patch(
  "/users/:userId",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.userId).select("+idCardNumber");
    if (!user) throw notFound("User not found");
    const allowed = ["name", "email", "idCardNumber"];
    const changed = [];
    for (const field of allowed) {
      if (req.body?.[field] !== undefined) {
        user[field] =
          field === "email"
            ? String(req.body[field]).trim().toLowerCase()
            : field === "idCardNumber"
              ? String(req.body[field]).trim().toUpperCase()
              : String(req.body[field]).trim();
        changed.push(field);
      }
    }
    if (req.body?.role !== undefined) {
      if (!USER_ROLES.includes(req.body.role)) throw badRequest("Invalid role");
      user.role = req.body.role;
      changed.push("role");
    }
    if (req.body?.isActive !== undefined) {
      const active = parseBoolean(req.body.isActive);
      if (active === undefined) throw badRequest("isActive must be boolean");
      if (user._id.equals(req.user._id) && !active)
        throw conflict(
          "Use DELETE /api/auth/me to deactivate your own account",
        );
      user.isActive = active;
      changed.push("isActive");
    }
    if (req.body?.password !== undefined) {
      if (String(req.body.password).length < 8)
        throw badRequest("Password must contain at least 8 characters");
      user.password = req.body.password;
      changed.push("password");
    }
    if (req.body?.email !== undefined) user.emailVerified = false;
    if (!changed.length) throw badRequest("No permitted fields supplied");
    await user.save();
    if (changed.includes("idCardNumber")) {
      await MedicalRecord.updateMany(
        { patientId: user._id },
        { $set: { patientIdCardNumber: user.idCardNumber } },
      );
    }
    await writeAudit(req, "admin.user_updated", "User", user._id, {
      changedFields: changed.filter((field) => field !== "password"),
    });
    sendSuccess(res, publicUser(user), "User updated");
  }),
);

router.delete(
  "/users/:userId",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.userId).select(
      "+expoPushTokens",
    );
    if (!user) throw notFound("User not found");
    if (user._id.equals(req.user._id))
      throw conflict(
        "Administrators cannot deactivate themselves through this route",
      );
    user.isActive = false;
    user.expoPushTokens = [];
    await user.save();
    await Slot.updateMany(
      {
        doctorId: user._id,
        status: "available",
        startTime: { $gt: new Date() },
      },
      { $set: { status: "available" } },
    );
    await writeAudit(req, "admin.user_deactivated", "User", user._id);
    sendSuccess(res, null, "User deactivated");
  }),
);

export default router;
