const router = require("express").Router();
const { login, logout, getProfile, updateProfile, sendForgotPasswordOtp, verifyOtpResetPassword, changePassword } = require("./engineer.controller");
const engineerAuthMiddleware = require("../../../middleware/engineer.auth.middleware");

router.post("/login", login);
router.post("/send-forgot-password-otp", sendForgotPasswordOtp);
router.post("/verify-otp-reset-password", verifyOtpResetPassword);

router.use(engineerAuthMiddleware);

router.post("/logout", logout);
router.get("/profile", getProfile);
router.patch("/update-profile", updateProfile);
router.post("/change-password", changePassword);

module.exports = router;
