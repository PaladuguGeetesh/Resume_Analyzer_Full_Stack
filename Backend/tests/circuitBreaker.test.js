// Tests the opossum circuit breaker wrapping generateInterviewReport directly (no HTTP
// stack involved) — this is what locks in the Day 6.5 bugfix: opossum's .fallback() runs
// on EVERY failed call, not just when the circuit is actually open, so ai.service.js's
// fallback must check interviewReportBreaker.opened itself before deciding whether to
// throw the typed AIServiceUnavailableError or the real underlying error.
//
// Since the Groq fallback landed, the "breaker open" branch no longer means "fail fast" —
// it means "route to Groq". These tests mock groq-sdk so that branch can be exercised
// deterministically in both directions: Groq succeeds (job completes via the backup
// provider) and Groq also fails (AIServiceUnavailableError remains the final safety net).
//
// Uses SIMULATE_AI_FAILURE=true (built into callGeminiForInterviewReport since Day 5) to
// force failures without ever calling the real Gemini API, and a test-scale breaker config
// (fast timeout, low volumeThreshold) via env vars ai.service.js reads at module load —
// see src/services/ai.service.js's interviewReportBreakerOptions.
process.env.SIMULATE_AI_FAILURE = 'true'
process.env.GOOGLE_GENAI_API_KEY = process.env.GOOGLE_GENAI_API_KEY || 'test-key'
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key'
process.env.AI_BREAKER_TIMEOUT_MS = '100'
process.env.AI_BREAKER_VOLUME_THRESHOLD = '2'
process.env.AI_BREAKER_ERROR_THRESHOLD_PERCENTAGE = '50'
// deliberately long — never intended to fire during this file's run; a short value
// left a dangling opossum timer alive after the test file tore down (Jest's
// "Cannot log after tests are done" warning + a --detectOpenHandles flag)
process.env.AI_BREAKER_RESET_TIMEOUT_MS = '60000'
process.env.AI_BREAKER_ROLLING_COUNT_TIMEOUT_MS = '2000'
process.env.AI_BREAKER_ROLLING_COUNT_BUCKETS = '2'

const params = { resume: 'r', selfDescription: 's', jobDescription: 'j' }

// A minimal object satisfying ai.service.js's interviewReportSchema — used as the
// mocked Groq response so callGroqForInterviewReport's zod validation actually passes.
function validReportJson() {
  return {
    matchScore: 72,
    technicalQuestions: [{ question: 'q', intention: 'i', answer: 'a' }],
    behavioralQuestions: [{ question: 'q', intention: 'i', answer: 'a' }],
    skillGaps: [{ skill: 'Kubernetes', severity: 'medium' }],
    preparationPlan: [{ day: 1, focus: 'Basics', tasks: [ 'Read docs' ] }],
    title: 'Backend Engineer',
  }
}

// Shared mock for groq-sdk's `groq.chat.completions.create` — reconfigured per test via
// mockResolvedValueOnce/mockRejectedValueOnce, reset in beforeEach so no test leaks state
// into the next one.
const mockGroqCreate = jest.fn()
jest.mock('groq-sdk', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: (...args) => mockGroqCreate(...args) } },
  }))
})

// Shared mock for @google/genai's `ai.models.generateContent` — only exercised by the
// "provider swap" describe block below, where Gemini plays the SECONDARY role and must
// be able to succeed without hitting the real API (the SIMULATE_AI_FAILURE hook only
// covers the "Gemini fails" case, not "Gemini succeeds as a rescuer").
const mockGeminiGenerateContent = jest.fn()
jest.mock('@google/genai', () => {
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: { generateContent: (...args) => mockGeminiGenerateContent(...args) },
    })),
  }
})

// jest.resetModules() + a fresh require per test gives each test its own breaker
// instance (the breaker is a module-level singleton), so tests don't leak CLOSED/OPEN
// state into each other.
beforeEach(() => {
  jest.resetModules()
  mockGroqCreate.mockReset()
  // default: Groq succeeds, since most tests below are exercising the "fallback rescues
  // the job" path — the one test for "Groq also fails" overrides this explicitly.
  mockGroqCreate.mockResolvedValue({
    choices: [ { message: { content: JSON.stringify(validReportJson()) } } ],
  })

  mockGeminiGenerateContent.mockReset()
  mockGeminiGenerateContent.mockResolvedValue({ text: JSON.stringify(validReportJson()) })
})

function loadAiService() {
  return require('../src/services/ai.service')
}

describe('circuit breaker fallback (ai.service.js)', () => {
  it('below volumeThreshold: propagates the REAL error, not AIServiceUnavailableError, and never calls Groq', async () => {
    const { generateInterviewReport, AIServiceUnavailableError, interviewReportBreaker } = loadAiService()

    // volumeThreshold is 2, so this single call leaves the breaker CLOSED —
    // the fallback must rethrow the real error, not fabricate the typed one
    const error = await generateInterviewReport(params).catch((e) => e)

    expect(error.message).toMatch(/Simulated AI failure/)
    expect(error).not.toBeInstanceOf(AIServiceUnavailableError)
    expect(interviewReportBreaker.opened).toBe(false)
    expect(mockGroqCreate).not.toHaveBeenCalled()
  })

  it('crossing volumeThreshold trips the breaker: that call and subsequent ones are rescued by the Groq fallback instead of failing', async () => {
    const { generateInterviewReport, interviewReportBreaker } = loadAiService()

    // call 1: stats.fires (1) < volumeThreshold (2) — breaker stays CLOSED, real error surfaces
    await expect(generateInterviewReport(params)).rejects.toThrow(/Simulated AI failure/)
    expect(interviewReportBreaker.opened).toBe(false)

    // call 2: stats.fires (2) >= volumeThreshold, 100% error rate > 50% threshold — trips OPEN.
    // Before the Groq fallback, this call rejected with AIServiceUnavailableError; now that
    // Groq is mocked to succeed, the job SUCCEEDS instead — that's the behavior change.
    const secondResult = await generateInterviewReport(params)
    expect(interviewReportBreaker.opened).toBe(true)
    expect(secondResult.generatedBy).toBe('groq')
    expect(secondResult.title).toBe('Backend Engineer')

    // call 3: breaker is already open — Gemini is skipped entirely, Groq rescues again
    const thirdResult = await generateInterviewReport(params)
    expect(thirdResult.generatedBy).toBe('groq')
  })

  it('breaker open + Groq ALSO failing: falls through to AIServiceUnavailableError (final safety net)', async () => {
    mockGroqCreate.mockReset()
    mockGroqCreate.mockRejectedValue(new Error('Groq simulated failure'))

    const { generateInterviewReport, AIServiceUnavailableError, interviewReportBreaker } = loadAiService()

    await generateInterviewReport(params).catch(() => {})
    const secondError = await generateInterviewReport(params).catch((e) => e) // opens here
    expect(interviewReportBreaker.opened).toBe(true)
    expect(secondError).toBeInstanceOf(AIServiceUnavailableError)

    // callGroqForInterviewReport retries once internally, so a full rescue attempt is
    // two Groq calls per generateInterviewReport call while the breaker is open
    expect(mockGroqCreate).toHaveBeenCalledTimes(2)

    const thirdError = await generateInterviewReport(params).catch((e) => e)
    expect(thirdError).toBeInstanceOf(AIServiceUnavailableError)
  })

  it('open breaker short-circuits without invoking the underlying (simulated) Gemini call again', async () => {
    const { generateInterviewReport, interviewReportBreaker } = loadAiService()

    await generateInterviewReport(params).catch(() => {})
    await generateInterviewReport(params).catch(() => {}) // opens here
    expect(interviewReportBreaker.opened).toBe(true)

    const statsBefore = interviewReportBreaker.stats.fires
    await generateInterviewReport(params).catch(() => {})
    // opossum still counts fire() calls made while open, but they're rejected via the
    // 'reject' fast-fail path (EOPENBREAKER), not routed through the real action again —
    // the Groq fallback firing on that rejection doesn't change these breaker-internal counts
    expect(interviewReportBreaker.stats.rejects).toBeGreaterThan(0)
    expect(interviewReportBreaker.stats.fires).toBeGreaterThan(statsBefore)
  })

  it('Groq fallback is called with the same params the original Gemini call received', async () => {
    const { generateInterviewReport } = loadAiService()

    await generateInterviewReport(params).catch(() => {})
    await generateInterviewReport(params) // opens here, Groq rescues

    const [ groqRequest ] = mockGroqCreate.mock.calls[0]
    expect(groqRequest.model).toBe('openai/gpt-oss-120b')
    expect(groqRequest.messages[0].content).toContain(params.resume)
    expect(groqRequest.messages[0].content).toContain(params.jobDescription)
  })
})

describe('provider swap via AI_PRIMARY_PROVIDER=groq', () => {
  beforeEach(() => {
    process.env.AI_PRIMARY_PROVIDER = 'groq'
    // Gemini now plays the SECONDARY role in this block, and needs to actually succeed
    // when the fallback calls it — the SIMULATE_AI_FAILURE hook would short-circuit that,
    // so it's turned off here and restored afterwards for the other describe block.
    process.env.SIMULATE_AI_FAILURE = 'false'
  })

  afterEach(() => {
    delete process.env.AI_PRIMARY_PROVIDER
    process.env.SIMULATE_AI_FAILURE = 'true'
  })

  it('wires Groq as the breaker-wrapped primary and Gemini as the fallback — same flow, roles swapped', async () => {
    mockGroqCreate.mockReset()
    mockGroqCreate.mockRejectedValue(new Error('Groq primary simulated failure'))

    const {
      generateInterviewReport,
      PRIMARY_PROVIDER_NAME,
      SECONDARY_PROVIDER_NAME,
      interviewReportBreaker,
    } = loadAiService()

    expect(PRIMARY_PROVIDER_NAME).toBe('groq')
    expect(SECONDARY_PROVIDER_NAME).toBe('gemini')

    // call 1: below volumeThreshold — the REAL Groq error surfaces (proves Groq, not
    // Gemini, is the one wrapped by the breaker now), Gemini is never touched
    const firstError = await generateInterviewReport(params).catch((e) => e)
    expect(firstError.message).toMatch(/Groq primary simulated failure/)
    expect(interviewReportBreaker.opened).toBe(false)
    expect(mockGeminiGenerateContent).not.toHaveBeenCalled()

    // call 2: trips the breaker on Groq — Gemini, now the secondary, rescues the job
    const secondResult = await generateInterviewReport(params)
    expect(interviewReportBreaker.opened).toBe(true)
    expect(secondResult.generatedBy).toBe('gemini')
    expect(mockGeminiGenerateContent).toHaveBeenCalledTimes(1)
  })
})
