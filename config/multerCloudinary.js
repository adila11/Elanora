import multer from "multer";
import pkg from "multer-storage-cloudinary";
const CloudinaryStorage = pkg.CloudinaryStorage || pkg;
import cloudinary from "./cloudinary.js";

// Multer-storage-cloudinary Internally Calls `this.cloudinary.v2.uploader` So We Wrap Our Already-configured V2 Instance To Match That Shape
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

// Upload
export default upload;