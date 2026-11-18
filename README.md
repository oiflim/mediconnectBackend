url = https://mediconnectbackend-icd4.onrender.com/
check Health = https://mediconnectbackend-icd4.onrender.com/api/health




From hospital-backend, run npm run db:indexes if you haven’t run the schema migration, then npm run seed:admin. I updated seedAdmin.js so it creates or promotes the MongoDB admin without requiring a password.


# add login info of admin

npm run db:indexes
npm run seed:admin


# MediConnect Hospital Backend

Node.js 20+, Express 4 (ES modules), MongoDB/Mongoose 8 REST API for the MediConnect Expo/React Native application. The backend is designed to wrap the user's already-working FastAPI chest-X-ray model service; it does **not** replace, retrain, or modify the model or its artifacts.

## Architecture

```text
Expo app
  | Clerk Google OAuth + Bearer session token
  v
Express API :5000
  |-- Clerk: verifies session tokens and verified email identity
  |-- MongoDB/Mongoose: account linking, roles, slots, medicines, records, notifications, audit logs
  |-- ImageKit: private medical attachments + short-lived signed downloads
  |-- Existing FastAPI service :8000: POST /predict (multipart field: file)
  `-- Expo Push Service: best-effort device push
```

The handover's frontend API base URL remains `https://mediconnectnoai.onrender.com/api`. For local Postman tests use `http://localhost:5000` as `baseUrl`; do not append `/api` twice.

## Roles

Exact, case-sensitive roles: `patient`, `doctor`, `medicine_manager`, `diagnosis_lab_manager`, `admin`.

Public registration always creates a patient. The seeded administrator promotes eligible accounts to staff roles. Role and ownership checks run on the server; client-side screen hiding is not security.

## Local setup (Windows PowerShell)

1. Install Node.js 20+ and MongoDB locally, or create a MongoDB Atlas database.
2. Open this folder and run:

   ```powershell
   npm install
   Copy-Item .env.example .env
   ```
3. Edit `.env`. Set `MONGODB_URI`, long random `JWT_SECRET` and separate `OTP_HASH_SECRET`, the Clerk publishable key, Gmail SMTP App Password, ImageKit credentials and the ML URL. Keep `CLERK_SECRET_KEY` private and out of Git; Clerk sign-in requires it, while other API routes can start without it.
4. In the Clerk Dashboard, enable Google as a social connection and enable the Native API. Set the Publishable Key as `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in both `MediConnect_Expo_App/.env` and this backend `.env`. The backend still accepts the legacy `CLERK_PUBLISHABLE_KEY` name as a fallback. Set the Clerk Secret Key only in the backend `.env` as `CLERK_SECRET_KEY`; never put it in the Expo app.
5. Add the Expo app's Android package (`com.mediconnect.app`) and iOS bundle identifier (`com.mediconnect.app`) under Clerk's Native applications before creating production builds.
6. For local Postman testing only, `OTP_EXPOSE_IN_DEV=true` may return a `developmentOtp` when `NODE_ENV=development`. Keep this option false in production.
7. Set `ADMIN_EMAIL` to the verified Google email that will be used in Clerk, set `ADMIN_ID_CARD_NUMBER`, then seed the MongoDB admin and start the API:

   ```powershell
   npm run db:indexes
   npm run seed:admin
   npm run dev
   ```
8. Check `GET http://localhost:5000/api/health`.

The seed command creates/promotes the MongoDB user with the `admin` role; it does not create a Clerk user. Sign up or sign in through Google in the app using the same email. The Clerk session endpoint links that verified Clerk user to the MongoDB admin record. A Clerk password is not needed.

Generate secrets with PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```
Run it twice and use different values for `JWT_SECRET` and `OTP_HASH_SECRET`.

## Existing AI/ML service integration

Keep your working Python model project and trained weights in their current location. Start it using its existing command, for example:

```powershell
cd path\to\your-existing-ml-service
.\.venv\Scripts\Activate.ps1
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

The supplied `main.py` in the handover exposes `POST /predict` with multipart field `file` and returns `{ "success": true, "result": { ... } }`. Configure:

```env
PNEUMONIA_API_URL=http://127.0.0.1:8000/predict
PNEUMONIA_HEALTH_URL=http://127.0.0.1:8000/
PNEUMONIA_TIMEOUT_MS=120000
```

The API uploads the original report to ImageKit, then forwards the JPG/PNG bytes to FastAPI when `reportType=chest_xray`. The returned `result` object is saved in the same MongoDB `MedicalRecord.aiPrediction` field with `status=completed`. If inference is unavailable, the report is still saved with `status=failed`; the response must not be interpreted as a diagnosis. PDF reports are stored but never sent to the image model.

**Deployment note:** `127.0.0.1` works only when Express and FastAPI share the same machine/container network. If they are deployed as separate services, set `PNEUMONIA_API_URL` to a private/reachable FastAPI URL. Do not expose an unauthenticated ML service publicly. The sample FastAPI code shown in the handover does not enforce an API key; the optional Express header alone does not secure that service.

## API catalogue

All paths are relative to the host; all are mounted under `/api`.

### Health
| Method | Path | Access |
|---|---|---|
| GET | `/api/health` | Public |

### Authentication
| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register patient |
| POST | `/api/auth/login` | Public | Validate email/password/ID card and send OTP |
| POST | `/api/auth/verify-otp` | Public | Verify OTP and return JWT |
| POST | `/api/auth/resend-otp` | Public | Resend OTP subject to cooldown |
| POST | `/api/auth/session` | Clerk-authenticated | Link a verified Clerk email to its MongoDB account or request an ID number |
| POST | `/api/auth/complete-profile` | Clerk-authenticated | Link an unused ID number or create a patient account |
| GET | `/api/auth/me` | Authenticated | Own MongoDB profile and role |
| PATCH | `/api/auth/me` | Authenticated | Update own name; doctors may also update experienceYears and specialization |
| DELETE | `/api/auth/me` | Authenticated | Soft-deactivate own account |

### Administration
| Method | Path | Access |
|---|---|---|
| GET | `/api/admin/users` | Admin |
| PATCH | `/api/admin/users/role` | Admin |
| PATCH | `/api/admin/users/active` | Admin |
| PATCH | `/api/admin/users/:userId` | Admin |
| DELETE | `/api/admin/users/:userId` | Admin; cannot deactivate current admin |

### Doctors and slots
| Method | Path | Access |
|---|---|---|
| GET | `/api/slots/doctors` | Authenticated; includes doctor experienceYears and specialization |
| POST | `/api/slots/availability` | Doctor |
| GET | `/api/slots/doctors/:doctorId/slots` | Authenticated |
| PATCH | `/api/slots/slots/:slotId` | Owning doctor or admin; unbooked future slot |
| DELETE | `/api/slots/slots/:slotId` | Owning doctor or admin; unbooked future slot |

Slot durations: 5, 10, 15, 20, 30, or 60 minutes. A window must divide evenly; maximum 500 generated slots per request. Use timezone-offset-aware ISO date/time values.

### Bookings
| Method | Path | Access |
|---|---|---|
| POST | `/api/bookings` | Patient; body `{ "slotId": "..." }` |
| GET | `/api/bookings/my` | Patient or doctor |
| GET | `/api/bookings/all` | Admin |
| PATCH | `/api/bookings/:slotId/reschedule` | Patient; body `{ "newSlotId": "..." }` |
| DELETE | `/api/bookings/:slotId` | Patient / owning doctor / admin |
| PATCH | `/api/bookings/:slotId/cancel` | Patient legacy route |
| PATCH | `/api/bookings/:slotId/doctor-cancel` | Owning doctor |
| PATCH | `/api/bookings/:slotId/admin-cancel` | Admin |

Slot booking uses a conditional atomic MongoDB update so only one patient can claim a slot. Rescheduling reserves the new same-doctor slot first and compensates if the original booking cannot be released.

### Medicines
| Method | Path | Access |
|---|---|---|
| POST | `/api/medicines` | Medicine manager / admin |
| GET | `/api/medicines` | Authenticated; `search`, `category`, `isActive`, `limit` filters |
| GET | `/api/medicines/low-stock` | Authenticated |
| GET | `/api/medicines/expired` | Authenticated |
| GET | `/api/medicines/:id` | Authenticated |
| PATCH | `/api/medicines/:id/stock` | Medicine manager / admin; `{ "type": "add|remove", "amount": 5 }` |
| PATCH | `/api/medicines/:id` | Medicine manager / admin |
| DELETE | `/api/medicines/:id` | Medicine manager / admin |

`availabilityStatus` is a computed value: `INACTIVE`, `EXPIRED`, `OUT_OF_STOCK`, `LOW_STOCK`, `AVAILABLE`.

### Clinical records and AI
| Method | Path | Access |
|---|---|---|
| GET | `/api/records/my` | Patient |
| GET | `/api/records/my/ai-predictions` | Patient |
| GET | `/api/records/patient/:idCardNumber` | Doctor / lab manager / admin |
| GET | `/api/records/patient/:idCardNumber/ai-predictions` | Doctor / lab manager / admin |
| POST | `/api/records/lab-reports` | Lab manager / admin; multipart |
| PATCH | `/api/records/lab-reports/by-card/:idCardNumber` | Lab manager / admin; latest report created by caller or admin |
| PATCH | `/api/records/lab-reports/:recordId` | Lab manager / admin; own report or admin |
| POST | `/api/records/prescriptions` | Doctor / admin; JSON or multipart |
| PATCH | `/api/records/:recordId` | Creator doctor/lab manager or admin |
| DELETE | `/api/records/:recordId` | Creator doctor/lab manager or admin; soft-delete |
| GET | `/api/records/:recordId/file` | Patient owner / authorized staff / admin |

Lab-report multipart text fields: `idCardNumber`, `reportType`, `title`, `diagnosis`, `notes`, optional `recordedAt`; required file field `file`. For inference use `reportType=chest_xray` and JPG/PNG. The same field can accept a PDF for normal records. Prescription JSON example:

```json
{
  "idCardNumber": "MC10001",
  "title": "Consultation prescription",
  "diagnosis": "Example diagnosis",
  "notes": "Take as instructed by the clinician.",
  "medicines": [{
    "name": "Paracetamol 500mg",
    "dosage": "1 tablet",
    "frequency": "As prescribed",
    "duration": "3 days",
    "instructions": "After food"
  }]
}
```

AI results are assistance only, never a diagnosis or treatment instruction. Clinical review, model validation, calibration evaluation, and appropriate patient-data governance are required before real patient use.

### Notifications
| Method | Path | Access |
|---|---|---|
| GET | `/api/notifications/me` | Authenticated |
| POST | `/api/notifications/device-token` | Authenticated; `{ "token": "ExponentPushToken[...]" }` |
| PATCH | `/api/notifications/read-all` | Authenticated |
| PATCH | `/api/notifications/:notificationId/read` | Recipient only |
| DELETE | `/api/notifications/:notificationId` | Recipient only |
| POST | `/api/notifications` | Admin / doctor / lab manager; patient context authorization |

In-app notification is persisted in MongoDB independently of Expo delivery. Push delivery is best-effort; register device tokens from the Expo app and refresh after token rotation.

## Clerk authentication details

- The Expo app signs in or registers through Clerk-hosted Google OAuth. Configure the Google connection in Clerk; the app does not collect Google passwords.
- The backend verifies the Clerk session token against the instance JWKS, then fetches the user profile with the server-only Clerk Secret Key to obtain the verified primary email.
- On the first sign-in, a verified email with an existing MongoDB ID number is linked automatically. Otherwise, the user must enter an ID number. An existing account can only be linked when its email matches; a new account is created with the `patient` role. Duplicate ID numbers and accounts already linked to a different Clerk identity are rejected.
- Staff roles are never accepted from Clerk or from the ID-number form. Every protected request loads the active user's role from MongoDB, and the existing server-side role checks remain authoritative.
- The Expo app and backend use `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`; the backend also requires `CLERK_SECRET_KEY`. Only the publishable key is safe to expose to the client.
- The indexes command migrates the old unique ID-number index to a sparse unique index so accounts can exist before ID-number onboarding. Run `npm run db:indexes` after deploying this schema update.
- Legacy password/OTP endpoints remain available for existing API clients, but the Expo app uses Clerk.

## Postman

Import `postman/Hospital-Expo-Backend.postman_collection.json`. See `postman/TEST_GUIDE.md` for the recommended sequence and examples. Use unique synthetic demo identities and non-sensitive test images only.

## Production checklist (not a claim that integrations are already verified)

- Deploy current backend code and configure environment variables in the hosting provider; a local ZIP does not update the existing Render deployment.
- Use MongoDB Atlas with restricted network access and backups. Run `npm run db:indexes` for a new deployment and verify indexes after deployment.
- Use Gmail App Password or OAuth credentials; no personal Gmail password. Disable OTP development exposure.
- Use HTTPS, correct restrictive `CLIENT_ORIGIN`, strong separate secrets, and a private/reachable ML service.
- Configure ImageKit private files and verify the signed-download behavior under the deployed account/SDK. The backend uses the current `@imagekit/nodejs` SDK.
- Configure Expo credentials only if required by the Expo project.
- Verify all live integrations with synthetic records. Test unauthorized access and simultaneous booking conflicts.
- Define medical-record retention, audit, backup, incident-response, and applicable privacy/compliance requirements with the organization before real patient deployment.
- Run `npm run check` and `npm test`; they are static/unit checks, not live-service acceptance tests.

## Important implementation notes

This is a fresh backend baseline generated from the uploaded handover because no current backend source ZIP/repository was attached. Compare API contracts with your actual Expo client before integration. The FastAPI model is deliberately left external. Upload your existing source ZIP to merge/align without overwriting the working model files or weights.
