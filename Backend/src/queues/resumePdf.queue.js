const {Queue}=require('bullmq')
const Redis=require('ioredis')

const RESUME_PDF_QUEUE_NAME="resume-pdfs"

// A genuinely separate queue (not a second job type on "interview-reports") with its own
// connection — same Redis target as interview.queue.js, but a dedicated ioredis instance,
// mirroring that file's own reasoning: BullMQ needs maxRetriesPerRequest:null for its
// blocking commands, and giving each queue its own client keeps their connection
// lifecycles/backpressure fully independent (a spike in one queue's traffic can't starve
// the other's connection).
const connection=new Redis(process.env.REDIS_URL||"redis://localhost:6379",{
    maxRetriesPerRequest:null
})

const resumePdfQueue=new Queue(RESUME_PDF_QUEUE_NAME,{connection})

async function enqueueResumePdfJob(jobData){
    return resumePdfQueue.add("generate-resume-pdf",jobData,{
        attempts:3,
        backoff:{
            type:"exponential",
            delay:2000
        }
    })
}

module.exports={resumePdfQueue,enqueueResumePdfJob,RESUME_PDF_QUEUE_NAME}
