import { useState, useEffect } from 'react'
import { useJobs } from '../features/interview/hooks/useJobs'
import './header.scss'

function elapsedLabel(submittedAt) {
    const seconds = Math.max(0, Math.floor((Date.now() - submittedAt) / 1000))
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m ago`
}

// This dropdown is the one place a report job and a resume-PDF job can be visible side by
// side, so each entry needs to read as unambiguous on its own — distinct wording per
// jobType, and per whether the worker has actually picked it up yet ("active") or it's
// still sitting in the queue.
function jobStatusMessage(job) {
    const isActive = job.state === "active"
    if (job.jobType === "resume-pdf") {
        return isActive
            ? "Tailoring your resume for this role — this can take a minute..."
            : "Your resume is being generated..."
    }
    return isActive
        ? "Analyzing your resume — this can take a minute..."
        : "Your report has been queued..."
}

const Header = () => {
    const { pendingJobs } = useJobs()
    const [open, setOpen] = useState(false)
    // re-render periodically so the elapsed-time labels stay live while the dropdown is open
    const [, forceTick] = useState(0)

    useEffect(() => {
        if (!open) return
        const interval = setInterval(() => forceTick((t) => t + 1), 1000)
        return () => clearInterval(interval)
    }, [open])

    if (pendingJobs.length === 0) return null

    return (
        <div className='jobs-indicator'>
            <button
                type='button'
                className='jobs-indicator__button'
                onClick={() => setOpen((o) => !o)}
            >
                <span className='jobs-indicator__spinner' />
                {pendingJobs.length} generating...
            </button>

            {open && (
                <ul className='jobs-indicator__dropdown'>
                    {pendingJobs.map((job) => (
                        <li key={job.jobId} className='jobs-indicator__item'>
                            <span className='jobs-indicator__job-id'>{jobStatusMessage(job)}</span>
                            <span className='jobs-indicator__elapsed'>{elapsedLabel(job.submittedAt)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

export default Header
