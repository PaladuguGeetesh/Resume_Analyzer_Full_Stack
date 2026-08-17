const userModel=require('../models/user.model')
const bcrypt=require('bcryptjs')
const jwt=require('jsonwebtoken')
const redisClient=require('../config/redis')
const asyncHandler=require('../utils/asyncHandler')
/**
 * @name registerUserController
 * @description register a new user, expect username,email and password in req.body
 * @access public 
*/
const registerUserController=async (req,res)=>{
    const {email,username,password}=req.body

    if(!email || !username || !password){
        return res.status(400).json({
            message:"please provide username,email,password"
        })
    }

    const isUserAlreadyExists=await userModel.findOne({
        $or:[{username},{email}]
    })

    if(isUserAlreadyExists){
        return res.status(400).json({
            message:"account already exists with this email address or username"
        })
    }
    const salt=await bcrypt.genSalt(10)
    const hash=await bcrypt.hash(password,salt)

    const user=await userModel.create({
        username,
        email,
        password:hash
    })

    const token=jwt.sign(
        {id:user._id,username:user.username},
        process.env.JWT_SECRET,
        {expiresIn:"1d"}
    )

    //Express response object
    res.cookie("token",token,{
        httpOnly:true,
        secure:process.env.NODE_ENV==="production",
        sameSite:"strict",
        maxAge:24*60*60*1000
    })

    res.status(201).json({
        message:"user created successfully",
        user:{
            id:user._id,username:user.username,email:user.email
        }
    })
}
/** * 
 * @name loginUserController
 * @description login a user, expect email and password in req.body
 * @access public
 */
const loginUserController=async (req,res)=>{

    const {email,password}=req.body
    const user=await userModel.findOne({email})

    if(!user){
        return res.status(400).json({
            message:"invalid email or password"
        })
    }

    const isPasswordValid=await bcrypt.compare(password,user.password)

    if(!isPasswordValid){
        return res.status(400).json({
            message:"invalid email or password"
        })
    }

    const token=await jwt.sign({
        id:user._id,
        username:user.username
    },process.env.JWT_SECRET,{expiresIn:"1d"})

    res.cookie('token',token,{
        httpOnly:true,
        secure:process.env.NODE_ENV==="production",
        sameSite:"strict",
        maxAge:24*60*60*1000
    })

    res.status(200).json({
        message:"user loggedIn succesfully",
        user:{
            id:user._id,
            username:user.username,
            email:user.email
        }
    })

}
/** 
 * @name logoutUserController
 * @description logout a user, expect token in cookies, clear the token cookie and add the token to blacklist
 * @access public 
 */

const logoutUserController=async(req,res)=>{
    const token=req.cookies.token

    if(token){
        const {exp}=jwt.decode(token)||{}
        const secondsRemaining=exp-Math.floor(Date.now()/1000)

        if(secondsRemaining>0){
            await redisClient.set(`blacklist:${token}`,"1","EX",secondsRemaining)
        }
    }

    res.clearCookie('token')

    res.status(200).json({
        message:"user logged out successfully"
    })
}
/**
 * @name getMeController
 * @description get the details of the logged in user, expect token in cookies, return the user details
 * @access private  
 */
const getMeController=async (req,res)=>{
    const user=await userModel.findById(req.user.id)

    res.status(200).json({
        message:"user details fetched successfully",
        user:{
            id:user._id,
            username:user.username,
            email:user.email
        }
    })
}


module.exports={
    registerUserController:asyncHandler(registerUserController),
    loginUserController:asyncHandler(loginUserController),
    logoutUserController:asyncHandler(logoutUserController),
    getMeController:asyncHandler(getMeController)
}