const mongoose=require('mongoose')


const userSchema=new mongoose.Schema({
    username:{
        type:String,
        unique:[true,"useername already exists"],
        required:true
    },
    email:{
        type:String,
        unique:[true,'account already exists with the email address'],
        required:true
    },
    password:{
        type:String,
        required:true
    }
})

const userModel=mongoose.model("users",userSchema)
module.exports=userModel