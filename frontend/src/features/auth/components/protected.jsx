import { useAuth } from "../hooks/useAuth";
import { Navigate } from "react-router";
import FullScreenLoader from "../../../components/FullScreenLoader.jsx";


const Protected = ({children}) => {

    const {user,loading}=useAuth()


    if(loading){
        return <FullScreenLoader message="Checking your session..." />
    }

    if(!user){
        return <Navigate to={'/login'} />
        
    }

    return children
}

export default Protected;