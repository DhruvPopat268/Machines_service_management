require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const connectDB = require("./database/connection");
const morgan = require('morgan');

const app = express();

connectDB();

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map(url => url.trim())
  : [];

app.use(cors({ 
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true 
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const cloudPath = process.env.NODE_ENV === "production"
  ? "/app/cloud"
  : path.join(__dirname, "cloud");
app.use("/app/cloud", express.static(cloudPath));

// ── Upload helpers ────────────────────────────────────────────────────────────
const imagesDir   = path.join(cloudPath, "images");
const documentsDir = path.join(cloudPath, "Documents");
[imagesDir, documentsDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, imagesDir),
  filename:    (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`),
});
const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, documentsDir),
  filename:    (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`),
});

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});
const uploadDoc = multer({
  storage: docStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/msword", "text/plain"];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("File type not allowed"));
  },
});

// POST /upload/image  — field: "file"
app.post("/upload/image", uploadImage.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
  const url = `${process.env.BACKEND_URL}/app/cloud/images/${req.file.filename}`;
  res.status(200).json({ success: true, url, filename: req.file.filename });
});

// POST /upload/document  — field: "file"
app.post("/upload/document", uploadDoc.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
  const url = `${process.env.BACKEND_URL}/app/cloud/Documents/${req.file.filename}`;
  res.status(200).json({ success: true, url, filename: req.file.filename });
});

// Upload error handler
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || err.message)
    return res.status(400).json({ success: false, message: err.message });
  res.status(500).json({ success: false, message: "Internal server error" });
});
// ─────────────────────────────────────────────────────────────────────────────

app.use("/api", require("./routes/index"));

app.get("/", (req, res) => res.send("Server is running"));

if (process.env.DEBUG === "true") app.use(morgan('dev'));
  

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));