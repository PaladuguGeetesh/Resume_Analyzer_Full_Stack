const {Queue}=require('bullmq')
const Redis=require('ioredis')

const QUEUE_NAME="interview-reports"

// BullMQ requires its own connection with maxRetriesPerRequest:null (it uses
// blocking commands that are incompatible with ioredis's default retry behavior),
// so this can't reuse the shared client from config/redis.js as-is — same Redis
// target, dedicated instance.
const connection=new Redis(process.env.REDIS_URL||"redis://localhost:6379",{
    maxRetriesPerRequest:null
})

const interviewQueue=new Queue(QUEUE_NAME,{connection})

async function enqueueInterviewReportJob(jobData){
    return interviewQueue.add("generate-report",jobData,{
        attempts:3,
        backoff:{
            type:"exponential",
            delay:2000
        }
    })
}

module.exports={interviewQueue,enqueueInterviewReportJob,QUEUE_NAME}
