// Covers ONLY jobs.context.jsx's polling/state-machine logic: adding a pending job,
// transitioning it to completed/failed on the next poll tick, and resuming a job that was
// already in localStorage at mount (the "refreshed mid-generation" case). Deliberately does
// not test react-hot-toast's or the browser Notification API's own behavior — both are
// mocked out — and does not render any page/component beyond the provider itself.
//
// Two corrections vs. how this was initially scoped:
//  1. getInterviewReportStatus/getAllInterviewReports go through axios (src/lib/apiClient.js),
//     not the Fetch API — axios's default adapter in a jsdom environment is XHR, so mocking
//     global.fetch would never actually intercept these calls. Mocking the
//     ./services/interview.api module directly is what actually isolates the polling logic.
//  2. The completed-job payload's ID field is `result.interviewReportId` (see
//     jobs.context.jsx's `status.result?.interviewReportId` and worker.js's
//     `return {interviewReportId:...}`), not `result.reportId` — the mock below matches the
//     real shape so the test is actually asserting against production behavior.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { JobsProvider } from './jobs.context'
import { useJobs } from './hooks/useJobs'
import { InterviewProvider } from './interview.context'
import { getInterviewReportStatus, getAllInterviewReports } from './services/interview.api'
import toast from 'react-hot-toast'

vi.mock('./services/interview.api', () => ({
    getInterviewReportStatus: vi.fn(),
    getAllInterviewReports: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
    default: {
        custom: vi.fn(),
        error: vi.fn(),
        dismiss: vi.fn(),
    },
}))

// jobs.context.jsx imports the real router (from app.routes.jsx) to navigate on a
// toast/notification click — irrelevant to polling/state-machine logic and pulls in the
// whole page tree (Login/Register/Home/Interview), so it's stubbed out here.
vi.mock('../../app.routes.jsx', () => ({
    router: { navigate: vi.fn() },
}))

const STORAGE_KEY = 'pendingInterviewJobs'
const POLL_INTERVAL_MS = 4000

function wrapper({ children }) {
    return (
        <InterviewProvider>
            <JobsProvider>{children}</JobsProvider>
        </InterviewProvider>
    )
}

beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    // fire-and-forget call made after every completed job (see jobs.context.jsx's
    // refreshReports) — irrelevant to these tests, just needs to resolve instead of hitting
    // a real network call
    getAllInterviewReports.mockResolvedValue({ interviewReports: [] })
})

afterEach(() => {
    vi.useRealTimers()
})

describe('JobsProvider polling/state-machine', () => {
    // Protects against: a submitted report silently disappearing if the user navigates away
    // or the page re-renders before any toast/notification appears — the pending job must be
    // captured in both React state and localStorage the moment it's submitted, independent of
    // whether the user ever sees a UI acknowledgment.
    it('addPendingJob adds a job and persists it to localStorage', () => {
        const { result } = renderHook(() => useJobs(), { wrapper })

        act(() => {
            result.current.addPendingJob('job-1')
        })

        expect(result.current.pendingJobs).toHaveLength(1)
        expect(result.current.pendingJobs[0].jobId).toBe('job-1')

        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
        expect(stored).toHaveLength(1)
        expect(stored[0].jobId).toBe('job-1')
    })

    // Protects against: a finished report never showing up as "ready" because the poll loop
    // failed to move the job out of pendingJobs, or read the wrong field off the status
    // response and produced a completedJobs entry with a broken/undefined reportId.
    it('a job reaching completed state moves to completedJobs with the correct reportId', async () => {
        vi.useFakeTimers()
        getInterviewReportStatus.mockResolvedValue({
            state: 'completed',
            result: { interviewReportId: 'mock-report-id' },
        })

        const { result } = renderHook(() => useJobs(), { wrapper })

        act(() => {
            result.current.addPendingJob('job-1')
        })

        await act(async () => {
            await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
        })

        expect(result.current.pendingJobs).toHaveLength(0)
        expect(result.current.completedJobs).toHaveLength(1)
        expect(result.current.completedJobs[0]).toMatchObject({
            jobId: 'job-1',
            reportId: 'mock-report-id',
        })
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual([])
    })

    // Protects against: a failed generation leaving its job stuck in pendingJobs forever (the
    // UI would show "generating…" indefinitely instead of surfacing the failure), and against
    // a failed job being wrongly counted as completed.
    it('a job reaching failed state is removed without being marked completed', async () => {
        vi.useFakeTimers()
        getInterviewReportStatus.mockResolvedValue({
            state: 'failed',
            failedReason: 'AI service unavailable',
        })

        const { result } = renderHook(() => useJobs(), { wrapper })

        act(() => {
            result.current.addPendingJob('job-1')
        })

        await act(async () => {
            await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
        })

        expect(result.current.pendingJobs).toHaveLength(0)
        expect(result.current.completedJobs).toHaveLength(0)
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual([])
        // notifyFailure (jobs.context.jsx) is the actual failure-surfacing mechanism —
        // a plain toast.error call, not a callback prop
        expect(toast.error).toHaveBeenCalledWith('AI service unavailable')
    })

    // Protects against: a report that finishes generating while the tab was refreshed (or the
    // browser was reopened) mid-generation never getting picked back up, because the pending
    // job only ever lived in memory and a fresh mount didn't resume tracking it.
    it('resumes polling for a job already in localStorage on mount', async () => {
        vi.useFakeTimers()
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify([ { jobId: 'job-from-refresh', submittedAt: Date.now() } ]),
        )
        getInterviewReportStatus.mockResolvedValue({ state: 'active' })

        const { result } = renderHook(() => useJobs(), { wrapper })

        // present from the localStorage read at mount — addPendingJob was never called
        expect(result.current.pendingJobs).toHaveLength(1)
        expect(result.current.pendingJobs[0].jobId).toBe('job-from-refresh')

        await act(async () => {
            await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
        })

        expect(getInterviewReportStatus).toHaveBeenCalledWith('job-from-refresh')
    })
})
