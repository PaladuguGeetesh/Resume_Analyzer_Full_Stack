const pdfParse=require('pdf-parse');
const interviewReportModel=require('../models/interviewReport.model')
const generatedResumePdfModel=require('../models/generatedResumePdf.model')
const asyncHandler=require('../utils/asyncHandler')
const {interviewQueue,enqueueInterviewReportJob}=require('../queues/interview.queue')
const {resumePdfQueue,enqueueResumePdfJob}=require('../queues/resumePdf.queue')
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

    // same IDOR discipline as the resume-PDF status/file lookups: a job that exists but
    // belongs to someone else is reported as "not found", never distinguished from a
    // genuinely nonexistent one — job IDs are small sequential integers, easily guessable
    if(!job || job.data.userId!==req.user.id){
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
 * @description Controller to enqueue tailored resume PDF generation as a background job
 * @route POST /api/v1/interview/resume-pdf/:reportId
 * @access Private
 */
const generateResumePdfController=async(req,res)=>{

    const {reportId}=req.params

    const interviewReport=await interviewReportModel.findOne({_id:reportId,user:req.user.id})

    if(!interviewReport){
        return res.status(404).json({
            message:"interview report not found"
        })
    }

    const {resume,selfDescription,jobDescription}=interviewReport

    // distinct prefix ("idempotency:resume-pdf:...") from the report-generation idempotency
    // keys — see idempotency.middleware.js's withPrefix and interview.routes.js
    const idempotencyRedisKey=idempotency.buildRedisKey(req.user.id,req.idempotencyKey,"idempotency:resume-pdf")

    let job
    try{
        job=await enqueueResumePdfJob({
            userId:req.user.id,
            resume,
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
        message:"Resume PDF generation started",
        jobId:job.id
    })
}

/**
 * @description Controller to get the status (and result, once completed) of a resume-PDF generation job
 * @route GET /api/v1/interview/resume-pdf/status/:jobId
 * @access Private
 */
const getResumePdfStatusController=async(req,res)=>{

    const {jobId}=req.params
    const job=await resumePdfQueue.getJob(jobId)

    // same IDOR discipline as the report/resume-file lookups below: a job that exists but
    // belongs to someone else is reported as "not found", never distinguished from a
    // genuinely nonexistent one
    if(!job || job.data.userId!==req.user.id){
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
 * @description Controller to fetch a generated resume PDF file once ready
 * @route GET /api/v1/interview/resume-pdf/:id
 * @access Private
 */
const getResumePdfFileController=async(req,res)=>{

    const {id}=req.params

    const generatedResumePdf=await generatedResumePdfModel.findOne({_id:id,user:req.user.id})

    // covers both "never existed", "belongs to someone else", and "TTL already expired it"
    // with the same response — same IDOR discipline as Day 1, never leak which case it was
    if(!generatedResumePdf){
        return res.status(404).json({
            message:"This download has expired — please generate a new one."
        })
    }

    const pdfBuffer=Buffer.from(generatedResumePdf.pdfData,"base64")

    res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="resume.pdf"',
    })

    res.send(pdfBuffer)
}



module.exports={
    generateInterviewReportController:asyncHandler(generateInterviewReportController),
    getInterviewReportByIdController:asyncHandler(getInterviewReportByIdController),
    getAllInterviewReportsController:asyncHandler(getAllInterviewReportsController),
    generateResumePdfController:asyncHandler(generateResumePdfController),
    getInterviewReportStatusController:asyncHandler(getInterviewReportStatusController),
    getResumePdfStatusController:asyncHandler(getResumePdfStatusController),
    getResumePdfFileController:asyncHandler(getResumePdfFileController)
};