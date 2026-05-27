const express = require("express");
const multer = require("multer");
const { getActiveZones, signup, login, logout, sendResetOtp, verifyOtpResetPassword, updateProfile, sendChangeEmailOtpController, verifyOtpAndChangeEmail, changePassword, getProfileDetails } = require("./customer.controller");
const customerAuthMiddleware = require("../../../middleware/customer.auth.middleware");

const router = express.Router();

const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split(".").pop().toLowerCase();
    if (!["jpg", "jpeg", "png", "webp"].includes(ext))
      return cb(new Error("Invalid file type. Allowed: jpg, jpeg, png, webp"));
    cb(null, true);
  },
});

router.get("/zones", getActiveZones);
router.post("/signup", signup);
router.post("/login", login);
router.post("/send-reset-otp", sendResetOtp);
router.post("/verify-otp-reset-password", verifyOtpResetPassword);

router.use(customerAuthMiddleware);

router.get("/profile", getProfileDetails);
router.post("/logout", logout);
router.patch("/update-profile", uploadPhoto.single("profilePhoto"), updateProfile);
router.post("/send-change-email-otp", sendChangeEmailOtpController);
router.post("/verify-otp-change-email", verifyOtpAndChangeEmail);
router.post("/change-password", changePassword);

module.exports = router;
