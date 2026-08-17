import { useState, useEffect, useRef, useCallback, useContext } from "react"
import toast from "react-hot-toast"
import { router } from "../../app.routes.jsx"
import { getInterviewReportStatus, getAllInterviewReports } from "./services/interview.api"
import { InterviewContext } from "./interview-context"
import { JobsContext } from "./jobs-context"

const STORAGE_KEY = "pendingInterviewJobs"
const POLL_INTERVAL_MS = 4000

function readStoredPendingJobs() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : []
    } catch {
        return []
    }
}

function writeStoredPendingJobs(jobs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs))
}

export const JobsProvider = ({ children }) => {
    const [pendingJobs, setPendingJobs] = useState(() => readStoredPendingJobs())
    const [completedJobs, setCompletedJobs] = useState([])

    // JobsProvider sits inside InterviewProvider (see App.jsx) specifically so a completed
    // job can push the refreshed reports list straight into InterviewContext — without this,
    // "My Recent Interview Plans" only ever updated on Home's own mount-time fetch, so a
    // report that finished while you were elsewhere (or you missed the notification) never
    // showed up until a manual page refresh.
    const { setReports } = useContext(InterviewContext)

    const refreshReports = useCallback(async () => {
        try {
            const response = await getAllInterviewReports()
            setReports(response.interviewReports)
        } catch (err) {
            console.error("failed to refresh reports list after job completion:", err)
        }
    }, [setReports])

    // read from inside the interval without re-creating it on every pendingJobs change
    const pendingJobsRef = useRef(pendingJobs)
    useEffect(() => {
        pendingJobsRef.current = pendingJobs
    }, [pendingJobs])

    const notificationPermissionRequested = useRef(false)

    const requestNotificationPermissionOnce = useCallback(() => {
        if (notificationPermissionRequested.current) return
        notificationPermissionRequested.current = true

        if (typeof Notification !== "undefined" && Notification.permission === "default") {
            Notification.requestPermission()
        }
    }, [])

    const goToReport = useCallback((reportId) => {
        router.navigate(`/interview/${reportId}`)
    }, [])

    const notifyCompletion = useCallback((reportId) => {
        toast.custom(
            (t) => (
                <div
                    role="button"
                    tabIndex={0}
                    className={`job-toast job-toast--success ${t.visible ? "job-toast--visible" : "job-toast--hidden"}`}
                    onClick={() => {
                        toast.dismiss(t.id)
                        goToReport(reportId)
                    }}
                >
                    <strong>Your interview plan is ready</strong>
                    <span>Click to view your report</span>
                </div>
            ),
            { duration: 8000 },
        )

        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            const notification = new Notification("Interview plan ready", {
                body: "Click to view your generated report.",
            })
            notification.onclick = () => {
                window.focus()
                goToReport(reportId)
                notification.close()
            }
        }
    }, [goToReport])

    const notifyFailure = useCallback((failedReason) => {
        toast.error(failedReason || "Report generation failed. Please try again.")
    }, [])

    const addPendingJob = useCallback((jobId) => {
        requestNotificationPermissionOnce()

        setPendingJobs((prev) => {
            const next = [...prev, { jobId, submittedAt: Date.now() }]
            writeStoredPendingJobs(next)
            return next
        })
    }, [requestNotificationPermissionOnce])

    const removePendingJob = useCallback((jobId) => {
        setPendingJobs((prev) => {
            const next = prev.filter((job) => job.jobId !== jobId)
            writeStoredPendingJobs(next)
            return next
        })
    }, [])

    // single polling loop for the lifetime of the provider — reads pendingJobsRef so it
    // doesn't need to be torn down/recreated every time the pending list changes
    useEffect(() => {
        const interval = setInterval(async () => {
            const jobsToCheck = pendingJobsRef.current
            if (jobsToCheck.length === 0) return

            for (const job of jobsToCheck) {
                let status
                try {
                    status = await getInterviewReportStatus(job.jobId)
                } catch {
                    // transient poll failure (network blip, etc.) — leave it pending, retry next tick
                    continue
                }

                if (status.state === "completed") {
                    const reportId = status.result?.interviewReportId
                    removePendingJob(job.jobId)
                    setCompletedJobs((prev) => [...prev, { jobId: job.jobId, reportId, completedAt: Date.now() }])
                    notifyCompletion(reportId)
                    refreshReports()
                } else if (status.state === "failed") {
                    removePendingJob(job.jobId)
                    notifyFailure(status.failedReason)
                }
            }
        }, POLL_INTERVAL_MS)

        return () => clearInterval(interval)
    }, [removePendingJob, notifyCompletion, notifyFailure, refreshReports])

    return (
        <JobsContext.Provider value={{ pendingJobs, completedJobs, addPendingJob, requestNotificationPermissionOnce }}>
            {children}
        </JobsContext.Provider>
    )
}
