const router = require("express").Router();
const multer = require("multer");
const { getAll, create, update, remove, downloadSample, importVendors, exportVendors } = require("./admin.vendor.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(adminAuthMiddleware);

router.get("/sample", downloadSample);
router.get("/export", exportVendors);
router.post("/import", upload.single("file"), importVendors);
router.get("/", getAll);
router.post("/", create);
router.patch("/:id", update);
router.delete("/:id", remove);

module.exports = router;
