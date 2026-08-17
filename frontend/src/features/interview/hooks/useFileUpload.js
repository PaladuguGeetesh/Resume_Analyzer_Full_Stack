import { useRef, useState } from 'react'

// Shared by every PDF-upload slot on the Home page (resume, job description, self
// description) — same select/validate/remove behavior, just a separate instance per slot.
export function useFileUpload() {
    const [ selectedFile, setSelectedFile ] = useState(null)
    const [ fileError, setFileError ] = useState("")
    const inputRef = useRef()

    const handleFileChange = (e) => {
        const file = e.target.files[ 0 ]

        if (!file) {
            setSelectedFile(null)
            setFileError("")
            return
        }

        // mirrors the backend's fileFilter (Backend/src/middleware/file.middleware.js), which
        // only accepts application/pdf — catch it here instead of waiting on a round trip
        if (file.type !== "application/pdf") {
            setSelectedFile(null)
            setFileError("Please upload a PDF file.")
            e.target.value = ""
            return
        }

        setFileError("")
        setSelectedFile(file)
    }

    // Programmatic reset (e.g. clearing the form after a successful submit) — no event to
    // handle, unlike handleRemoveFile which runs from a button click inside the dropzone label.
    const reset = () => {
        setSelectedFile(null)
        setFileError("")
        if (inputRef.current) {
            inputRef.current.value = ""
        }
    }

    const handleRemoveFile = (e) => {
        // stop the click from bubbling to the enclosing <label>, which would otherwise
        // reopen the native file picker right after clearing the selection
        e.preventDefault()
        e.stopPropagation()
        reset()
    }

    return { selectedFile, fileError, inputRef, handleFileChange, handleRemoveFile, reset }
}
