const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure the temp directory exists at runtime (critical for Render/production)
const tempDir = path.join(__dirname, "..", "public", "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    // Use a unique filename to avoid collisions between users
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  }
});

const upload = multer({ storage });
module.exports = { upload };