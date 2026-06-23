import axios from 'axios';
/**
 * @description Axios instance for making API requests to the backend server
 * @param {string} baseURL - The base URL of the backend server
 * @param {boolean} withCredentials - Whether to include credentials (cookies) in requests
 * @returns {object} Axios instance
 */
const api=axios.create({
    baseURL:"http://localhost:3000",
    withCredentials:true,
})

/**
 * @description Function to generate an interview report by sending job description, self description, and resume file to the backend server
 * 
 * 
 */
export const generateInterviewReport= async({jobDescription,selfDescription,resumeFile})=>{

    const formData=new FormData()
    formData.append("jobDescription",jobDescription)
    formData.append("selfDescription",selfDescription)
    formData.append("resume",resumeFile)

    const response= await api.post("/api/interview",formData,{
        headers:{
            "Content-Type":"multipart/form-data"
        }
    })

    return response.data
}

/**
 * @description Function to get an interview report by its ID
 * @param {string} interviewId - The ID of the interview report to fetch
 * @returns {Promise} - A promise resolving to the interview report data
 */

export const getInterviewReportById=async (interviewId)=>{
    const response= await api.get(`/api/interview/report/${interviewId}`)
    return response.data
}

/**
 * @description Function to get all interview reports for the authenticated user
 * @returns {Promise} - A promise resolving to the list of interview reports
 */
export const getAllInterviewReports=async()=>{
    const response= await api.get("/api/interview/")

    return response.data
}

/**
 * @description Function to generate a PDF of the candidate's resume
 * @param {string} interviewReportId - The ID of the interview report for which to generate the resume PDF
 * @returns {Promise} - A promise resolving to the generated PDF blob
 */
export const generateResumePdf=async({interviewReportId})=>{
    const response =await api.post(`/api/interview/resume/pdf/${interviewReportId}`,null,{
        responseType:"blob"
     })
    return response.data
}