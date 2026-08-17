import { createContext } from "react"

// Split out from auth.context.jsx so that file only exports the AuthProvider component —
// Vite Fast Refresh can't reliably hot-reload a file that exports both a component and a
// plain value (see react-refresh/only-export-components).
export const AuthContext = createContext()
