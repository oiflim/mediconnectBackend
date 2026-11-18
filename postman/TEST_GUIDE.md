# MediConnect Postman Test Guide

## 1. Import and configure

Import `Hospital-Expo-Backend.postman_collection.json`. Set collection variables:

- `baseUrl`: `http://localhost:5000`
- `mlBaseUrl`: `http://127.0.0.1:8000`
- `adminEmail`, `adminPassword`, `adminIdCard`
- Candidate patient/doctor/medicine-manager/lab-manager identities and ID cards
- Role-specific access tokens (the collection stores them after OTP verification when using the included scripts)

Start MongoDB, the Express backend, and your existing FastAPI service before testing. Confirm `GET {{baseUrl}}/api/health` reports MongoDB connected and ML service reachable.

For a local OTP test, set `OTP_EXPOSE_IN_DEV=true` in `.env`, restart the backend, and read `developmentOtp` in the login response. This must remain false in production. Alternatively, read the OTP from Gmail. Copy the returned `challengeId` into the matching collection variable, enter the six-digit OTP, verify it, then copy the returned `accessToken` into the appropriate role token variable (for example `adminToken` or `patientToken`).

## 2. Recommended flow

1. Health check.
2. Register a patient, doctor candidate, medicine-manager candidate, and lab-manager candidate. Registration always creates patients.
3. Seed the admin using `npm run seed:admin`; login admin, read OTP, verify, and save `adminToken`.
4. Use admin role-management requests to promote the candidates to `doctor`, `medicine_manager`, and `diagnosis_lab_manager`.
5. Log in separately as each account and verify OTP. Save role tokens in collection variables.
6. Doctor creates a future availability window. Patient lists doctors/slots and books an available slot. Verify both `/bookings/my` views.
7. Test patient reschedule/cancel, doctor cancellation, and admin cancellation using separate future demo bookings.
8. Medicine manager creates a test medicine, reads it, adds/removes stock, edits and deletes it. Verify low-stock and expired views.
9. Lab manager uploads a synthetic PDF report and a non-sensitive JPG/PNG with `reportType=chest_xray`. Use Body -> form-data; the file field name must be exactly `file`.
10. Check the patient's `/records/my` and `/records/my/ai-predictions`; staff can query patient history by ID card. Confirm the result JSON contains the model's `prediction`, `confidence`, and calibrated probability fields.
11. Doctor creates a prescription; patient verifies it appears in their records.
12. Register an Expo token (only with a real test app/device), send an authorized notification, fetch it as recipient, mark read, and delete.
13. Update each user's own profile with `currentPassword`, including changing a test ID-card number. Confirm existing patient records remain accessible.
14. Test protected file access as the owner, as authorized staff, and as an unrelated patient (unrelated patient must be denied).
15. Test soft deactivation last, using disposable demo accounts only.

## 3. Common payloads

Registration:

```json
{
  "name": "Demo Patient",
  "email": "patient.demo@example.com",
  "password": "DemoStrongPassword123!",
  "idCardNumber": "MC-DEMO-1001"
}
```

Login:

```json
{
  "email": "patient.demo@example.com",
  "password": "DemoStrongPassword123!",
  "idCardNumber": "MC-DEMO-1001"
}
```

OTP verification:

```json
{ "challengeId": "CHALLENGE_ID_FROM_LOGIN", "otp": "123456" }
```

Create availability (use future dates with timezone offset):

```json
{
  "startTime": "2030-01-15T09:00:00+05:30",
  "endTime": "2030-01-15T11:00:00+05:30",
  "slotDurationMinutes": 10
}
```

Book slot:

```json
{ "slotId": "AVAILABLE_SLOT_OBJECT_ID" }
```

Reschedule:

```json
{ "newSlotId": "ANOTHER_AVAILABLE_SLOT_OBJECT_ID" }
```

Create medicine:

```json
{
  "name": "Demo Paracetamol",
  "genericName": "Paracetamol",
  "category": "Analgesic",
  "batchNumber": "DEMO-BATCH-001",
  "quantity": 100,
  "reorderLevel": 20,
  "expiryDate": "2030-12-31T00:00:00.000Z",
  "unit": "tablet",
  "manufacturer": "Demo Manufacturer"
}
```

## 4. Negative/security tests

- Patient must receive 403 on `/api/admin/users`, `/api/medicines` POST/PATCH/DELETE, and lab-report upload.
- Doctor must not update another doctor's slot or another doctor's prescription.
- Medicine manager must not create prescriptions or upload lab reports.
- A patient cannot fetch another patient's records or protected files.
- OTP expires, resend cooldown is enforced, wrong OTP attempts are capped, and JWT is unavailable until OTP verification.
- A second patient attempting to book the same slot receives a conflict/not-available response.
- No role field sent during public registration may create a privileged user.
- Never test deactivation on an account you need to keep.

## 5. Notes

Use synthetic patient identifiers and test images. Do not use real patient X-rays or records in development/staging without authorization. A passing Postman collection against local services does not establish production readiness; separately test Gmail, MongoDB Atlas, ImageKit, Expo push, and deployed FastAPI connectivity.
