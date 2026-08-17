const {z}=require('zod')

// No .min(1) here: the frontend's FormData always sends these keys, even as "" when the
// PDF path is used instead of typing — a length check here would reject that empty string
// before requireJobDescriptionAndSelfDescription (interview.routes.js) ever gets a chance
// to notice a file was attached instead. Presence/non-emptiness (as text OR file) is
// enforced there, not here — this schema just needs to accept whatever shape arrives.
const generateReportSchema=z.object({
    selfDescription:z.string().optional(),
    jobDescription:z.string().optional()
})

module.exports={generateReportSchema}
