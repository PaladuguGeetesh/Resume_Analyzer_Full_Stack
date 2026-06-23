import React from 'react';
import "../auth.form.scss";
import { useNavigate,Link } from 'react-router';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const Register = () => {

  
  const {loading,handleRegister}=useAuth()
  
  const navigate=useNavigate();

  const [username,setUsername]=useState("")
  const [email,setEmail]=useState("")
  const [password,setPassword]=useState("")

  const handlesubmit= async (e)=>{
    e.preventDefault();
    await handleRegister({username,email,password})
    navigate("/")
  }

  if(loading){
    return(
      <main>
        <h1>Loading.......</h1>
      </main>
    )
  }

  return (
    <main>
      <div className='form-container'>
        <h1>Register</h1>

        <form onSubmit={handlesubmit}>

        <div className='input-group'>
          <label htmlFor='username'>username</label>
        <input 
        onChange={(e)=>{setUsername(e.target.value)}}
        type='text' id='username' placeholder='enter username' />
        </div>

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

        

        <button className='button primary-button'>Register</button>

        </form>

        <p>Already have an account ? <Link to={"/login"}>Login</Link> </p>


      </div>
    </main>
  )
}

export default Register