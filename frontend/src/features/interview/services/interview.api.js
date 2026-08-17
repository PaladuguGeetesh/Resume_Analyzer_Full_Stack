import api from '../../../lib/apiClient'

/**
 * @description Function to enqueue interview report generation by sending job description, self
 * description, and resume file to the backend server. The backend processes this as a background
 * job (see Backend Day 4) — this resolves immediately with { message, jobId }, not the finished report.
 * jobDescription and selfDescription can each be supplied as typed text OR as a PDF file — the
 * backend prefers the PDF when both are present for a given field.
 * @param {string} idempotencyKey - required by the backend (Day 6) to dedupe retried/duplicate submissions
 */
export const generateInterviewReport= async({jobDescription,selfDescription,resumeFile,jobDescriptionFile,selfDescriptionFile,idempotencyKey})=>{

    const formData=new FormData()
    formData.append("jobDescription",jobDescription)
    formData.append("selfDescription",selfDescription)
    formData.append("resume",resumeFile)
    if(jobDescriptionFile){
        formData.append("jobDescriptionFile",jobDescriptionFile)
    }
    if(selfDescriptionFile){
        formData.append("selfDescriptionFile",selfDescriptionFile)
    }

    const response= await api.post("/interview",formData,{
        headers:{
            "Content-Type":"multipart/form-data",
            "Idempotency-Key":idempotencyKey
        }
    })

    return response.data
}

/**
 * @description Function to poll the status of a report-generation job
 * @param {string} jobId - the job ID returned by generateInterviewReport
 * @returns {Promise} - resolves to { state, result?, failedReason? }
 */
export const getInterviewReportStatus=async(jobId)=>{
    const response=await api.get(`/interview/status/${jobId}`)
    return response.data
}

/**
 * @description Function to get an interview report by its ID
 * @param {string} interviewId - The ID of the interview report to fetch
 * @returns {Promise} - A promise resolving to the interview report data
 */

export const getInterviewReportById=async (interviewId)=>{
    const response= await api.get(`/interview/report/${interviewId}`)
    return response.data
}

/**
 * @description Function to get all interview reports for the authenticated user
 * @returns {Promise} - A promise resolving to the list of interview reports
 */
export const getAllInterviewReports=async()=>{
    const response= await api.get("/interview/")

    return response.data
}

/**
 * @description Function to generate a PDF of the candidate's resume
 * @param {string} interviewReportId - The ID of the interview report for which to generate the resume PDF
 * @returns {Promise} - A promise resolving to the generated PDF blob
 */
export const generateResumePdf=async({interviewReportId})=>{
    const response =await api.post(`/interview/resume/pdf/${interviewReportId}`,null,{
        responseType:"blob"
     })
    return response.data
}