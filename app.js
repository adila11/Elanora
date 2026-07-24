import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import session from "express-session";
import connectDB from './config/db.js';
import adminRouter from './routers/adminRoute.js';
import userRouter from './routers/userRoute.js';
import nocache from 'nocache';
import flash from 'connect-flash';
import MongoStore from 'connect-mongo';
import passport from'./config/passport.js' ;
import cartCountMiddleware from "./middleware/cartCount.js";

dotenv.config(); 

const app = express();
connectDB();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
    secret: "mysecretkey",
    resave: false,
    saveUninitialized: false,

    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: "sessions",
        ttl: 14 * 24 * 60 * 60,
    }),

    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,
        secure: false
    },
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(flash());


app.use((req, res, next) => {
    res.locals.user = req.session?.user || null;
    res.locals.success_msg = req.flash('success');
    res.locals.error_msg = req.flash('error');
    next();
});

app.use(nocache());

app.use(cartCountMiddleware);

app.use('/admin', adminRouter);
app.use('/', userRouter);

app.set("view engine", "ejs");
app.set("views", [path.join(process.cwd(), "views")]);

app.listen(process.env.PORT, () => {
    console.log(`The Server is Running http://localhost:${process.env.PORT}/`);
});