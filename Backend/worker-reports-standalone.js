require('dotenv').config()

const connectToDB=require('./src/config/database')
const {startWorker}=require('./worker')

connectToDB()
startWorker()

console.log('[worker-reports-standalone] running as a standalone worker process')
