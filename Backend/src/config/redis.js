const Redis=require('ioredis')

const redisClient=new Redis(process.env.REDIS_URL||"redis://localhost:6379")

redisClient.on('connect',()=>{
    console.log("connected to redis")
})

redisClient.on('error',(err)=>{
    console.error("redis connection error:",err)
})

module.exports=redisClient
