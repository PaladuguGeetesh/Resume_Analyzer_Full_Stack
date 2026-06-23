const pdfParse=require('pdf-parse');
const {generateInterviewReport,generateResumePdf}=require('../services/ai.service');
const interviewReportModel=require('../models/interviewReport.model')



/**
 * @description Controller to generate interview report using AI service and save it to the database
 * @route POST /api/interview/
 * @access Private
 */
const generateInterviewReportController=async(req,res)=>{

    
    const parsedPdf=await(new pdfParse.PDFParse(Uint8Array.from(req.file.buffer))).getText()
    const resumeContent=parsedPdf.text;
    const {selfDescription,jobDescription}=req.body

    const interviewReportByAi=await generateInterviewReport({
        resume:resumeContent,
        selfDescription,
        jobDescription
    })

    const interviewReport=await interviewReportModel.create({
        user:req.user.id,
        resume:resumeContent,
        selfDescription,
        jobDescription,
        ...interviewReportByAi
    })

    res.status(201).json({
        message:"interview report generated successfully",
        interviewReport
    })

}

/**
 * @description Controller to get interview report by id
 * @route GET /api/interview/report/:interviewId
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
 * @route GET /api/interview/reports
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
 * @route GET /api/interview/resume/:interviewReportId
 * @access Private
 */
const generateResumePdfController=async(req,res)=>{

    const {interviewReportId}=req.params

    const interviewReport=await interviewReportModel.findById(interviewReportId)

    if(!interviewReport){
        return res.status(404).json({
            message:"interview report not found"
        })
    }

    const {resume,selfDescription,jobDescription}=interviewReport

    const pdfBuffer=await generateResumePdf({resume,selfDescription,jobDescription})

    res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="resume_${interviewReportId}.pdf"`,        
    })

    res.send(pdfBuffer)
}



module.exports={generateInterviewReportController,getInterviewReportByIdController,getAllInterviewReportsController,generateResumePdfController};