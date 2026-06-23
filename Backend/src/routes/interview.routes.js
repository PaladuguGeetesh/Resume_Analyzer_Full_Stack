const express=require('express');
const {authUser}=require('../middleware/auth.middleware');
const {generateInterviewReportController,getInterviewReportByIdController, getAllInterviewReportsController,generateResumePdfController}=require('../controllers/interview.controller')
const upload=require('../middleware/file.middleware')

const interviewRouter=express.Router();


/**
 * @route POST /api/interview/
 * @desc generate interview report for the candidate based on the resume,self description and job description provided by the candidate
 * @access Private
 */
interviewRouter.post("/",authUser,upload.single('resume'),generateInterviewReportController)

/**
 * @route GET /api/interview/report/:interviewId
 * @desc get the interview report for the candidate based on the interviewId provided by the candidate
 * @access Private
 */

interviewRouter.get("/report/:interviewId",authUser,getInterviewReportByIdController)

/**
 * @route GET /api/interview/reports
 * @desc get all the interview reports for the candidate based on the userId provided by the candidate
 * @access Private
 */
interviewRouter.get("/",authUser,getAllInterviewReportsController)

interviewRouter.post("/resume/pdf/:interviewReportId",authUser,generateResumePdfController)

module.exports=interviewRouter;