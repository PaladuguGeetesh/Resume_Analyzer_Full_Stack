const redisClient=require('../config/redis')

// generous enough to cover the full job lifecycle, including BullMQ's attempts/backoff retries
const IDEMPOTENCY_KEY_TTL_SECONDS=600

function buildIdempotencyRedisKey(userId,idempotencyKey){
    return `idempotency:${userId}:${idempotencyKey}`
}

const idempotency=async(req,res,next)=>{
    const idempotencyKey=req.headers['idempotency-key']

    if(!idempotencyKey){
        return res.status(400).json({
            message:"Idempotency-Key header is required"
        })
    }

    const redisKey=buildIdempotencyRedisKey(req.user.id,idempotencyKey)
    const existing=await redisClient.get(redisKey)

    if(existing){
        const record=JSON.parse(existing)

        if(record.status==="completed"){
            return res.status(202).json({
                message:"Report generation started",
                jobId:record.jobId
            })
        }

        if(record.status==="in_progress"){
            return res.status(409).json({
                message:"A request with this idempotency key is already being processed."
            })
        }
    }

    await redisClient.set(redisKey,JSON.stringify({status:"in_progress"}),"EX",IDEMPOTENCY_KEY_TTL_SECONDS)
    req.idempotencyKey=idempotencyKey

    next()
}

idempotency.TTL_SECONDS=IDEMPOTENCY_KEY_TTL_SECONDS
idempotency.buildRedisKey=buildIdempotencyRedisKey

module.exports=idempotency
