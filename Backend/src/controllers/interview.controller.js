const pdfParse=require('pdf-parse');
const {generateResumePdf,AIServiceUnavailableError}=require('../services/ai.service');
const interviewReportModel=require('../models/interviewReport.model')
const asyncHandler=require('../utils/asyncHandler')
const {interviewQueue,enqueueInterviewReportJob}=require('../queues/interview.queue')
const redisClient=require('../config/redis')
const idempotency=require('../middleware/idempotency.middleware')



/**
 * @description Extracts plain text from an uploaded PDF's buffer — shared by the resume,
 * job description, and self description fields, all of which can arrive as a PDF upload.
 */
const extractPdfText=async(buffer)=>{
    const parsedPdf=await(new pdfParse.PDFParse(Uint8Array.from(buffer))).getText()
    return parsedPdf.text
}

/**
 * @description Controller to enqueue interview report generation as a background job
 * @route POST /api/v1/interview/
 * @access Private
 */
const generateInterviewReportController=async(req,res)=>{

    const resumeFile=req.files?.resume?.[0]
    const jobDescriptionFile=req.files?.jobDescriptionFile?.[0]
    const selfDescriptionFile=req.files?.selfDescriptionFile?.[0]

    const resumeContent=await extractPdfText(resumeFile.buffer)

    // requireJobDescriptionAndSelfDescription (interview.routes.js) already guarantees at
    // least one of {text, file} exists for each of these — the uploaded PDF wins over
    // typed text when both are present.
    const jobDescription=jobDescriptionFile
        ? await extractPdfText(jobDescriptionFile.buffer)
        : req.body.jobDescription

    const selfDescription=selfDescriptionFile
        ? await extractPdfText(selfDescriptionFile.buffer)
        : req.body.selfDescription

    const idempotencyRedisKey=idempotency.buildRedisKey(req.user.id,req.idempotencyKey)

    let job
    try{
        job=await enqueueInterviewReportJob({
            userId:req.user.id,
            resumeContent,
            selfDescription,
            jobDescription
        })
    }catch(err){
        // don't leave the idempotency key stuck at "in_progress" forever — let a retry with the same key proceed
        await redisClient.del(idempotencyRedisKey)
        throw err
    }

    await redisClient.set(
        idempotencyRedisKey,
        JSON.stringify({status:"completed",jobId:job.id}),
        "EX",
        idempotency.TTL_SECONDS
    )

    res.status(202).json({
        message:"Report generation started",
        jobId:job.id
    })

}

/**
 * @description Controller to get the status (and result, once completed) of an interview report generation job
 * @route GET /api/v1/interview/status/:jobId
 * @access Private
 */
const getInterviewReportStatusController=async(req,res)=>{

    const {jobId}=req.params
    const job=await interviewQueue.getJob(jobId)

    if(!job){
        return res.status(404).json({
            message:"job not found"
        })
    }

    const state=await job.getState()

    res.status(200).json({
        message:"job status fetched successfully",
        jobId:job.id,
        state,
        ...(state==="completed" && {result:job.returnvalue}),
        ...(state==="failed" && {failedReason:job.failedReason})
    })

}

/**
 * @description Controller to get interview report by id
 * @route GET /api/v1/interview/report/:interviewId
 * @access Private
 */
const getInterviewReportByIdController=async(req,res)=>{

    const {interviewId}=req.params
    const interviewReport=await interviewReportModel.findOne({_id:interviewId,user:req.user.id})

    if(!interviewReport){
        return res.status(404).json({
            message:"interview report not found"
        })
    }

    res.status(200).json({
        message:"interview report fetched successfully.",
        interviewReport
    })

}

/**
 * @description Controller to get all interview reports for the current user
 * @route GET /api/v1/interview/reports
 * @access Private
 */
const getAllInterviewReportsController=async(req,res)=>{

    const interviewReports = await interviewReportModel.find({ user: req.user.id }).sort({ createdAt: -1 }).select("-resume -selfDescription -jobDescription -__v -technicalQuestions -behavioralQuestions -skillGaps -preparationPlan")

    res.status(200).json({
        message: "Interview reports fetched successfully.",
        interviewReports
    })

}

/**
 * @description Controller to generate resume PDF
 * @route GET /api/v1/interview/resume/:interviewReportId
 * @access Private
 */
const generateResumePdfController=async(req,res)=>{

    const {interviewReportId}=req.params

    const interviewReport=await interviewReportModel.findOne({_id:interviewReportId,user:req.user.id})

    if(!interviewReport){
        return res.status(404).json({
            message:"interview report not found"
        })
    }

    const {resume,selfDescription,jobDescription}=interviewReport

    // generateResumePdf stays in the synchronous request path (no queue/worker for this
    // one) — AIServiceUnavailableError means the shared breaker (see ai.service.js) has
    // already tripped, so fail fast with a clean 503 instead of a raw error/stack trace.
    let pdfBuffer
    try{
        pdfBuffer=await generateResumePdf({resume,selfDescription,jobDescription})
    }catch(err){
        if(err instanceof AIServiceUnavailableError){
            return res.status(503).json({
                message:"AI service temporarily unavailable, please try again shortly"
            })
        }
        throw err
    }

    res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="resume_${interviewReportId}.pdf"`,        
    })

    res.send(pdfBuffer)
}



module.exports={
    generateInterviewReportController:asyncHandler(generateInterviewReportController),
    getInterviewReportByIdController:asyncHandler(getInterviewReportByIdController),
    getAllInterviewReportsController:asyncHandler(getAllInterviewReportsController),
    generateResumePdfController:asyncHandler(generateResumePdfController),
    getInterviewReportStatusController:asyncHandler(getInterviewReportStatusController)
};