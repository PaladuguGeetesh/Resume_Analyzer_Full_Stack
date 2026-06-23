const mongoose = require("mongoose");

/**
 * -job description schema:string
 * -resume text:string
 * -self description:string
 *
 * -matchScore: Number
 * -technical questions:[{
 *         question:"",
 *          intention:"",
 *          answer:""
 * }]
 * -behavioural questions:[{
 *         question:"",
 *          intention:"",
 *          answer:""
 * }]
 * -skill gaps:[{
 *          skill:"",
 *          severity:{
 *              type:String,
 *              severity:["low,"medium",'high"]
 *          }
 *       }]
 * -preparation plan:[{
 *              day:Number,
 *              topic:String,
 *              tasks:[String]
 * }]
 */

const technicalQuestionSchema=new mongoose.Schema({
    question:{
        type:String,
        required:[true,"technical question is required"]
    },
    intention:{
        type:String,
        required:[true,"intention is required"]
    },

    answer:{
        type:String,
        required:[true,"answer is required"]
    }
},{
    _id:false
})

const behaviouralQestionSchema=new mongoose.Schema({
    question:{
        type:String,
        required:[true,"technical question is required"]
    },
    intention:{
        type:String,
        required:[true,"intention is required"]
    },

    answer:{
        type:String,
        required:[true,"answer is required"]
    }
},{
    _id:false
})

const skillGapSchema=new mongoose.Schema({
    skill:{
        type:String,
        required:[true,"skill is required"]
    },
    severity:{
        type:String,
        enum:['low','medium','high'],
        required:[true,'severity is required']
    }
},{
    _id:false
})

const preparationPlanSchema=new mongoose.Schema({
    day:{
        type:Number,
        required:[true,"day is required"]
    },
    focus:{
        type:String,
        required:[true,"focus is required"]
    },
    tasks:[{
        type:String,
        required:[true,"task is required"]
    }]
})

const interviewReportSchema=new mongoose.Schema({
    jobDescription:{
        type:String,
        required:[true,"job description is required"]
    },
    resume:{
        type:String
    },
    selfDescription:{
        type:String
    },
    matchScore:{
        type:Number,
        min:0,
        max:100
    },
    technicalQuestions:[technicalQuestionSchema],
    behaviouralQuestion:[behaviouralQestionSchema],
    skillGaps:[skillGapSchema],
    preparationPlan:[preparationPlanSchema],
    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"users"
    },
    title:{
        type:String,
        required:[true,"title is required"]
    }
},{
    timestamps:true    
})

const interviewReportModel=mongoose.model("interviewReport",interviewReportSchema)

module.exports=interviewReportModel