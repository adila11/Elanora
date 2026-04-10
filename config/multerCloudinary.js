import multer from "multer";
import pkg from "multer-storage-cloudinary";
import cloudinary from "./cloudinary.js";

const { CloudinaryStorage } = pkg;

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "elanora_profiles",
        allowed_formats: ["jpg", "png", "jpeg", "webp"],
        transformation: [{ width: 500, height: 500, crop: "limit" }]
    }
});

const upload = multer({ storage });

export default upload;