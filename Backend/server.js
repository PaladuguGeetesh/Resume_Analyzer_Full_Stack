require('dotenv').config()
const app = require('./src/app')
const connectToDB = require('./src/config/database')
const {startWorker: startReportWorker} = require('./worker')
const {startResumePdfWorker} = require('./resumePdfWorker')

connectToDB()

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}`)
})

// Combines both workers into this process — used ONLY for the current
// free-tier deployment, where Render doesn't offer a free background
// worker service. See README's Deployment section for the full
// architecture explanation and reasoning.
if (process.env.RUN_WORKER_IN_PROCESS === "true") {
  startReportWorker()
  console.log("report worker started in-process")
}

if (process.env.RUN_RESUME_WORKER_IN_PROCESS === "true") {
  startResumePdfWorker()
  console.log("resume PDF worker started in-process")
}