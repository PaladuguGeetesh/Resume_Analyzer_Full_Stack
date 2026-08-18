const mongoose=require("mongoose")

// Short-lived by design: this is a download artifact, not a record worth keeping — the
// TTL index below (via the `expires` option on createdAt) auto-deletes documents 2 hours
// after creation, so a user who never comes back to fetch a stray generated PDF doesn't
// leave base64-encoded PDF blobs accumulating in Mongo indefinitely.
const generatedResumePdfSchema=new mongoose.Schema({
    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"users",
        required:true
    },
    pdfData:{
        type:String,
        required:true
    },
    createdAt:{
        type:Date,
        default:Date.now,
        expires:'2h'
    }
})

const generatedResumePdfModel=mongoose.model("generatedResumePdf",generatedResumePdfSchema)

module.exports=generatedResumePdfModel
