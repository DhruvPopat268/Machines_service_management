const router = require("express").Router();
const multer = require("multer");
const { getAllSystemUsers, getSystemUserById, createSystemUser, updateSystemUser, sendResetPasswordOtp, resetSystemUserPassword, deleteSystemUser } = require("./admin.systemUser.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

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

router.use(adminAuthMiddleware);

router.get("/",                          getAllSystemUsers);
router.get("/:id",                       getSystemUserById);
router.post("/",                         upload.single("profilePhoto"), createSystemUser);
router.patch("/:id",                     upload.single("profilePhoto"), updateSystemUser);
router.post("/:id/send-reset-otp",       sendResetPasswordOtp);
router.patch("/:id/reset-password",      resetSystemUserPassword);
router.delete("/:id",                    deleteSystemUser);

module.exports = router;
