import { useEffect, useMemo, useState } from 'react'
import "../style/home.scss"
import { useInterview } from '../hooks/useInterview.js'
import { useJobs } from '../hooks/useJobs.js'
import { useFileUpload } from '../hooks/useFileUpload.js'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import Header from '../../../components/Header.jsx'

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Renders one upload slot (resume / job description / self description) — same markup,
// parameterized by a useFileUpload() instance so each slot's state stays independent.
function FileDropzone({ id, upload, subtitle = 'PDF only (Max 5MB)' }) {
    const { selectedFile, fileError, inputRef, handleFileChange, handleRemoveFile } = upload

    return (
        <div className='upload-section'>
            <label
                className={`dropzone ${selectedFile ? 'dropzone--selected' : ''} ${fileError ? 'dropzone--error' : ''}`}
                htmlFor={id}
            >
                {selectedFile ? (
                    <>
                        <span className='dropzone__icon dropzone__icon--success'>
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        </span>
                        <p className='dropzone__title dropzone__filename' title={selectedFile.name}>{selectedFile.name}</p>
                        <p className='dropzone__subtitle'>{formatFileSize(selectedFile.size)}</p>
                        <button type='button' className='dropzone__remove' onClick={handleRemoveFile}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            Remove
                        </button>
                    </>
                ) : (
                    <>
                        <span className='dropzone__icon'>
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" /></svg>
                        </span>
                        <p className='dropzone__title'>Click to upload or drag &amp; drop</p>
                        <p className='dropzone__subtitle'>No file selected &bull; {subtitle}</p>
                    </>
                )}
                <input
                    ref={inputRef}
                    hidden
                    type='file'
                    id={id}
                    name={id}
                    accept='.pdf,application/pdf'
                    onChange={handleFileChange}
                />
            </label>
            {fileError && <p className='dropzone__error'>{fileError}</p>}
        </div>
    )
}

const Home = () => {

    const { loading, generateReport, reports } = useInterview()
    const { addPendingJob, requestNotificationPermissionOnce } = useJobs()
    const [ jobDescription, setJobDescription ] = useState("")
    const [ selfDescription, setSelfDescription ] = useState("")
    const [ submitting, setSubmitting ] = useState(false)

    const resumeUpload = useFileUpload()
    const jobDescriptionUpload = useFileUpload()
    const selfDescriptionUpload = useFileUpload()

    const navigate = useNavigate()

    // Warn before an accidental refresh/close discards typed text or a selected file — a
    // browser refresh can never restore a file input's selection (no code fix can change
    // that), so the best available mitigation is asking for confirmation before it happens.
    useEffect(() => {
        const hasUnsavedInput = Boolean(
            jobDescription.trim() ||
            selfDescription.trim() ||
            resumeUpload.selectedFile ||
            jobDescriptionUpload.selectedFile ||
            selfDescriptionUpload.selectedFile
        )

        if (!hasUnsavedInput) {
            return
        }

        const handleBeforeUnload = (e) => {
            e.preventDefault()
            e.returnValue = ''
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [ jobDescription, selfDescription, resumeUpload.selectedFile, jobDescriptionUpload.selectedFile, selfDescriptionUpload.selectedFile ])

    // The idempotency key identifies one logical submission attempt, not one network call —
    // it must stay the SAME across retries of that attempt (e.g. the request times out
    // client-side but actually succeeded server-side; resubmitting with the same key lets
    // the backend return the original result instead of enqueuing a second job) and only
    // change once the user actually submits different content. Derived via useMemo (not
    // state+effect) since it's purely a function of the current form values, recomputed
    // only when one of them actually changes — same deps as the beforeunload effect above.
    // The deps below are deliberately unused *inside* the callback — they only exist to
    // invalidate the memo (force a new UUID) when the submittable content changes, which is
    // exactly what trips exhaustive-deps here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const idempotencyKey = useMemo(() => crypto.randomUUID(), [ jobDescription, selfDescription, resumeUpload.selectedFile, jobDescriptionUpload.selectedFile, selfDescriptionUpload.selectedFile ])

    const handleGenerateReport = async () => {
        // must fire synchronously inside the click handler, before any `await` — once an
        // async gap breaks the link to the user gesture, Chrome silently downgrades the
        // permission prompt to a small address-bar icon instead of asking outright, so it
        // effectively never gets granted (see jobs.context.jsx's requestNotificationPermissionOnce)
        requestNotificationPermissionOnce()

        setSubmitting(true)
        try {
            const jobId = await generateReport({
                jobDescription,
                selfDescription,
                resumeFile: resumeUpload.selectedFile,
                jobDescriptionFile: jobDescriptionUpload.selectedFile,
                selfDescriptionFile: selfDescriptionUpload.selectedFile,
                idempotencyKey,
            })
            addPendingJob(jobId)
            toast.success("Report generation started — you'll be notified when it's ready.")

            // clears the "unsaved input" state driving the beforeunload warning above, and
            // resets the form for a second report in the same session
            setJobDescription("")
            setSelfDescription("")
            resumeUpload.reset()
            jobDescriptionUpload.reset()
            selfDescriptionUpload.reset()
        } catch (err) {
            const status = err.response?.status
            const fieldErrors = err.response?.data?.errors
            const serverMessage = err.response?.data?.message

            if (status === 400) {
                const detail = Array.isArray(fieldErrors) && fieldErrors.length > 0
                    ? fieldErrors.map((e) => e.message).join(", ")
                    : serverMessage
                toast.error(detail || "Please check your job description and resume/self-description.")
            } else if (status === 409) {
                toast.error("This request is already being processed — hang tight.")
            } else {
                toast.error(serverMessage || "Something went wrong starting report generation. Please try again.")
            }
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <main className='loading-screen'>
                <h1>Loading your interview plan...</h1>
            </main>
        )
    }

    return (
        <div className='home-page'>
            <Header />

            {/* Page Header */}
            <header className='page-header'>
                <h1>Create Your Custom <span className='highlight'>Interview Plan</span></h1>
                <p>Let our AI analyze the job requirements and your unique profile to build a winning strategy.</p>
            </header>

            {/* Main Card */}
            <div className='interview-card'>
                <div className='interview-card__body'>

                    {/* Left Panel - Job Description */}
                    <div className='panel panel--left'>
                        <div className='panel__header'>
                            <span className='panel__icon'>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                            </span>
                            <h2>Target Job Description</h2>
                            <span className='badge badge--required'>Required</span>
                        </div>
                        <div className='textarea-wrapper'>
                            <textarea
                                value={jobDescription}
                                onChange={(e) => { setJobDescription(e.target.value) }}
                                className='panel__textarea'
                                placeholder={`Paste the full job description here...\ne.g. 'Senior Frontend Engineer at Google requires proficiency in React, TypeScript, and large-scale system design...'`}
                                maxLength={5000}
                            />
                            <div className='char-counter'>{jobDescription.length} / 5000 chars</div>
                        </div>

                        {/* OR Divider */}
                        <div className='or-divider'><span>OR</span></div>

                        {/* Upload Job Description as PDF */}
                        <FileDropzone id='jobDescriptionFile' upload={jobDescriptionUpload} />
                    </div>

                    {/* Vertical Divider */}
                    <div className='panel-divider' />

                    {/* Right Panel - Profile */}
                    <div className='panel panel--right'>
                        <div className='panel__header'>
                            <span className='panel__icon'>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                            </span>
                            <h2>Your Profile</h2>
                        </div>

                        {/* Upload Resume */}
                        <div>
                            <label className='section-label'>
                                Upload Resume
                                <span className='badge badge--required'>Required</span>
                            </label>
                            <FileDropzone id='resume' upload={resumeUpload} />
                        </div>

                        <div className='section-divider' />

                        {/* Quick Self-Description */}
                        <div className='self-description'>
                            <label className='section-label' htmlFor='selfDescription'>
                                Quick Self-Description
                                <span className='badge badge--required'>Required</span>
                            </label>
                            <textarea
                                value={selfDescription}
                                onChange={(e) => { setSelfDescription(e.target.value) }}
                                id='selfDescription'
                                name='selfDescription'
                                className='panel__textarea panel__textarea--short'
                                placeholder="Briefly describe your experience, key skills, and years of experience if you don't have a resume handy..."
                            />

                            {/* OR Divider */}
                            <div className='or-divider'><span>OR</span></div>

                            {/* Upload Self-Description as PDF */}
                            <FileDropzone id='selfDescriptionFile' upload={selfDescriptionUpload} />
                        </div>

                        {/* Info Box */}
                        <div className='info-box'>
                            <span className='info-box__icon'>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" stroke="#1a1f27" strokeWidth="2" /><line x1="12" y1="16" x2="12.01" y2="16" stroke="#1a1f27" strokeWidth="2" /></svg>
                            </span>
                            <p><strong>Resume</strong>, <strong>Job Description</strong>, and <strong>Self Description</strong> are all required to generate a personalized plan — each can be typed or uploaded as a PDF where applicable.</p>
                        </div>
                    </div>
                </div>

                {/* Card Footer */}
                <div className='interview-card__footer'>
                    <span className='footer-info'>AI-Powered Strategy Generation &bull; Approx 30s</span>
                    <button
                        onClick={handleGenerateReport}
                        disabled={submitting}
                        className='generate-btn'>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" /></svg>
                        {submitting ? 'Starting...' : 'Generate My Interview Strategy'}
                    </button>
                </div>
            </div>

            {/* Recent Reports List */}
            {reports.length > 0 && (
                <section className='recent-reports'>
                    <h2>My Recent Interview Plans</h2>
                    <ul className='reports-list'>
                        {reports.map(report => (
                            <li key={report._id} className='report-item' onClick={() => navigate(`/interview/${report._id}`)}>
                                <h3>{report.title || 'Untitled Position'}</h3>
                                <p className='report-meta'>Generated on {new Date(report.createdAt).toLocaleDateString()}</p>
                                <p className={`match-score ${report.matchScore >= 80 ? 'score--high' : report.matchScore >= 60 ? 'score--mid' : 'score--low'}`}>Match Score: {report.matchScore}%</p>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Page Footer */}
            <footer className='page-footer'>
                <a href='#'>Privacy Policy</a>
                <a href='#'>Terms of Service</a>
                <a href='#'>Help Center</a>
            </footer>
        </div>
    )
}

export default Home
