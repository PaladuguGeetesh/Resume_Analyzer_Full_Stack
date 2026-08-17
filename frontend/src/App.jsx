import { RouterProvider } from "react-router"
import { Toaster } from "react-hot-toast"
import {router} from "./app.routes.jsx"
import { AuthProvider } from "./features/auth/auth.context.jsx"
import { InterviewProvider } from "./features/interview/interview.context.jsx"
import { JobsProvider } from "./features/interview/jobs.context.jsx"

function App() {


  return (
    <AuthProvider>
      <InterviewProvider>
        {/* top-level, outside the router: pending-job polling and its toasts/notifications
            must survive route changes (and even a logged-in user bouncing through /login) */}
        <JobsProvider>
          <Toaster position="bottom-right" />
          <RouterProvider router={router} />
        </JobsProvider>
      </InterviewProvider>
    </AuthProvider>

  )
}

export default App
