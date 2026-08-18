// Test double for src/queues/resumePdf.queue.js — same reasoning as
// interview.queue.mock.js (see that file's comment): mocks the producer boundary so tests
// never need a real BullMQ/Redis connection just to exercise routes that enqueue a job.
const enqueueResumePdfJob = jest.fn(async (jobData) => ({
  id: `mock-resume-job-${Math.random().toString(36).slice(2)}`,
  data: jobData,
}))

const resumePdfQueue = {
  getJob: jest.fn(async () => null),
  add: jest.fn(),
}

module.exports = { resumePdfQueue, enqueueResumePdfJob, RESUME_PDF_QUEUE_NAME: 'resume-pdfs' }
