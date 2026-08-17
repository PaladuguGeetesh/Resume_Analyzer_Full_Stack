import { createContext } from "react"

// Split out from jobs.context.jsx so that file only exports the JobsProvider component —
// see auth-context.js for why (react-refresh/only-export-components).
export const JobsContext = createContext()
