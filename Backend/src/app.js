const express=require('express')
const cookieParser=require('cookie-parser')
const cors=require('cors')
const helmet=require('helmet')
const app=express()
app.use(helmet())
app.use(express.json())
app.use(cookieParser())
app.use(cors({
    origin:"http://localhost:5173",
    credentials:true
}))

/*require all the routes */
const authRouter=require("./routes/auth.routes")
const interviewRouter=require("./routes/interview.routes.js")

const errorMiddleware=require('./middleware/error.middleware')

// overridable so a future version bump (or running two versions side by side) doesn't
// require touching every route file — just this one mount point
const API_VERSION=process.env.API_VERSION||"v1"

/*use all the routes */
app.use(`/api/${API_VERSION}/auth`,authRouter)
app.use(`/api/${API_VERSION}/interview`,interviewRouter)


app.use(errorMiddleware)

module.exports=app