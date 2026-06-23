const express=require('express')
const authRouter=express.Router()
const {registerUserController, loginUserController,logoutUserController,getMeController}=require('../controllers/auth.controller')
const authMiddleware=require('../middleware/auth.middleware')
/**
 * @route POST/api/auth/register
 * @description register a new user
 * @access public
 */
authRouter.post("/register",registerUserController)

/**
 * @route POST/api/auth/login
 * @description login a user with email and password
 * @access public
 */

authRouter.post("/login",loginUserController)
/**
 * @route GET/api/auth/logout
 * @description logout a user by clearing the token cookie and adding the token to blacklist
 * @access public
 */

authRouter.get("/logout",logoutUserController)
/**
 * @route GET/api/auth/get-me
 * @description get the details of the logged in user
 * @access private
 */
authRouter.get('/get-me',authMiddleware.authUser,getMeController)

module.exports=authRouter