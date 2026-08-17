// Tests the Day 6 idempotency middleware against POST /api/v1/interview/. BullMQ's
// producer (enqueueInterviewReportJob) is replaced project-wide by
// tests/mocks/interview.queue.mock.js (see jest.config.js moduleNameMapper) — see
// that file's comment for why we mock at the producer boundary instead of running
// real BullMQ against a real/mocked Redis.
const request = require('supertest')
const app = require('../src/app')
const { registerUser } = require('./setup')
const { enqueueInterviewReportJob } = require('../src/queues/interview.queue')

function submitReport(cookie, idempotencyKey) {
  const req = request(app)
    .post('/api/v1/interview/')
    .set('Cookie', cookie)
    .field('selfDescription', 'a backend developer with 3 years of experience')
    .field('jobDescription', 'looking for a backend engineering role')
    .attach('resume', Buffer.from('dummy pdf bytes'), {
      filename: 'resume.pdf',
      contentType: 'application/pdf',
    })

  if (idempotencyKey !== undefined) {
    req.set('Idempotency-Key', idempotencyKey)
  }

  return req
}

describe('idempotency dedup on POST /api/v1/interview/', () => {
  it('responds 400 and enqueues nothing when the Idempotency-Key header is missing', async () => {
    const { cookie } = await registerUser(app)

    const res = await submitReport(cookie)

    expect(res.status).toBe(400)
    expect(enqueueInterviewReportJob).not.toHaveBeenCalled()
  })

  it('resubmitting with the SAME Idempotency-Key enqueues only one job and replays the same jobId', async () => {
    const { cookie } = await registerUser(app)
    const key = 'test-key-same-1'

    const first = await submitReport(cookie, key)
    expect(first.status).toBe(202)
    expect(first.body.jobId).toBeDefined()

    const second = await submitReport(cookie, key)
    expect(second.status).toBe(202)
    expect(second.body.jobId).toBe(first.body.jobId)

    expect(enqueueInterviewReportJob).toHaveBeenCalledTimes(1)
  })

  it('submitting with a DIFFERENT Idempotency-Key enqueues a second, genuinely separate job', async () => {
    const { cookie } = await registerUser(app)

    const first = await submitReport(cookie, 'key-a')
    expect(first.status).toBe(202)

    const second = await submitReport(cookie, 'key-b')
    expect(second.status).toBe(202)
    expect(second.body.jobId).not.toBe(first.body.jobId)

    expect(enqueueInterviewReportJob).toHaveBeenCalledTimes(2)
  })

  it('a second request with the same key while the first is still in flight gets 409', async () => {
    const { cookie } = await registerUser(app)
    const key = 'test-key-in-flight'

    // hold the first request's enqueue call open so the idempotency key stays "in_progress"
    let releaseFirstEnqueue
    enqueueInterviewReportJob.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirstEnqueue = () => resolve({ id: 'held-job-id' })
        }),
    )

    // supertest/superagent requests are lazy — they don't actually dispatch until
    // awaited/.then()'d — so force this one to fire now instead of waiting to be awaited later
    const firstPromise = submitReport(cookie, key).then((res) => res)
    // let the first request reach and lock the idempotency key before firing the second
    await new Promise((r) => setTimeout(r, 50))

    const second = await submitReport(cookie, key)
    expect(second.status).toBe(409)

    releaseFirstEnqueue()
    const first = await firstPromise
    expect(first.status).toBe(202)
  })
})
