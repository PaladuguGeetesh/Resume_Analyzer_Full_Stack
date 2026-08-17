const express=require('express');
const {authUser}=require('../middleware/auth.middleware');
const {generateInterviewReportController,getInterviewReportByIdController, getAllInterviewReportsController,generateResumePdfController,getInterviewReportStatusController}=require('../controllers/interview.controller')
const upload=require('../middleware/file.middleware')
const validate=require('../middleware/validate.middleware')
const idempotency=require('../middleware/idempotency.middleware')
const {generateReportSchema}=require('../validators/interview.validator')

const interviewRouter=express.Router();

// jobDescription and selfDescription can each arrive as typed text (validated by
// generateReportSchema) OR as an uploaded PDF (jobDescriptionFile/selfDescriptionFile,
// parsed in the controller) — this runs after multer/validate so both req.body and
// req.files are populated, and before idempotency so a rejected request never marks an
// idempotency key as in-progress.
const requireJobDescriptionAndSelfDescription=(req,res,next)=>{
    const hasJobDescription=Boolean(req.body.jobDescription)||Boolean(req.files?.jobDescriptionFile?.[0])
    const hasSelfDescription=Boolean(req.body.selfDescription)||Boolean(req.files?.selfDescriptionFile?.[0])

    if(!hasJobDescription){
        return res.status(400).json({message:"Job description is required, either as text or a PDF upload"})
    }
    if(!hasSelfDescription){
        return res.status(400).json({message:"Self description is required, either as text or a PDF upload"})
    }
    next()
}

/**
 * @route POST /api/v1/interview/
 * @desc generate interview report for the candidate based on the resume, self description and job description provided by the candidate — self description and job description may each be plain text or an uploaded PDF
 * @access Private
 */
interviewRouter.post(
    "/",
    authUser,
    upload.fields([
        {name:'resume',maxCount:1},
        {name:'jobDescriptionFile',maxCount:1},
        {name:'selfDescriptionFile',maxCount:1},
    ]),
    validate(generateReportSchema),
    requireJobDescriptionAndSelfDescription,
    idempotency,
    generateInterviewReportController,
)

/**
 * @route GET /api/v1/interview/report/:interviewId
 * @desc get the interview report for the candidate based on the interviewId provided by the candidate
 * @access Private
 */

interviewRouter.get("/report/:interviewId",authUser,getInterviewReportByIdController)

/**
 * @route GET /api/v1/interview/status/:jobId
 * @desc get the status (and result, once completed) of an interview report generation job
 * @access Private
 */

interviewRouter.get("/status/:jobId",authUser,getInterviewReportStatusController)

/**
 * @route GET /api/v1/interview/reports
 * @desc get all the interview reports for the candidate based on the userId provided by the candidate
 * @access Private
 */
interviewRouter.get("/",authUser,getAllInterviewReportsController)

interviewRouter.post("/resume/pdf/:interviewReportId",authUser,generateResumePdfController)

module.exports=interviewRouter;