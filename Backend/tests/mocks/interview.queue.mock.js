// Test double for src/queues/interview.queue.js, wired in globally via jest.config.js's
// moduleNameMapper for every test file (not just ones that opt in with jest.mock()).
//
// Why: BullMQ needs a real(-ish) Redis connection with blocking commands that ioredis-mock
// doesn't reliably support, and constructing a real bullmq.Queue would also require Redis
// to be reachable just to load src/app.js (every test file pulls it in transitively via
// interview.controller.js). Rather than standing up real Redis for tests, we mock the
// producer boundary (enqueueInterviewReportJob) directly — tests assert it was called with
// the right data / the right number of times, without BullMQ or Redis being involved at all.
const enqueueInterviewReportJob = jest.fn(async (jobData) => ({
  id: `mock-job-${Math.random().toString(36).slice(2)}`,
  data: jobData,
}))

const interviewQueue = {
  getJob: jest.fn(async () => null),
  add: jest.fn(),
}

module.exports = { interviewQueue, enqueueInterviewReportJob, QUEUE_NAME: 'interview-reports' }
