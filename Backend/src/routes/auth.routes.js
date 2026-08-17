const express=require('express')
const authRouter=express.Router()
const {registerUserController, loginUserController,logoutUserController,getMeController}=require('../controllers/auth.controller')
const authMiddleware=require('../middleware/auth.middleware')
const validate=require('../middleware/validate.middleware')
const {registerSchema,loginSchema}=require('../validators/auth.validator')
/**
 * @route POST /api/v1/auth/register
 * @description register a new user
 * @access public
 */
authRouter.post("/register",validate(registerSchema),registerUserController)

/**
 * @route POST /api/v1/auth/login
 * @description login a user with email and password
 * @access public
 */

authRouter.post("/login",validate(loginSchema),loginUserController)
/**
 * @route GET /api/v1/auth/logout
 * @description logout a user by clearing the token cookie and adding the token to blacklist
 * @access public
 */

authRouter.get("/logout",logoutUserController)
/**
 * @route GET /api/v1/auth/get-me
 * @description get the details of the logged in user
 * @access private
 */
authRouter.get('/get-me',authMiddleware.authUser,getMeController)

module.exports=authRouter