# API Reference

Base URL: `https://resume-analyzer-full-stack.onrender.com` (production) or `http://localhost:3000` (local dev).

All routes are prefixed with `/api/v1` (the version segment is configurable via the `API_VERSION` env var, default `v1`).

## Auth

Authentication is **cookie-only** — a JWT is set as an httpOnly `token` cookie on register/login. There is no bearer-token / `Authorization`-header support anywhere in the API. Requests to private endpoints must include this cookie (`credentials: "include"` on the client).

- `secure` is `true` only when `NODE_ENV=production`.
- `sameSite` is `"none"` in production (required for the cross-origin Vercel ↔ Render setup) and `"strict"` locally.
- Cookie `maxAge` / JWT expiry: 1 day.

A private endpoint with no/invalid/blacklisted token returns `401`.

## Error Shape

Unhandled errors fall through to a single error middleware:

```json
{
  "message": "string",
  "stack": "included only when NODE_ENV !== \"production\""
}
```

Status code defaults to `500` unless the thrown error sets `statusCode`. Validation errors (Zod, via `validate` middleware) return `400`:

```json
{
  "message": "validation failed",
  "errors": [{ "field": "email", "message": "Invalid email" }]
}
```

---

## Auth Resource

### `POST /api/v1/auth/register`

- **Auth:** none
- **Body:**
  ```json
  { "email": "string (valid email)", "username": "string (min 3 chars)", "password": "string (min 6 chars)" }
  ```
- **Success — `201`:**
  ```json
  { "message": "user created successfully", "user": { "id": "string", "username": "string", "email": "string" } }
  ```
  Also sets the `token` cookie.
- **Errors:**
  - `400` — validation failed (see Error Shape above)
  - `400` — `{ "message": "account already exists with this email address or username" }`

### `POST /api/v1/auth/login`

- **Auth:** none
- **Body:**
  ```json
  { "email": "string (valid email)", "password": "string (non-empty)" }
  ```
- **Success — `200`:**
  ```json
  { "message": "user loggedIn succesfully", "user": { "id": "string", "username": "string", "email": "string" } }
  ```
  Also sets the `token` cookie.
- **Errors:**
  - `400` — validation failed
  - `400` — `{ "message": "invalid email or password" }` (used for both unknown email and wrong password, deliberately not distinguished)

### `GET /api/v1/auth/logout`

- **Auth:** none required (works whether or not a valid cookie is present)
- **Success — `200`:** `{ "message": "user logged out successfully" }`
- **Behavior:** if a `token` cookie is present, it's added to the Redis blacklist (`blacklist:<token>`) for its remaining lifetime, and the cookie is cleared.

### `GET /api/v1/auth/get-me`

- **Auth:** required (JWT cookie)
- **Success — `200`:**
  ```json
  { "message": "user details fetched successfully", "user": { "id": "string", "username": "string", "email": "string" } }
  ```
- **Errors:** `401` if not authenticated.

---

## Interview Reports Resource

### `POST /api/v1/interview/`

Enqueues interview-report generation as a background job.

- **Auth:** required
- **Required headers:** `Idempotency-Key`
- **Body:** `multipart/form-data`
  - `resume` — file, PDF only, required (multer, 3 MB limit, rejects non-`application/pdf` with a `400`)
  - `jobDescriptionFile` — file, PDF, optional
  - `selfDescriptionFile` — file, PDF, optional
  - `jobDescription` — text field, optional (required if `jobDescriptionFile` not provided)
  - `selfDescription` — text field, optional (required if `selfDescriptionFile` not provided)
- **Success — `202`:** `{ "message": "Report generation started", "jobId": "string" }`
- **Errors:**
  - `400` — `{ "message": "Job description is required, either as text or a PDF upload" }`
  - `400` — `{ "message": "Self description is required, either as text or a PDF upload" }`
  - `400` — `{ "message": "Idempotency-Key header is required" }`
  - `409` — `{ "message": "A request with this idempotency key is already being processed." }`
  - `202` (idempotent replay) — `{ "message": "Request already processed", "jobId": "string" }` if the same key was already completed
  - `401` — not authenticated

### `GET /api/v1/interview/status/:jobId`

Polls the status of a report-generation job.

- **Auth:** required (job must belong to the requesting user)
- **Success — `200`:**
  ```json
  {
    "message": "job status fetched successfully",
    "jobId": "string",
    "state": "waiting | active | completed | failed | ...",
    "result": { "interviewReportId": "string" },
    "failedReason": "string"
  }
  ```
  `result` is present only when `state` is `"completed"`; `failedReason` only when `state` is `"failed"`.
- **Errors:** `404` — `{ "message": "job not found" }` (returned both when the job genuinely doesn't exist and when it belongs to another user)

### `GET /api/v1/interview/report/:interviewId`

Fetches a completed interview report by ID.

- **Auth:** required (report must belong to the requesting user)
- **Success — `200`:** `{ "message": "interview report fetched successfully.", "interviewReport": { /* full document, see Data Shapes below */ } }`
- **Errors:** `404` — `{ "message": "interview report not found" }`

### `GET /api/v1/interview/`

Lists all interview reports belonging to the current user, newest first, with heavy fields excluded.

- **Auth:** required
- **Success — `200`:**
  ```json
  {
    "message": "Interview reports fetched successfully.",
    "interviewReports": [
      { "_id": "string", "user": "string", "matchScore": 0, "generatedBy": "gemini", "title": "string", "createdAt": "date", "updatedAt": "date" }
    ]
  }
  ```
  `resume`, `selfDescription`, `jobDescription`, `technicalQuestions`, `behavioralQuestions`, `skillGaps`, `preparationPlan`, and `__v` are excluded from this list view.

---

## Resume PDF Resource

### `POST /api/v1/interview/resume-pdf/:reportId`

Enqueues a tailored, ATS-friendly resume PDF generation job for an existing interview report.

- **Auth:** required (report must belong to the requesting user)
- **Required headers:** `Idempotency-Key` (separate key space from the report-generation endpoint above — the same raw key value can be reused across the two without colliding)
- **Body:** none
- **Success — `202`:** `{ "message": "Resume PDF generation started", "jobId": "string" }`
- **Errors:**
  - `404` — `{ "message": "interview report not found" }` (nonexistent report or belongs to another user; nothing is enqueued)
  - `400` — `{ "message": "Idempotency-Key header is required" }`
  - `409` — `{ "message": "A request with this idempotency key is already being processed." }`
  - `202` (idempotent replay) — `{ "message": "Request already processed", "jobId": "string" }`

### `GET /api/v1/interview/resume-pdf/status/:jobId`

Polls the status of a resume-PDF generation job.

- **Auth:** required (job must belong to the requesting user)
- **Success — `200`:**
  ```json
  {
    "message": "job status fetched successfully",
    "jobId": "string",
    "state": "waiting | active | completed | failed | ...",
    "result": { "pdfId": "string" },
    "failedReason": "string"
  }
  ```
  `result` present only when `completed`; `failedReason` only when `failed`.
- **Errors:** `404` — `{ "message": "job not found" }`

### `GET /api/v1/interview/resume-pdf/:id`

Downloads a generated resume PDF.

- **Auth:** required (PDF document must belong to the requesting user)
- **Success — `200`:** binary `application/pdf`, `Content-Disposition: attachment; filename="resume.pdf"`
- **Errors:** `404` — `{ "message": "This download has expired — please generate a new one." }` — covers a nonexistent ID, a PDF belonging to another user, and a PDF whose 2-hour TTL has already expired, all with the same response.

> Note: this route must be registered after `GET /resume-pdf/status/:jobId` in the router, or Express would match `"status"` as the `:id` param — mentioned here since it affects how new routes under `/resume-pdf/` must be ordered.

---

## Data Shapes

### `interviewReport` document

```json
{
  "_id": "string",
  "user": "string",
  "jobDescription": "string",
  "resume": "string",
  "selfDescription": "string",
  "matchScore": "number (0-100)",
  "technicalQuestions": [{ "question": "string", "intention": "string", "answer": "string" }],
  "behavioralQuestions": [{ "question": "string", "intention": "string", "answer": "string" }],
  "skillGaps": [{ "skill": "string", "severity": "low | medium | high" }],
  "preparationPlan": [{ "day": "number", "focus": "string", "tasks": ["string"] }],
  "generatedBy": "gemini | groq",
  "title": "string",
  "createdAt": "date",
  "updatedAt": "date"
}
```

### `user` (as returned by auth endpoints)

```json
{ "id": "string", "username": "string", "email": "string" }
```

Passwords are hashed with bcrypt and never returned in any response.
