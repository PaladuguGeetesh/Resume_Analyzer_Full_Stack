require('dotenv').config()
const app=require('./src/app')
const connectToDB=require('./src/config/database')




connectToDB()

// Render's free tier only allows a single service — there's no separate paid background
// worker dyno to run worker.js in. This lets the same process that serves HTTP traffic
// also run the BullMQ worker in-process, opted into explicitly rather than always-on, so
// report generation still works without requiring a second paid service. Local dev and
// any tier that CAN afford a separate worker process should leave this unset and keep
// running `npm run worker` (worker-standalone.js) separately, as before.
if(process.env.RUN_WORKER_IN_PROCESS==="true"){
    const {startWorker}=require('./worker')
    startWorker()
    console.log("[server] in-process worker started (RUN_WORKER_IN_PROCESS=true)")
}

const PORT=process.env.PORT||3000

app.listen(PORT,()=>{
    console.log(`server is running on port ${PORT}`);
})