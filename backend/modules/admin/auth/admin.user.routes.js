const router = require("express").Router();
const { login, logout, sendChangePasswordOtp, verifyOtpAndChangePassword } = require("./admin.user.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.post("/login", login);

router.use(adminAuthMiddleware);

router.post("/logout", logout);
router.post("/change-password/send-otp", sendChangePasswordOtp);
router.post("/change-password/verify", verifyOtpAndChangePassword);

module.exports = router;
