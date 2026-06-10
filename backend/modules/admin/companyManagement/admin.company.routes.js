const router  = require("express").Router();
const multer  = require("multer");
const { getAllCompanies, createCompany, updateCompany, deleteCompany } = require("./admin.company.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

router.use(adminAuthMiddleware);

router.get("/",     getAllCompanies);
router.post("/",    upload.single("qrCode"), createCompany);
router.patch("/:id", upload.single("qrCode"), updateCompany);
router.delete("/:id", deleteCompany);

module.exports = router;
