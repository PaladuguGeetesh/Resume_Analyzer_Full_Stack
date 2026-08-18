// ============================================================================
// RESUME-PDF PIPELINE SUITE — covers the NEW wiring introduced by the second
// (resume-PDF) BullMQ queue/worker: enqueue-without-blocking, idempotency (including
// the distinct key prefix vs. report generation), IDOR on the status/fetch endpoints,
// the worker's circuit-breaker error handling, and a clean 404 on an expired/missing
// generated PDF. The shared circuit breaker's own trip/reset behavior is already
// covered by circuitBreaker.test.js and is deliberately NOT re-tested here — this file
// only asserts that resumePdfWorker.js reacts to AIServiceUnavailableError the same way
// worker.js does, not that the breaker itself works.
//
// Two things worth flagging explicitly:
//  1. There was no existing test making "the exact assertion already made for worker.js's
//     equivalent behavior" — no test in this suite exercises worker.js's job processor
//     directly (circuitBreaker.test.js tests ai.service.js, not worker.js). Part (d) below
//     is a new pattern, not a mirror of an existing one, and the same pattern would be
//     worth applying to worker.js too if that gap matters going forward.
//  2. The two resume-PDF status/fetch IDOR tests that used to live in
//     interview.idor.test.js moved here instead of being duplicated — see that file's
//     updated header comment.
// ============================================================================
// Mocked at file-top (before anything else is required) rather than inside the describe
// block that actually uses them — jest.mock() calls are only hoisted to the top of their
// OWN enclosing scope, not to the top of the whole file, so a nested jest.mock('bullmq', ...)
// only reliably wins the race against an earlier top-level require() by coincidence
// (specifically: interview.controller.js no longer imports ai.service.js directly, and the
// queue mocks below don't import bullmq, so nothing else in this file happens to load the
// real versions first — true today, but fragile to depend on if that require chain changes).
jest.mock('bullmq', () => ({
  // Captures the exact processor function startResumePdfWorker() wires up, so the
  // worker-error-handling tests below can invoke it directly without a real BullMQ
  // Worker attempting blocking Redis commands against ioredis-mock.
  Worker: jest.fn().mockImplementation((queueName, processor) => ({
    on: jest.fn(),
    __processor: processor,
  })),
}))

jest.mock('../src/services/ai.service', () => {
  const actual = jest.requireActual('../src/services/ai.service')
  return { ...actual, generateResumePdf: jest.fn() }
})

const request = require('supertest')
const mongoose = require('mongoose')
const app = require('../src/app')
const { registerUser } = require('./setup')
const interviewReportModel = require('../src/models/interviewReport.model')
const generatedResumePdfModel = require('../src/models/generatedResumePdf.model')
const { enqueueResumePdfJob, resumePdfQueue } = require('../src/queues/resumePdf.queue')
const { enqueueInterviewReportJob } = require('../src/queues/interview.queue')
const { Worker } = require('bullmq')
const { generateResumePdf, AIServiceUnavailableError } = require('../src/services/ai.service')
const { startResumePdfWorker } = require('../resumePdfWorker')

async function createReportFor(userId) {
  return interviewReportModel.create({
    user: userId,
    jobDescription: 'Backend Engineer at a fintech startup',
    resume: 'Some resume text',
    selfDescription: 'A backend developer with 3 years of experience',
    title: 'Backend Engineer Interview Prep',
  })
}

function submitReport(cookie, idempotencyKey) {
  return request(app)
    .post('/api/v1/interview/')
    .set('Cookie', cookie)
    .set('Idempotency-Key', idempotencyKey)
    .field('selfDescription', 'a backend developer with 3 years of experience')
    .field('jobDescription', 'looking for a backend engineering role')
    .attach('resume', Buffer.from('dummy pdf bytes'), {
      filename: 'resume.pdf',
      contentType: 'application/pdf',
    })
}

describe('resume-PDF enqueue', () => {
  it('POST /resume-pdf/:reportId returns 202 with a jobId without waiting for actual generation', async () => {
    const { cookie, id } = await registerUser(app)
    const report = await createReportFor(id)

    const start = Date.now()
    const res = await request(app)
      .post(`/api/v1/interview/resume-pdf/${report._id}`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'enqueue-test-key')
    const elapsed = Date.now() - start

    expect(res.status).toBe(202)
    expect(res.body.jobId).toBeDefined()
    // sanity bound, not a strict timing assertion — real generation takes tens of
    // seconds (AI call + Puppeteer), so a fast response here confirms this is genuinely
    // enqueue-only and not accidentally awaiting the worker
    expect(elapsed).toBeLessThan(1000)

    expect(enqueueResumePdfJob).toHaveBeenCalledTimes(1)
    expect(enqueueResumePdfJob).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: id,
        resume: report.resume,
        selfDescription: report.selfDescription,
        jobDescription: report.jobDescription,
      }),
    )
  })
})

describe('resume-PDF idempotency (distinct key prefix from report generation)', () => {
  it('resubmitting with the SAME Idempotency-Key enqueues only one resume-PDF job and replays the same jobId', async () => {
    const { cookie, id } = await registerUser(app)
    const report = await createReportFor(id)
    const key = 'resume-pdf-same-key'

    const first = await request(app)
      .post(`/api/v1/interview/resume-pdf/${report._id}`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
    expect(first.status).toBe(202)

    const second = await request(app)
      .post(`/api/v1/interview/resume-pdf/${report._id}`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
    expect(second.status).toBe(202)
    expect(second.body.jobId).toBe(first.body.jobId)

    expect(enqueueResumePdfJob).toHaveBeenCalledTimes(1)
  })

  it('the same raw Idempotency-Key value does NOT collide between a report submission and a resume-PDF submission for the same user', async () => {
    const { cookie, id } = await registerUser(app)
    const report = await createReportFor(id)
    const sharedKey = 'shared-raw-key-value'

    const reportRes = await submitReport(cookie, sharedKey)
    expect(reportRes.status).toBe(202)

    const resumePdfRes = await request(app)
      .post(`/api/v1/interview/resume-pdf/${report._id}`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', sharedKey)

    // the key point: 202 (a genuinely new job), NOT 409 — if the prefixes collided, this
    // would come back 409 "already being processed" since the report submission already
    // claimed the unprefixed key
    expect(resumePdfRes.status).toBe(202)

    expect(enqueueInterviewReportJob).toHaveBeenCalledTimes(1)
    expect(enqueueResumePdfJob).toHaveBeenCalledTimes(1)
  })
})

describe('IDOR regression — resume-PDF status and fetch endpoints', () => {
  it('GET /resume-pdf/status/:jobId returns 404 (not the status) when user B requests user A\'s resume-PDF job', async () => {
    const userA = await registerUser(app)
    const userB = await registerUser(app)

    resumePdfQueue.getJob.mockResolvedValueOnce({
      id: 'resume-job-a',
      data: { userId: userA.id },
      getState: async () => 'completed',
      returnvalue: { pdfId: 'user-as-pdf-id' },
    })

    const res = await request(app)
      .get('/api/v1/interview/resume-pdf/status/resume-job-a')
      .set('Cookie', userB.cookie)

    expect(res.status).toBe(404)
    expect(res.body.result).toBeUndefined()
  })

  it('GET /resume-pdf/:id returns 404 (not the file) when user B requests user A\'s generated PDF', async () => {
    const userA = await registerUser(app)
    const userB = await registerUser(app)

    const pdf = await generatedResumePdfModel.create({
      user: userA.id,
      pdfData: Buffer.from('%PDF-1.4 fake pdf bytes').toString('base64'),
    })

    const res = await request(app)
      .get(`/api/v1/interview/resume-pdf/${pdf._id}`)
      .set('Cookie', userB.cookie)

    expect(res.status).toBe(404)
    expect(res.headers['content-type']).not.toMatch(/application\/pdf/)
  })

  it('sanity check: the OWNER can still fetch their own generated resume PDF by the same ID', async () => {
    const userA = await registerUser(app)
    const pdf = await generatedResumePdfModel.create({
      user: userA.id,
      pdfData: Buffer.from('%PDF-1.4 fake pdf bytes').toString('base64'),
    })

    const res = await request(app)
      .get(`/api/v1/interview/resume-pdf/${pdf._id}`)
      .set('Cookie', userA.cookie)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/pdf/)
  })
})

describe('resume-PDF file fetch — expired or never-existed document', () => {
  it('GET /resume-pdf/:id returns a clean 404 with the expected message, not a crash, for a nonexistent document', async () => {
    const { cookie } = await registerUser(app)
    // valid ObjectId format but nothing stored under it — same shape a TTL-expired
    // document's ID would produce once MongoDB's background sweep deletes it
    const neverExistedId = new mongoose.Types.ObjectId()

    const res = await request(app)
      .get(`/api/v1/interview/resume-pdf/${neverExistedId}`)
      .set('Cookie', cookie)

    expect(res.status).toBe(404)
    expect(res.body.message).toBe('This download has expired — please generate a new one.')
  })
})

describe('resumePdfWorker job processor — circuit-breaker error handling', () => {
  let consoleErrorSpy

  beforeEach(() => {
    jest.clearAllMocks()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  function getProcessor() {
    startResumePdfWorker()
    return Worker.mock.calls.at(-1)[1]
  }

  it('logs the distinct "circuit breaker is open" message and rethrows when generateResumePdf throws AIServiceUnavailableError', async () => {
    generateResumePdf.mockRejectedValueOnce(new AIServiceUnavailableError())
    const processor = getProcessor()

    const fakeJob = {
      id: 'test-job-1',
      data: { userId: 'user-1', resume: 'r', selfDescription: 's', jobDescription: 'j' },
    }

    await expect(processor(fakeJob)).rejects.toBeInstanceOf(AIServiceUnavailableError)

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('failed fast — circuit breaker is open, AI service is down'),
    )
  })

  it('logs the generic "AI service error" message (not the circuit-breaker message) for any other error', async () => {
    generateResumePdf.mockRejectedValueOnce(new Error('some other failure'))
    const processor = getProcessor()

    const fakeJob = {
      id: 'test-job-2',
      data: { userId: 'user-1', resume: 'r', selfDescription: 's', jobDescription: 'j' },
    }

    await expect(processor(fakeJob)).rejects.toThrow('some other failure')

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('failed — AI service error: some other failure'),
    )
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('circuit breaker is open'),
    )
  })
})
