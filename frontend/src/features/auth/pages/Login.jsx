import "../auth.form.scss";
import { Link } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import FullScreenLoader from '../../../components/FullScreenLoader.jsx';

const Login = () => {

  const {loading,handleLogin}=useAuth()
  const navigate=useNavigate()

  const [email,setEmail]=useState("")
  const [password,setPassword]=useState("")
  const [error,setError]=useState("")
  const [submitting,setSubmitting]=useState(false)

  const handlesubmit=async (e)=>{
    e.preventDefault()
    setError("")
    setSubmitting(true)
    try{
      await handleLogin({email,password})
      navigate('/')
    }catch(err){
      setError(err.response?.data?.message||"login failed, please try again")
    }finally{
      setSubmitting(false)
    }
  }

  // loading (AuthContext) also flips true for the duration of handleLogin itself — without
  // the !submitting check here, the whole form would get replaced by this full-page loader
  // the moment you click login, instead of just the button showing "Signing in..." below.
  if(loading && !submitting){
    return <FullScreenLoader message="Checking your session..." />
  }

  return (
    <main>
      <div className='form-container'>
        <h1>login</h1>

        <form onSubmit={handlesubmit}>

        {error && <p className='form-error'>{error}</p>}

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

        <button className='button primary-button' disabled={submitting}>{submitting ? 'Signing in...' : 'login'}</button>

        </form>

        <p>Dont have an account ? <Link to={"/register"}>Register</Link> </p>
      </div>
    </main>
  )
}

export default Login
