import express from 'express' ; 
import dotenv from 'dotenv' ;
import path from 'path' ;
import connectDB from './config/db.js'
import adminRouter from './routers/adminRoute.js'
import userRouter from './routers/userRoute.js'
const app=express();
connectDB()



app.use('/admin',adminRouter)
app.use('/',userRouter)
app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(express.static("public"))

app.set("view engine","ejs")
app.set("view",[path.join(process.cwd(),"views")])

app.listen(process.env.PORT,()=>{
    console.log(`The Server is Running http://localhost:${process.env.PORT}/`);
})

