const express = require("express");
const { getActiveZones, signup, login, logout, sendResetOtp, verifyOtpResetPassword, updateProfile, sendChangeEmailOtpController, verifyOtpAndChangeEmail, changePassword, getProfileDetails } = require("./customer.controller");
const customerAuthMiddleware = require("../../../middleware/customer.auth.middleware");

const router = express.Router();

router.get("/zones", getActiveZones);
router.post("/signup", signup);
router.post("/login", login);
router.post("/send-reset-otp", sendResetOtp);
router.post("/verify-otp-reset-password", verifyOtpResetPassword);

router.use(customerAuthMiddleware);

router.get("/profile", getProfileDetails);
router.post("/logout", logout);
router.patch("/update-profile", updateProfile);
router.post("/send-change-email-otp", sendChangeEmailOtpController);
router.post("/verify-otp-change-email", verifyOtpAndChangeEmail);
router.post("/change-password", changePassword);

module.exports = router;
