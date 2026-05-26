const router = require("express").Router();
const multer = require("multer");
const { login, logout, getProfile, updateProfile, sendForgotPasswordOtp, verifyOtpResetPassword, changePassword } = require("./engineer.controller");
const engineerAuthMiddleware = require("../../../middleware/engineer.auth.middleware");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split(".").pop().toLowerCase();
    if (!["jpg", "jpeg", "png", "webp"].includes(ext))
      return cb(new Error("Invalid file type. Allowed: jpg, jpeg, png, webp"));
    cb(null, true);
  },
});

router.post("/login", login);
router.post("/send-forgot-password-otp", sendForgotPasswordOtp);
router.post("/verify-otp-reset-password", verifyOtpResetPassword);

router.use(engineerAuthMiddleware);

router.post("/logout", logout);
router.get("/profile", getProfile);
router.patch("/update-profile", upload.single("profilePhoto"), updateProfile);
router.post("/change-password", changePassword);

module.exports = router;
