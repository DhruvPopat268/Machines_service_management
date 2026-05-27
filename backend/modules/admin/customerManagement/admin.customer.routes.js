const router = require("express").Router();
const multer = require("multer");
const { getAll, create, update, remove, downloadSample, importCustomers, exportCustomers } = require("./admin.customer.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

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

router.use(adminAuthMiddleware);

router.get("/sample", downloadSample);
router.get("/export", exportCustomers);
router.post("/import", upload.single("file"), importCustomers);
router.get("/", getAll);
router.post("/", uploadPhoto.single("profilePhoto"), create);
router.patch("/:id", uploadPhoto.single("profilePhoto"), update);
router.delete("/:id", remove);

module.exports = router;
