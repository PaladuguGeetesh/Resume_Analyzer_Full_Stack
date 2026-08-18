import axios from "axios"

// Single source of truth for the backend's base URL and API version — every feature's
// *.api.js module should import this instead of creating its own axios.create(), so a
// version bump (or a host change) only ever needs to happen in one place.
export const API_VERSION = "v1"

const apiClient = axios.create({
    baseURL: `${import.meta.env.VITE_API_URL}/api/${API_VERSION}`,
    withCredentials: true,
})

export default apiClient