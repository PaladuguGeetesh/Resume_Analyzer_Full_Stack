const redisClient=require('../config/redis')

// generous enough to cover the full job lifecycle, including BullMQ's attempts/backoff retries
const IDEMPOTENCY_KEY_TTL_SECONDS=600

function buildIdempotencyRedisKey(userId,idempotencyKey,prefix="idempotency"){
    return `${prefix}:${userId}:${idempotencyKey}`
}

// Factory instead of a single hardcoded middleware — different features sharing this same
// module still need their idempotency keys to live in separate Redis key spaces (a report
// job and a resume-PDF job submitted back-to-back must never collide just because they
// happen to reuse the same literal Idempotency-Key header value), so the prefix is a
// parameter, not a constant.
function createIdempotencyMiddleware(prefix="idempotency"){
    return async(req,res,next)=>{
        const idempotencyKey=req.headers['idempotency-key']

        if(!idempotencyKey){
            return res.status(400).json({
                message:"Idempotency-Key header is required"
            })
        }

        const redisKey=buildIdempotencyRedisKey(req.user.id,idempotencyKey,prefix)

        // Atomically CLAIM the key with SET...NX instead of GET-then-SET: two genuinely
        // concurrent requests (a rapid double-click, a client retry racing the original)
        // can both execute a plain GET and both see "nothing there yet" before either one
        // writes — that's a real race, confirmed by firing two truly-simultaneous requests
        // with the same key, which produced two separate jobs instead of deduping to one.
        // SET...NX is atomic at the Redis level: only one of two simultaneous callers can
        // ever get "OK" back, so the loser is correctly told to back off instead of both
        // slipping through.
        const claimed=await redisClient.set(
            redisKey,
            JSON.stringify({status:"in_progress"}),
            "EX",
            IDEMPOTENCY_KEY_TTL_SECONDS,
            "NX",
        )

        if(claimed){
            req.idempotencyKey=idempotencyKey
            return next()
        }

        // someone else already holds this key — read what they recorded to decide the response
        const existing=await redisClient.get(redisKey)

        if(existing){
            const record=JSON.parse(existing)

            if(record.status==="completed"){
                return res.status(202).json({
                    message:"Request already processed",
                    jobId:record.jobId
                })
            }
        }

        // status is "in_progress", or the key expired in the instant between our failed
        // claim and this read — either way, the safe answer is "still being handled, don't
        // retry yet" rather than silently letting a second job through
        return res.status(409).json({
            message:"A request with this idempotency key is already being processed."
        })
    }
}

// Default instance — unchanged behavior/key format for every existing caller
// (interview.routes.js's report-generation route keeps using this exact export as before).
const idempotency=createIdempotencyMiddleware()

idempotency.TTL_SECONDS=IDEMPOTENCY_KEY_TTL_SECONDS
idempotency.buildRedisKey=buildIdempotencyRedisKey
idempotency.withPrefix=createIdempotencyMiddleware

module.exports=idempotency
