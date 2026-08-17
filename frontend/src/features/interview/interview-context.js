import { createContext } from "react"

// Split out from interview.context.jsx so that file only exports the InterviewProvider
// component — see auth-context.js for why (react-refresh/only-export-components).
export const InterviewContext = createContext()
