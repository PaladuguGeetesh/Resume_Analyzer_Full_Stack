import "../auth.form.scss";
import { useNavigate,Link } from 'react-router';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import FullScreenLoader from '../../../components/FullScreenLoader.jsx';

const Register = () => {


  const {loading,handleRegister}=useAuth()

  const navigate=useNavigate();

  const [username,setUsername]=useState("")
  const [email,setEmail]=useState("")
  const [password,setPassword]=useState("")
  const [error,setError]=useState("")
  const [submitting,setSubmitting]=useState(false)

  const handlesubmit= async (e)=>{
    e.preventDefault();
    setError("")
    setSubmitting(true)
    try{
      await handleRegister({username,email,password})
      navigate("/")
    }catch(err){
      setError(err.response?.data?.message||"registration failed, please try again")
    }finally{
      setSubmitting(false)
    }
  }

  // loading (AuthContext) also flips true for the duration of handleRegister itself —
  // without the !submitting check, the whole form would get replaced by this full-page
  // loader on submit instead of just the button showing "Creating your account..." below.
  if(loading && !submitting){
    return <FullScreenLoader message="Checking your session..." />
  }

  return (
    <main>
      <div className='form-container'>
        <h1>Register</h1>

        <form onSubmit={handlesubmit}>

        {error && <p className='form-error'>{error}</p>}

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



        <button className='button primary-button' disabled={submitting}>{submitting ? 'Creating your account...' : 'Register'}</button>

        </form>

        <p>Already have an account ? <Link to={"/login"}>Login</Link> </p>


      </div>
    </main>
  )
}

export default Register
