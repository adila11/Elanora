import multer from "multer";
import pkg from "multer-storage-cloudinary";
const CloudinaryStorage = pkg.CloudinaryStorage || pkg;
import cloudinary from "./cloudinary.js";

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "elanora/profiles",
        allowed_formats: ["jpg", "jpeg", "png", "webp"]
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, 
});

export default upload;