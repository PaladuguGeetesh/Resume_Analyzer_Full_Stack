require('dotenv').config()

const {Worker}=require('bullmq')
const Redis=require('ioredis')

const connectToDB=require('./src/config/database')
const {generateInterviewReport,AIServiceUnavailableError}=require('./src/services/ai.service')
const interviewReportModel=require('./src/models/interviewReport.model')
const {QUEUE_NAME}=require('./src/queues/interview.queue')

connectToDB()

const connection=new Redis(process.env.REDIS_URL||"redis://localhost:6379",{
    maxRetriesPerRequest:null
})

const worker=new Worker(QUEUE_NAME,async(job)=>{
    console.log(`[worker] starting job ${job.id} for user ${job.data.userId}`)

    const {userId,resumeContent,selfDescription,jobDescription}=job.data

    let interviewReportByAi
    try{
        interviewReportByAi=await generateInterviewReport({
            resume:resumeContent,
            selfDescription,
            jobDescription
        })
    }catch(err){
    if(err instanceof AIServiceUnavailableError){
        console.error(`[worker] job ${job.id} failed fast — circuit breaker is open, AI service is down`)
    } else {
        console.error(`[worker] job ${job.id} failed — AI service error: ${err.message}`)
    }
    // rethrow so BullMQ marks the job failed and applies its attempts/backoff retry policy
    throw err;
}

    const interviewReport=await interviewReportModel.create({
        user:userId,
        resume:resumeContent,
        selfDescription,
        jobDescription,
        ...interviewReportByAi
    })

    console.log(`[worker] job ${job.id} completed, created report ${interviewReport._id}`)

    return {interviewReportId:interviewReport._id}
},{connection})

worker.on('completed',(job)=>{
    console.log(`[worker] job ${job.id} succeeded`)
})

worker.on('failed',(job,err)=>{
    console.error(`[worker] job ${job?.id} failed:`,err.message)
})

worker.on('error',(err)=>{
    console.error('[worker] worker error:',err)
})

console.log(`[worker] listening on queue "${QUEUE_NAME}"`)
