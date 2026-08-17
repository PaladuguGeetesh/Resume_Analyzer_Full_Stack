import { useContext,useEffect } from "react";
import { AuthContext } from "../auth-context";
import { login, register, logout, getMe } from "../services/auth.api";

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
          }catch{
            // no valid session — leave user null, Protected redirects to /login
          }finally{
            setLoading(false)
          }
        }

        getAndSetUser();

    },[setUser,setLoading])

  return { user, loading, handleRegister, handleLogin, handleLogout };
};
