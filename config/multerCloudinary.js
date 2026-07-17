import multer from "multer";
import pkg from "multer-storage-cloudinary";
const CloudinaryStorage = pkg.CloudinaryStorage || pkg;
import cloudinary from "./cloudinary.js";

// multer-storage-cloudinary internally calls `this.cloudinary.v2.uploader`
// so we wrap our already-configured v2 instance to match that shape
const cloudinaryWrapper = { v2: cloudinary };

const storage = new CloudinaryStorage({
    cloudinary: cloudinaryWrapper,
    allowedFormats: ["jpg", "jpeg", "png", "webp"],
    folder: "elanora/profiles",
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
});

export default upload;