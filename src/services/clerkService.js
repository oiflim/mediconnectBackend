import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env.js";
import { unauthorized, unavailable } from "../utils/errors.js";

let clerkConfig;

function getClerkConfig() {
  if (clerkConfig) return clerkConfig;
  const key = env.clerkPublishableKey;
  const encodedHost = key.replace(/^pk_(test|live)_/, "");
  if (!encodedHost || encodedHost === key) {
    throw unavailable("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is invalid");
  }
  const host = Buffer.from(encodedHost, "base64").toString("utf8").replace(/\$$/, "");
  if (!/^[a-z0-9.-]+$/i.test(host)) {
    throw unavailable("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY does not contain a valid Clerk domain");
  }
  const issuer = `https://${host}`;
  clerkConfig = {
    issuer,
    jwks: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)),
  };
  return clerkConfig;
}

export function isClerkSessionToken(token) {
  const { issuer } = getClerkConfig();
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload.iss === issuer;
  } catch {
    return false;
  }
}

export async function verifyClerkSessionToken(token) {
  const { issuer, jwks } = getClerkConfig();
  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, {
      algorithms: ["RS256"],
      issuer,
    }));
  } catch (error) {
    if (error?.code?.startsWith("ERR_JWT") || error?.code?.startsWith("ERR_JWS")) {
      console.warn("Clerk session verification failed:", error.code);
      throw unauthorized("Clerk session is invalid or expired");
    }
    throw unavailable("Unable to verify the Clerk session");
  }
  if (typeof payload.sub !== "string" || !payload.sub.startsWith("user_")) {
    throw unauthorized("Clerk session does not identify a user");
  }
  return { userId: payload.sub };
}

export async function getClerkUserProfile(userId) {
  if (!/^sk_(test|live)_/.test(env.clerkSecretKey)) {
    throw unavailable(
      "Set a valid Clerk secret key (sk_test_... or sk_live_...) as CLERK_SECRET_KEY in the backend environment; do not use the publishable key",
    );
  }
  let response;
  try {
    response = await fetch(
      `https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`,
      {
        headers: { Authorization: `Bearer ${env.clerkSecretKey}` },
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    throw unavailable("Unable to retrieve the Clerk user profile");
  }
  if (response.status === 404) {
    throw unauthorized("Clerk user no longer exists");
  }
  if (!response.ok) {
    throw unavailable("Clerk could not verify the user profile");
  }
  const profile = await response.json();
  const primaryEmail = profile.email_addresses?.find(
    (address) => address.id === profile.primary_email_address_id,
  );
  if (!primaryEmail?.email_address || primaryEmail.verification?.status !== "verified") {
    throw unauthorized("A verified primary email address is required");
  }
  const email = primaryEmail.email_address.trim().toLowerCase();
  const name = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || email.split("@")[0];
  return { id: profile.id, email, name };
}
