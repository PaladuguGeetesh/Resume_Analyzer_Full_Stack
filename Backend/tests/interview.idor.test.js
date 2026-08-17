// ============================================================================
// IDOR REGRESSION SUITE — locks in the Day 1 security fix.
//
// Before the fix, generateResumePdfController used
// interviewReportModel.findById(interviewReportId) — an unscoped lookup by ID
// alone. Any authenticated user who guessed/observed another user's report ID
// could fetch their resume PDF. The fix scoped every lookup to
// { _id, user: req.user.id } (see getInterviewReportByIdController and
// generateResumePdfController). If either lookup ever regresses back to an
// unscoped findById, these tests fail.
// ============================================================================
const request = require('supertest')
const app = require('../src/app')
const { registerUser } = require('./setup')
const interviewReportModel = require('../src/models/interviewReport.model')

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

  it('POST /api/v1/interview/resume/pdf/:id returns 404 (not the PDF) when user B requests user A\'s report', async () => {
    const userA = await registerUser(app)
    const userB = await registerUser(app)

    const report = await createReportFor(userA.id)

    const res = await request(app)
      .post(`/api/v1/interview/resume/pdf/${report._id}`)
      .set('Cookie', userB.cookie)

    expect(res.status).toBe(404)
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
