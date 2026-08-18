import { useState, useEffect, useRef, useCallback, useContext } from "react"
import toast from "react-hot-toast"
import { router } from "../../app.routes.jsx"
import { getInterviewReportStatus, getAllInterviewReports, getResumePdfStatus, getResumePdfFile } from "./services/interview.api"
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

    // Resume-PDF completion has nowhere to navigate to — the file downloads itself (see
    // downloadResumePdfFile below) — so this is just a lightweight confirmation, unlike
    // notifyCompletion's clickable toast/native notification for reports.
    const notifyResumePdfReady = useCallback(() => {
        toast.success("Your resume PDF has been downloaded.")
    }, [])

    const notifyFailure = useCallback((failedReason, jobType) => {
        const defaultMessage = jobType === "resume-pdf"
            ? "We couldn't generate your resume — please try again."
            : "We couldn't generate your report — please try again."
        toast.error(failedReason || defaultMessage)
    }, [])

    // Fetches the completed PDF as a blob and triggers a synthetic download — this is what
    // makes resume-PDF generation feel synchronous from the user's perspective even though
    // it's now handled by a background worker: no page to click through to, the file just
    // lands in their downloads automatically.
    const downloadResumePdfFile = useCallback(async (pdfId) => {
        try {
            const blob = await getResumePdfFile(pdfId)
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.href = url
            link.setAttribute("download", "resume.pdf")
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)
            notifyResumePdfReady()
        } catch (err) {
            console.error("failed to auto-download resume PDF:", err)
            toast.error("Your resume PDF is ready, but the automatic download failed — try again from the report page.")
        }
    }, [notifyResumePdfReady])

    // jobType tags which polling/completion path a pending job needs — defaults to "report"
    // so existing callers (Home.jsx's addPendingJob(jobId), with no second argument) keep
    // working unchanged.
    const addPendingJob = useCallback((jobId, options = {}) => {
        const jobType = options.jobType || "report"
        requestNotificationPermissionOnce()

        setPendingJobs((prev) => {
            const next = [...prev, { jobId, jobType, submittedAt: Date.now() }]
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

    // Records that a job has moved from queued to actively processing — separate from
    // completed/failed, this is purely a display-state update (see Header.jsx's dropdown)
    // so the UI can distinguish "queued" from "actively processing" wording per job.
    const markPendingJobActive = useCallback((jobId) => {
        setPendingJobs((prev) => {
            const next = prev.map((job) => job.jobId === jobId ? { ...job, state: "active" } : job)
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
                // jobs persisted before jobType existed (localStorage) default to "report"
                const jobType = job.jobType || "report"

                let status
                try {
                    status = jobType === "resume-pdf"
                        ? await getResumePdfStatus(job.jobId)
                        : await getInterviewReportStatus(job.jobId)
                } catch {
                    // transient poll failure (network blip, etc.) — leave it pending, retry next tick
                    continue
                }

                if (status.state === "completed") {
                    removePendingJob(job.jobId)

                    if (jobType === "resume-pdf") {
                        const pdfId = status.result?.pdfId
                        setCompletedJobs((prev) => [...prev, { jobId: job.jobId, jobType, pdfId, completedAt: Date.now() }])
                        downloadResumePdfFile(pdfId)
                    } else {
                        const reportId = status.result?.interviewReportId
                        setCompletedJobs((prev) => [...prev, { jobId: job.jobId, jobType, reportId, completedAt: Date.now() }])
                        notifyCompletion(reportId)
                        refreshReports()
                    }
                } else if (status.state === "failed") {
                    removePendingJob(job.jobId)
                    notifyFailure(status.failedReason, jobType)
                } else if (status.state === "active" && job.state !== "active") {
                    // queued → actively processing — only write on the transition, not
                    // every poll tick, since BullMQ keeps reporting "active" the whole time
                    markPendingJobActive(job.jobId)
                }
            }
        }, POLL_INTERVAL_MS)

        return () => clearInterval(interval)
    }, [removePendingJob, notifyCompletion, notifyFailure, refreshReports, downloadResumePdfFile, markPendingJobActive])

    return (
        <JobsContext.Provider value={{ pendingJobs, completedJobs, addPendingJob, requestNotificationPermissionOnce }}>
            {children}
        </JobsContext.Provider>
    )
}
