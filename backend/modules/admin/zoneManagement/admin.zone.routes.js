const router = require("express").Router();
const multer = require("multer");
const { getAllZones, createZone, updateZone, deleteZone, getCustomerCount, importZones, exportZones, downloadSample } = require("./admin.zone.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(adminAuthMiddleware);

router.get("/sample", downloadSample);
router.get("/export", exportZones);
router.post("/import", upload.single("file"), importZones);
router.get("/", getAllZones);
router.get("/:id/customer-count", getCustomerCount);
router.post("/", createZone);
router.patch("/:id", updateZone);
router.delete("/:id", deleteZone);

module.exports = router;
