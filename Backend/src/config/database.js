const mongoose=require('mongoose')

const INITIAL_RETRY_DELAY_MS=2000
const MAX_RETRY_DELAY_MS=30000

async function connectToDB(retryDelay=INITIAL_RETRY_DELAY_MS){
    try{
        await mongoose.connect(process.env.MONGO_URI)
        console.log("connected to database")
    }catch(err){
        console.error(`failed to connect to database: ${err.message}`)
        console.log(`retrying in ${retryDelay/1000}s`)
        setTimeout(()=>connectToDB(Math.min(retryDelay*2,MAX_RETRY_DELAY_MS)),retryDelay)
    }
}

module.exports=connectToDB