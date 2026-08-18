# Resume Analyzer

AI-powered resume and interview-prep analysis, with async job processing, provider failover, and IDOR-hardened access control.

[![CI](https://github.com/PaladuguGeetesh/Resume_Analyzer_Full_Stack/actions/workflows/ci.yml/badge.svg)](https://github.com/PaladuguGeetesh/Resume_Analyzer_Full_Stack/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-26-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/mongodb-atlas-47A248?logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/redis-queues%20%2B%20cache-DC382D?logo=redis&logoColor=white)

## Live Demo

| | |
|---|---|
| **Frontend** | https://resume-analyzer-full-stack-xi.vercel.app |
| **Backend API** | https://resume-analyzer-full-stack.onrender.com |

> The backend is on Render's free tier, which spins down on inactivity — the first request after a period of idle can take 30–60s to respond while it cold-starts. Subsequent requests are fast.

## What This Is

Upload a resume, a job description, and a self-description (as text or PDF), and it generates a structured interview-prep report: technical and behavioral questions with model answers, a skill-gap analysis, and a day-by-day preparation plan. It can also generate a tailored, ATS-friendly resume PDF for the specific job description. Both operations call an LLM and (for the resume) render a PDF, so both are handled as background jobs rather than blocking the request.

## Engineering Highlights

| | |
|---|---|
| **IDOR fixed, permanently regression-tested** | A self-audit found report/job/PDF lookups that weren't scoped to the requesting user. Fixed by scoping every lookup to `{ _id, user: req.user.id }` and returning an identical `404` for "doesn't exist" and "not yours." Locked in by a dedicated suite (`interview.idor.test.js` + IDOR cases in `resumePdf.test.js`) so it can't silently regress. |
| **Two independent BullMQ queues/workers** | Report generation and resume-PDF generation each get their own queue, worker, and dedicated Redis connection — the API responds `202` immediately instead of holding the request open for a 30–60s AI call, and traffic on one queue can't starve the other. |
| **One circuit breaker shared across both AI call sites** | `opossum` binds one breaker instance to a single dispatcher function (`callPrimaryProvider({ type, params })`), so a sustained outage detected via report generation immediately fast-fails resume-PDF generation too, not just the feature that noticed it. Providers (Gemini / Groq) are swappable behind one env var, `AI_PRIMARY_PROVIDER`. |
| **Idempotency keys, scoped per endpoint** | Both job-submission endpoints require an `Idempotency-Key` header, claimed atomically in Redis via `SET ... EX ... NX` (not check-then-set, which has a real race under concurrent retries). Report and resume-PDF submissions use distinct key prefixes so the same raw key value can't collide across the two. |
| **Redis-backed JWT revocation** | Logout blacklists the token (`blacklist:<token>`, TTL'd to the token's own remaining lifetime), so a logged-out cookie is rejected server-side immediately — not just cleared client-side while remaining valid until natural expiry. |
| **28-test automated suite** | Jest + Supertest + mongodb-memory-server + ioredis-mock on the backend (28 tests / 5 suites), Vitest + React Testing Library on the frontend — including dedicated IDOR and circuit-breaker regression suites. |
| **Containerized, CI-gated, auto-deployed** | Full stack runs via Docker Compose. GitHub Actions runs both test suites plus a frontend build on every push/PR to `main`; merging auto-deploys to Render (backend) and Vercel (frontend) independently. |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 (Vite), React Router, Axios, SCSS |
| Backend | Node.js 26, Express |
| Database | MongoDB (Mongoose), MongoDB Atlas in production |
| Cache / Queue | Redis, BullMQ (two independent queues + workers) |
| AI Providers | Google Gemini (`@google/genai`), Groq — behind a shared provider abstraction + circuit breaker |
| PDF Generation | Puppeteer (headless Chromium) |
| Testing | Jest, Supertest, mongodb-memory-server, ioredis-mock (backend) · Vitest, React Testing Library (frontend) |
| DevOps / Deploy | Docker, Docker Compose, GitHub Actions (CI), Render (backend), Vercel (frontend) |

## Architecture

![Architecture diagram](docs/architecture-diagram.png)

The client (React, on Vercel) calls an Express API (on Render) over REST/JSON, authenticated via an httpOnly JWT cookie. The API reads/writes MongoDB Atlas directly and uses Redis for auth (blacklist) and idempotency, but never does AI or PDF work inline — it enqueues onto one of two independent BullMQ queues and returns immediately. Each queue's worker calls its AI provider through the same shared circuit breaker (Gemini primary, Groq fallback); the Report Worker writes the result straight to MongoDB, while the Resume-PDF Worker additionally renders the AI's HTML to a PDF via Puppeteer before saving it (with a TTL) to MongoDB.

Full request-lifecycle walkthroughs and the reasoning behind each decision: **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Request/Response Cycles

**Report Generation**

1. Client → `POST /api/v1/interview/` (with `Idempotency-Key` header)
2. API validates the idempotency key and required fields, enqueues a job onto the Report Queue, responds `202` with `jobId`
3. Client polls `GET /api/v1/interview/status/:jobId`
4. Report Worker picks up the job, calls the AI provider through the shared circuit breaker
5. On success: report saved to MongoDB, job marked `completed`, the poll response includes the report ID (`result.interviewReportId`)
6. On AI failure: the circuit breaker fast-fails once its error threshold trips; independently, BullMQ retries the job up to 3 times with exponential backoff, and the job is marked `failed` (with `failedReason` set) once retries are exhausted

**Resume PDF Generation**

1. Client → `POST /api/v1/interview/resume-pdf/:reportId` (with `Idempotency-Key` header)
2. API validates that the report belongs to the requesting user and validates the idempotency key (separate key prefix from report generation), enqueues onto the Resume-PDF Queue, responds `202` with `jobId`
3. Client polls `GET /api/v1/interview/resume-pdf/status/:jobId`
4. Resume-PDF Worker picks up the job, calls the AI provider through the same shared circuit breaker, renders the returned HTML to PDF via Puppeteer
5. On success: PDF stored in MongoDB (base64, 2-hour TTL), job marked `completed`, the poll response includes the PDF ID (`result.pdfId`)
6. Frontend auto-fetches `GET /api/v1/interview/resume-pdf/:id` as a blob as soon as the poll reports `completed`, and triggers a browser download automatically — no click required
7. If the PDF is never fetched within the 2-hour TTL window, a later fetch attempt returns a clean `404` ("This download has expired — please generate a new one.")

## Getting Started (Local Development)

### Prerequisites

- Node.js 26 (matches the Docker base image, `node:26-alpine`)
- Docker + Docker Compose
- A Gemini API key and/or a Groq API key

### 1. Clone and install

```bash
git clone https://github.com/PaladuguGeetesh/Resume_Analyzer_Full_Stack.git
cd Resume_Analyzer_Full_Stack

cd Backend && npm install --legacy-peer-deps
cd ../frontend && npm install
```

> `--legacy-peer-deps` is required for the backend: `ioredis-mock`'s peer dependency (`ioredis ^5`) conflicts with the `ioredis ^6` this project actually uses.

### 2. Environment variables

Copy `Backend/.env.example` to `Backend/.env`, and `frontend/.env.example` to `frontend/.env`, then fill in real values.

**Backend (`Backend/.env`):**

| Variable | Description |
|---|---|
| `RUN_WORKER_IN_PROCESS` | Set to `true` only on deployments without a separate worker service (e.g. Render free tier). Leave unset locally — run `npm run worker:reports` as its own process instead. |
| `RUN_RESUME_WORKER_IN_PROCESS` | Same as above, for the resume-PDF worker (`npm run worker:resumes`). |
| `AI_PRIMARY_PROVIDER` | `"gemini"` or `"groq"` — picks the primary AI provider; the other becomes the automatic fallback once the shared circuit breaker trips. |
| `GOOGLE_GENAI_API_KEY` | Gemini API key. |
| `GROQ_API_KEY` | Groq API key. |
| `MONGO_URI` | MongoDB connection string. |
| `REDIS_URL` | Redis connection string. |
| `JWT_SECRET` | Secret used to sign/verify auth JWTs. |
| `FRONTEND_URL` | The frontend's origin, used for CORS. Falls back to `http://localhost:5173` if unset — only required in production. |
| `NODE_ENV` | Affects cookie `secure`/`sameSite` behavior and whether error responses include a stack trace. |
| `PORT` | Port the API listens on. |

**Frontend (`frontend/.env`):**

| Variable | Description |
|---|---|
| `VITE_API_URL` | Base URL of the backend API. |

### 3. Start infrastructure (MongoDB + Redis)

```bash
docker compose up -d mongo redis
```

### 4. Start all four processes (separate terminals)

```bash
# Terminal 1 — API
cd Backend && npm run dev

# Terminal 2 — Report generation worker
cd Backend && npm run worker:reports

# Terminal 3 — Resume PDF worker
cd Backend && npm run worker:resumes

# Terminal 4 — Frontend
cd frontend && npm run dev
```

Three separate backend processes locally, on purpose — fault isolation and independent scaling, so a stuck PDF render can't block report generation or the API itself. Full reasoning in [ARCHITECTURE.md](./ARCHITECTURE.md). In the deployed environment they're combined into a single process via env flags for free-tier cost reasons — see [Known Limitations](#known-limitations).

## Running the Full Stack in Docker

```bash
docker compose up --build          # full stack, fresh build
docker compose up -d               # start in background, using existing images
docker compose down                # stop, keep volumes/data
docker compose down -v             # full teardown, including volumes
docker compose logs -f api
docker compose logs -f worker-reports
docker compose logs -f worker-resumes
docker compose logs -f frontend
docker compose ps                  # check what's running
```

## Testing

```bash
cd Backend && npm test    # Jest — 28 tests / 5 suites: auth, IDOR, idempotency, circuit breaker, resume-PDF pipeline
cd frontend && npm test   # Vitest — 4 tests / 1 suite
```

## CI/CD

`.github/workflows/ci.yml` runs the full backend test suite and the frontend lint + test + build on every push and pull request to `main`. Merging to `main` auto-deploys the backend (Render) and frontend (Vercel) independently.

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — system diagram, request-lifecycle walkthroughs, and the reasoning behind the major design decisions.
- **[API.md](./API.md)** — every REST endpoint, grouped by resource, with auth requirements, headers, request/response shapes, and error codes.

## Known Limitations

- Worker processes run combined with the API in the current free-tier deployment (env-flag-gated), not as separate services.
- Cross-domain cookie auth may be blocked by strict browser third-party cookie policies, depending on the browser and its settings.
- Render's managed Redis free tier doesn't expose the `noeviction` policy BullMQ recommends for queue/lock data.
