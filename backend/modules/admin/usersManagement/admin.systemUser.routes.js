const router = require("express").Router();
const { getAllSystemUsers, getSystemUserById, createSystemUser, updateSystemUser, sendResetPasswordOtp, resetSystemUserPassword, deleteSystemUser } = require("./admin.systemUser.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/",                          getAllSystemUsers);
router.get("/:id",                       getSystemUserById);
router.post("/",                         createSystemUser);
router.patch("/:id",                     updateSystemUser);
router.post("/:id/send-reset-otp",       sendResetPasswordOtp);
router.patch("/:id/reset-password",      resetSystemUserPassword);
router.delete("/:id",                    deleteSystemUser);

module.exports = router;
