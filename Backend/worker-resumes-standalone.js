require('dotenv').config()

const connectToDB=require('./src/config/database')
const {startResumePdfWorker}=require('./resumePdfWorker')

connectToDB()
startResumePdfWorker()

console.log('[worker-resumes-standalone] running as a standalone resume-pdf worker process')
