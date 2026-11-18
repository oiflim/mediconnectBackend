import { Router } from "express";
import { randomUUID } from "node:crypto";
import User from "../models/User.js";
import EmailOtp from "../models/EmailOtp.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import {
  AppError,
  badRequest,
  unauthorized,
  notFound,
  forbidden,
  conflict,
} from "../utils/errors.js";
import {
  generateOtp,
  hashOtp,
  safeEqualHex,
  signAccessToken,
} from "../utils/security.js";
import { env } from "../config/env.js";
import { requireAuth, requireClerkIdentity } from "../middleware/auth.js";
import { sendLoginOtp } from "../services/emailService.js";
import { writeAudit } from "../services/auditService.js";
import { getClerkUserProfile } from "../services/clerkService.js";

const router = Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function cleanEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}
function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8)
    throw badRequest("Password must contain at least 8 characters");
}
function authenticatedUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    idCardNumber: user.idCardNumber,
    role: user.role,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    experienceYears: user.experienceYears,
    specialization: user.specialization,
  };
}
async function issueOtp(user) {
  const otp = generateOtp();
  const now = new Date();
  const challengeId = randomUUID();
  const challenge = await EmailOtp.findOneAndUpdate(
    { userId: user._id, purpose: "login" },
    {
      $set: {
        challengeId,
        otpHash: hashOtp(user._id, otp),
        expiresAt: new Date(now.getTime() + env.otpTtlMinutes * 60_000),
        attempts: 0,
        resendAvailableAt: new Date(
          now.getTime() + env.otpResendSeconds * 1000,
        ),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  try {
    await sendLoginOtp({
      to: user.email,
      name: user.name,
      otp,
      ttlMinutes: env.otpTtlMinutes,
    });
  } catch (error) {
    await EmailOtp.deleteOne({ _id: challenge._id });
    throw error;
  }
  return {
    challengeId,
    ...(env.nodeEnv === "development" && env.otpExposeInDev
      ? { developmentOtp: otp }
      : {}),
  };
}

router.post(
  "/session",
  requireClerkIdentity,
  asyncHandler(async (req, res) => {
    const identity = await getClerkUserProfile(req.clerkIdentity.userId);
    let user = await User.findOne({
      clerkUserId: identity.id,
    }).select("+clerkUserId +idCardNumber");
    if (!user) {
      user = await User.findOne({ email: identity.email }).select(
        "+clerkUserId +idCardNumber",
      );
    }
    if (user?.clerkUserId && user.clerkUserId !== identity.id) {
      throw conflict("This account is already linked to another Clerk user");
    }
    if (user && user.email !== identity.email) {
      throw conflict("The linked account email no longer matches Clerk");
    }
    if (user && !user.isActive) {
      throw unauthorized("This account is deactivated");
    }
    if (!user?.idCardNumber) {
      sendSuccess(res, { needsIdCardNumber: true });
      return;
    }
    user.clerkUserId = identity.id;
    user.emailVerified = true;
    await user.save();
    req.user = user;
    await writeAudit(req, "auth.clerk_session", "User", user._id);
    sendSuccess(res, { user: authenticatedUser(user) });
  }),
);

router.post(
  "/complete-profile",
  requireClerkIdentity,
  asyncHandler(async (req, res) => {
    const identity = await getClerkUserProfile(req.clerkIdentity.userId);
    const idCardNumber = String(req.body?.idCardNumber || "")
      .trim()
      .toUpperCase();
    if (!idCardNumber) throw badRequest("idCardNumber is required");

    let user = await User.findOne({ clerkUserId: identity.id }).select(
      "+clerkUserId +idCardNumber",
    );
    const emailUser = await User.findOne({ email: identity.email }).select(
      "+clerkUserId +idCardNumber",
    );
    if (user && user.email !== identity.email) {
      throw conflict("The linked account email no longer matches Clerk");
    }
    if (!user) user = emailUser;
    if (user?.clerkUserId && user.clerkUserId !== identity.id) {
      throw conflict("This account is already linked to another Clerk user");
    }
    if (user?.idCardNumber && user.idCardNumber !== idCardNumber) {
      throw conflict("This email is already linked to a different ID number");
    }
    if (user && !user.isActive) {
      throw unauthorized("This account is deactivated");
    }
    const cardOwner = await User.findOne({ idCardNumber }).select("_id");
    if (cardOwner && (!user || !cardOwner._id.equals(user._id))) {
      throw conflict("This ID number is already linked to another account");
    }

    if (!user) {
      user = new User({
        name: identity.name,
        email: identity.email,
        idCardNumber,
        clerkUserId: identity.id,
        role: "patient",
        emailVerified: true,
      });
    } else {
      user.idCardNumber = idCardNumber;
      user.clerkUserId = identity.id;
      user.emailVerified = true;
    }
    await user.save();
    req.user = user;
    await writeAudit(req, "account.clerk_linked", "User", user._id, {
      role: user.role,
    });
    sendSuccess(res, { user: authenticatedUser(user) }, "ID number linked");
  }),
);

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { name, password } = req.body || {};
    const email = cleanEmail(req.body?.email);
    const idCardNumber = String(req.body?.idCardNumber || "")
      .trim()
      .toUpperCase();
    if (!name || !emailPattern.test(email) || !idCardNumber)
      throw badRequest(
        "name, valid email, password, and idCardNumber are required",
      );
    validatePassword(password);
    const existing = await User.findOne({ $or: [{ email }, { idCardNumber }] });
    if (existing)
      throw conflict("An account already uses this email or ID-card number");
    const user = await User.create({
      name: String(name).trim(),
      email,
      password,
      idCardNumber,
      role: "patient",
    });
    await writeAudit(req, "account.registered", "User", user._id, {
      role: "patient",
    });
    sendSuccess(
      res,
      {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          emailVerified: user.emailVerified,
        },
      },
      "Patient account created. Sign in to verify your email with an OTP.",
      201,
    );
  }),
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const email = cleanEmail(req.body?.email);
    const password = req.body?.password;
    const idCardNumber = String(req.body?.idCardNumber || "")
      .trim()
      .toUpperCase();

    // Validate required fields
    if (!emailPattern.test(email) || !password || !idCardNumber) {
      throw badRequest("email, password, and idCardNumber are required");
    }

    // Find user and validate password
    const user = await User.findOne({ email }).select(
      "+password +idCardNumber",
    );

    if (!user || !user.password || !(await user.comparePassword(password))) {
      throw unauthorized("Email or password is incorrect");
    }

    // Check account status
    if (!user.isActive) {
      throw unauthorized("This account is deactivated");
    }

    // Verify ID-card number
    if (user.idCardNumber !== idCardNumber) {
      throw unauthorized("ID-card number does not match this account");
    }

    // ==========================================
    // TEMPORARY: GMAIL OTP LOGIN DISABLED
    // ==========================================

    // OLD OTP LOGIN:
    // const result = await issueOtp(user);
    // sendSuccess(res, result, 'A login OTP has been sent to your registered email');

    // NEW DIRECT LOGIN:
    // Issue JWT immediately after credential validation.

    await writeAudit(req, "auth.password_login", "User", user._id);

    sendSuccess(
      res,
      {
        accessToken: signAccessToken(user),
        tokenType: "Bearer",
        expiresIn: env.jwtExpiresIn,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          emailVerified: user.emailVerified,
        },
      },
      "Login successful",
    );
  }),
);

router.post(
  "/verify-otp",
  asyncHandler(async (req, res) => {
    const { challengeId, otp } = req.body || {};
    if (!challengeId || !/^\d{6}$/.test(String(otp || "")))
      throw badRequest("challengeId and a six-digit otp are required");
    const challenge = await EmailOtp.findOne({ challengeId }).select(
      "+otpHash",
    );
    if (!challenge) throw unauthorized("OTP challenge is invalid or expired");
    if (challenge.expiresAt <= new Date()) {
      await challenge.deleteOne();
      throw unauthorized("OTP has expired; sign in again");
    }
    if (challenge.attempts >= env.otpMaxAttempts) {
      await challenge.deleteOne();
      throw unauthorized("OTP attempt limit reached; sign in again");
    }
    const candidateHash = hashOtp(challenge.userId, String(otp));
    if (!safeEqualHex(challenge.otpHash, candidateHash)) {
      challenge.attempts += 1;
      if (challenge.attempts >= env.otpMaxAttempts) await challenge.deleteOne();
      else await challenge.save();
      throw unauthorized("OTP is incorrect");
    }
    const user = await User.findById(challenge.userId);
    if (!user || !user.isActive) {
      await challenge.deleteOne();
      throw unauthorized("Account is unavailable");
    }
    user.emailVerified = true;
    await user.save();
    await challenge.deleteOne();
    await writeAudit(req, "auth.otp_verified", "User", user._id);
    sendSuccess(
      res,
      {
        accessToken: signAccessToken(user),
        tokenType: "Bearer",
        expiresIn: env.jwtExpiresIn,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          emailVerified: user.emailVerified,
        },
      },
      "Login successful",
    );
  }),
);

router.post(
  "/resend-otp",
  asyncHandler(async (req, res) => {
    const challenge = await EmailOtp.findOne({
      challengeId: req.body?.challengeId,
    });
    if (!challenge)
      throw notFound("OTP challenge not found or expired; sign in again");
    if (challenge.resendAvailableAt > new Date()) {
      const seconds = Math.ceil(
        (challenge.resendAvailableAt.getTime() - Date.now()) / 1000,
      );
      throw new AppError(
        429,
        `Please wait ${seconds} seconds before requesting another OTP`,
        "OTP_RESEND_COOLDOWN",
      );
    }
    const user = await User.findById(challenge.userId);
    if (!user || !user.isActive) throw unauthorized("Account is unavailable");
    const result = await issueOtp(user);
    sendSuccess(res, result, "A new login OTP has been sent");
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select("+idCardNumber");
    sendSuccess(res, {
      id: user._id,
      name: user.name,
      email: user.email,
      idCardNumber: user.idCardNumber,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      experienceYears: user.experienceYears,
      specialization: user.specialization,
    });
  }),
);

router.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      name,
      experienceYears: experienceYearsInput,
      specialization: specializationInput,
    } = req.body || {};
    const user = await User.findById(req.user._id).select("+idCardNumber");
    if (!user) throw unauthorized("Account is unavailable");
    const updates = {};
    if (
      (experienceYearsInput !== undefined ||
        specializationInput !== undefined) &&
      user.role !== "doctor"
    )
      throw forbidden("Only doctors can update professional details");
    if (name !== undefined) {
      if (!String(name).trim()) throw badRequest("name cannot be empty");
      updates.name = String(name).trim();
    }
    if (experienceYearsInput !== undefined) {
      if (experienceYearsInput === null || experienceYearsInput === "") {
        updates.experienceYears = null;
      } else {
        const experienceYears = Number(experienceYearsInput);
        if (
          !Number.isInteger(experienceYears) ||
          experienceYears < 0 ||
          experienceYears > 80
        )
          throw badRequest("experienceYears must be a whole number from 0 to 80");
        updates.experienceYears = experienceYears;
      }
    }
    if (specializationInput !== undefined) {
      const specialization =
        specializationInput == null ? "" : String(specializationInput).trim();
      if (specialization.length > 120)
        throw badRequest("specialization cannot exceed 120 characters");
      updates.specialization = specialization;
    }
    if (!Object.keys(updates).length)
      throw badRequest("No editable profile fields were supplied");
    Object.assign(user, updates);
    await user.save();
    await writeAudit(req, "profile.updated", "User", user._id, {
      changedFields: Object.keys(updates),
    });
    const fresh = await User.findById(user._id).select("+idCardNumber");
    sendSuccess(
      res,
      {
        id: fresh._id,
        name: fresh.name,
        email: fresh.email,
        idCardNumber: fresh.idCardNumber,
        role: fresh.role,
        emailVerified: fresh.emailVerified,
        experienceYears: fresh.experienceYears,
        specialization: fresh.specialization,
      },
      "Profile updated",
    );
  }),
);

router.delete(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) throw unauthorized("Account is unavailable");
    user.isActive = false;
    user.expoPushTokens = [];
    await user.save();
    await writeAudit(req, "account.deactivated", "User", user._id);
    sendSuccess(res, null, "Account deactivated");
  }),
);

export default router;
