import React from 'react';
import "../auth.form.scss";
import { Link } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { useState } from 'react';
import { useNavigate } from 'react-router';

const login = () => {

  const {loading,handleLogin}=useAuth()
  const navigate=useNavigate()

  const [email,setEmail]=useState("")
  const [password,setPassword]=useState("")
  

  const handlesubmit=async (e)=>{
    e.preventDefault()
    await handleLogin({email,password})
    navigate('/')
  }

  if(loading){
    return(
      <main>
        <h1>Loading...........</h1>
      </main>
    )
  }

  return (
    <main>
      <div className='form-container'>
        <h1>login</h1>

        <form onSubmit={handlesubmit}>

        <div className='input-group'>
          <label htmlFor='email'>Email</label>
        <input 
        onChange={(e)=>{setEmail(e.target.value)}}
        type='email' id='email' placeholder='enter email address' />
        </div>

        <div className='input-group'>
          <label htmlFor='password'>Password</label>
        <input
        onChange={(e)=>{setPassword(e.target.value)}}
        type='password' id='password' placeholder='enter password' />
        </div>

        <button className='button primary-button'>login</button>

        </form>

        <p>Dont have an account ? <Link to={"/register"}>Register</Link> </p>
      </div>
    </main>
  )
}

export default login