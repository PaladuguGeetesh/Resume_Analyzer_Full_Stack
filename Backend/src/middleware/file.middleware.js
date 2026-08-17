const multer=require('multer');



const upload=multer({
    storage:multer.memoryStorage(),
    limits:{
        fileSize:3*1024*1024//3mb
    },
    fileFilter:(req,file,cb)=>{
        if(file.mimetype!=="application/pdf"){
            const err=new Error("Only PDF files are allowed")
            err.statusCode=400
            return cb(err,false)
        }
        cb(null,true)
    }
})

module.exports=upload;