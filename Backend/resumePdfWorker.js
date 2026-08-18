const {Worker}=require('bullmq')
const Redis=require('ioredis')

const {generateResumePdf,AIServiceUnavailableError}=require('./src/services/ai.service')
const generatedResumePdfModel=require('./src/models/generatedResumePdf.model')
const {RESUME_PDF_QUEUE_NAME}=require('./src/queues/resumePdf.queue')

// Exported instead of self-executing, same reasoning as worker.js's startWorker — dotenv
// config and the DB connection are the caller's responsibility (worker-resumes-standalone.js).
function startResumePdfWorker(){
    // own connection, separate from resumePdf.queue.js's — matches how worker.js and
    // interview.queue.js each get their own connection for the report queue too (Queue and
    // Worker sides of the same queue conventionally don't share a client)
    const connection=new Redis(process.env.REDIS_URL||"redis://localhost:6379",{
        maxRetriesPerRequest:null
    })

    const worker=new Worker(RESUME_PDF_QUEUE_NAME,async(job)=>{
        console.log(`[resume-pdf-worker] starting job ${job.id} for user ${job.data.userId}`)

        const {userId,resume,selfDescription,jobDescription}=job.data

        // generateResumePdf (ai.service.js) already does the full pipeline — provider call
        // (through the SAME shared circuit breaker + AI_PRIMARY_PROVIDER abstraction the
        // report worker uses, unmodified) followed by generatePdfFromHtml — and returns the
        // final PDF Buffer directly, so there's no separate generatePdfFromHtml call to make
        // here.
        let pdfBuffer
        try{
            pdfBuffer=await generateResumePdf({
                resume,
                selfDescription,
                jobDescription
            })
        }catch(err){
        if(err instanceof AIServiceUnavailableError){
            console.error(`[resume-pdf-worker] job ${job.id} failed fast — circuit breaker is open, AI service is down`)
        } else {
            console.error(`[resume-pdf-worker] job ${job.id} failed — AI service error: ${err.message}`)
        }
        // rethrow so BullMQ marks the job failed and applies its attempts/backoff retry policy
        throw err;
    }

        const generatedResumePdf=await generatedResumePdfModel.create({
            user:userId,
            pdfData:pdfBuffer.toString("base64")
        })

        console.log(`[resume-pdf-worker] job ${job.id} completed, stored pdf ${generatedResumePdf._id}`)

        return {pdfId:generatedResumePdf._id}
    },{connection})

    worker.on('completed',(job)=>{
        console.log(`[resume-pdf-worker] job ${job.id} succeeded`)
    })

    worker.on('failed',(job,err)=>{
        console.error(`[resume-pdf-worker] job ${job?.id} failed:`,err.message)
    })

    worker.on('error',(err)=>{
        console.error('[resume-pdf-worker] worker error:',err)
    })

    console.log(`[resume-pdf-worker] listening on queue "${RESUME_PDF_QUEUE_NAME}"`)

    return worker
}

module.exports={startResumePdfWorker}
