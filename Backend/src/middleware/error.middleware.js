const errorMiddleware=(err,req,res,next)=>{
    console.error(err)

    const statusCode=err.statusCode||500

    res.status(statusCode).json({
        message:err.message||"internal server error",
        ...(process.env.NODE_ENV!=="production" && {stack:err.stack})
    })
}

module.exports=errorMiddleware
