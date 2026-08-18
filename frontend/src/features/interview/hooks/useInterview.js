import {getAllInterviewReports,getInterviewReportById,generateInterviewReport} from '../services/interview.api'
import { useCallback, useContext, useEffect } from "react"
import { InterviewContext } from "../interview-context"
import { useParams } from "react-router"
import toast from "react-hot-toast"

export const useInterview=()=>{

    const context=useContext(InterviewContext)
    const { interviewId } = useParams()

    if(!context){
        throw new Error("useInterview must be used within InterviewProvider")
    }

    const {loading,setLoading,report,setReport,reports,setReports}=context

    // Report generation is now a background job (Backend Day 4): this only enqueues it and
    // returns the jobId — it deliberately does NOT touch `loading`/`report`, since there's no
    // report to show yet. The caller is responsible for tracking the job (see useJobs/addPendingJob)
    // and for handling/surfacing errors — errors are left to propagate, not swallowed here.
    // idempotencyKey is supplied by the caller (not generated here) so it can identify one
    // logical submission attempt and stay the same across retries of that same attempt —
    // see Home.jsx for how the key's lifecycle is actually managed.
    const generateReport=async({selfDescription,jobDescription,resumeFile,jobDescriptionFile,selfDescriptionFile,idempotencyKey})=>{
        const response=await generateInterviewReport({selfDescription,jobDescription,resumeFile,jobDescriptionFile,selfDescriptionFile,idempotencyKey})
        return response.jobId
    }

    // wrapped in useCallback (stable identity, since setLoading/setReport/setReports are
    // useState setters and never change) so the useEffect below can safely list these as
    // dependencies without re-running on every render
    const getReportById=useCallback(async(interviewId)=>{

        setLoading(true);
        let response=null
        try{
            response=await getInterviewReportById(interviewId)
            setReport(response.interviewReport)
        }
        catch(error){
            console.log(error)
        }
        finally{
            setLoading(false)
        }
        return response?.interviewReport
    },[setLoading,setReport])

    const getReports=useCallback(async()=>{
        setLoading(true);
        let response=null
        try{
            response=await getAllInterviewReports()
            setReports(response.interviewReports)
        }  catch(error){
            console.log(error)
            toast.error("Couldn't load your reports — please try again.")
        }   finally{
            setLoading(false)
        }

        return response?.interviewReports
    },[setLoading,setReports])

    useEffect(() => {
        if (interviewId) {
            getReportById(interviewId)
        } else {
            getReports()
        }
    }, [ interviewId, getReportById, getReports ])
    return {loading,report,reports,generateReport,getReportById,getReports}
}

