// ============================================================================
// IDOR REGRESSION SUITE — locks in the Day 1 security fix, plus a gap found during
// a manual pre-deployment E2E pass: the report-status endpoint had NO ownership check at
// all (any authenticated user could poll any job ID and learn another user's
// interviewReportId), and this file's own resume-PDF enqueue test had silently gone
// stale — it still pointed at the pre-rename route (/resume/pdf/:id), which no longer
// exists, so it was "passing" via Express's generic 404 instead of the actual IDOR check.
//
// The resume-PDF status/fetch IDOR tests that used to live here have moved to
// resumePdf.test.js, which covers the resume-PDF pipeline end to end — kept here only:
// the report-content and report-status checks, and the resume-PDF *enqueue* check (which
// is really gating access to the underlying interview report, same as the other tests in
// this file, not the resume-PDF pipeline itself).
//
// Before the original fix, generateResumePdfController used
// interviewReportModel.findById(interviewReportId) — an unscoped lookup by ID
// alone. Any authenticated user who guessed/observed another user's report ID
// could fetch their resume PDF. The fix scoped every lookup to
// { _id, user: req.user.id }. If any of these lookups ever regress back to an
// unscoped find, these tests fail.
// ============================================================================
const request = require('supertest')
const app = require('../src/app')
const { registerUser } = require('./setup')
const interviewReportModel = require('../src/models/interviewReport.model')
const { interviewQueue } = require('../src/queues/interview.queue')
const { enqueueResumePdfJob } = require('../src/queues/resumePdf.queue')

async function createReportFor(userId) {
  return interviewReportModel.create({
    user: userId,
    jobDescription: 'Backend Engineer at a fintech startup',
    resume: 'Some resume text',
    selfDescription: 'A backend developer with 3 years of experience',
    title: 'Backend Engineer Interview Prep',
  })
}

describe('IDOR regression — a user must never be able to access another user\'s interview report', () => {
  it('GET /api/v1/interview/report/:id returns 404 (not the report) when user B requests user A\'s report', async () => {
    const userA = await registerUser(app)
    const userB = await registerUser(app)

    const report = await createReportFor(userA.id)

    const res = await request(app)
      .get(`/api/v1/interview/report/${report._id}`)
      .set('Cookie', userB.cookie)

    expect(res.status).toBe(404)
    expect(res.body.interviewReport).toBeUndefined()
  })

  it('POST /api/v1/interview/resume-pdf/:reportId returns 404 (and never enqueues) when user B requests user A\'s report', async () => {
    const userA = await registerUser(app)
    const userB = await registerUser(app)

    const report = await createReportFor(userA.id)

    const res = await request(app)
      .post(`/api/v1/interview/resume-pdf/${report._id}`)
      .set('Cookie', userB.cookie)
      .set('Idempotency-Key', 'idor-test-resume-pdf-enqueue')

    expect(res.status).toBe(404)
    expect(enqueueResumePdfJob).not.toHaveBeenCalled()
  })

  it('GET /api/v1/interview/status/:jobId returns 404 (not the status) when user B requests user A\'s report-generation job', async () => {
    const userA = await registerUser(app)
    const userB = await registerUser(app)

    interviewQueue.getJob.mockResolvedValueOnce({
      id: 'report-job-a',
      data: { userId: userA.id },
      getState: async () => 'completed',
      returnvalue: { interviewReportId: 'user-as-report-id' },
    })

    const res = await request(app)
      .get('/api/v1/interview/status/report-job-a')
      .set('Cookie', userB.cookie)

    expect(res.status).toBe(404)
    expect(res.body.result).toBeUndefined()
  })

  it('sanity check: the OWNER can still fetch their own report by the same ID', async () => {
    const userA = await registerUser(app)
    const report = await createReportFor(userA.id)

    const res = await request(app)
      .get(`/api/v1/interview/report/${report._id}`)
      .set('Cookie', userA.cookie)

    expect(res.status).toBe(200)
    expect(res.body.interviewReport._id).toBe(String(report._id))
  })

  it('an unauthenticated request (no cookie at all) is rejected before any ownership check', async () => {
    const userA = await registerUser(app)
    const report = await createReportFor(userA.id)

    const res = await request(app).get(`/api/v1/interview/report/${report._id}`)

    expect(res.status).toBe(401)
  })
})
