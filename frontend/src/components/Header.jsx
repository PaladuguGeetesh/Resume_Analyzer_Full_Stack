import { useState, useEffect } from 'react'
import { useJobs } from '../features/interview/hooks/useJobs'
import './header.scss'

function elapsedLabel(submittedAt) {
    const seconds = Math.max(0, Math.floor((Date.now() - submittedAt) / 1000))
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m ago`
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
                            <span className='jobs-indicator__job-id'>Job {job.jobId}</span>
                            <span className='jobs-indicator__elapsed'>{elapsedLabel(job.submittedAt)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

export default Header
