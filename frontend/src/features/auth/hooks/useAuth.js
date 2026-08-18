import { useContext,useEffect } from "react";
import { AuthContext } from "../auth-context";
import { login, register, logout, getMe } from "../services/auth.api";
import toast from "react-hot-toast";

export const useAuth = () => {
  const context = useContext(AuthContext);
  const { user, setUser, loading, setLoading } = context;

  const handleLogin = async ({ email, password }) => {
    setLoading(true);
    try {
      const data = await login({ email, password });
      setUser(data.user);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async ({ username, email, password }) => {
    setLoading(true);
    try {
      const data = await register({ username, email, password });
      setUser(data.user);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(()=>{
        
        const getAndSetUser=async()=>{
          try{
            const data=await getMe()
            setUser(data.user)
            setLoading(false)
          }catch(err){
            // a 401 here just means "not logged in" — expected, silent, Protected
            // redirects to /login. Anything else (network error, 5xx) means we genuinely
            // couldn't verify the session either way, which is worth telling the user
            // instead of silently treating them as logged out.
            if(err.response?.status!==401){
              toast.error("Couldn't verify your session — please refresh.")
            }
          }finally{
            setLoading(false)
          }
        }

        getAndSetUser();

    },[setUser,setLoading])

  return { user, loading, handleRegister, handleLogin, handleLogout };
};
