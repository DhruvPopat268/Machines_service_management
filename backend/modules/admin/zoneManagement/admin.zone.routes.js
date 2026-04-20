const router = require("express").Router();
const { getAllZones, createZone, updateZone, deleteZone } = require("./admin.zone.controller");
const adminAuthMiddleware = require("../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/", getAllZones);
router.post("/", createZone);
router.patch("/:id", updateZone);
router.delete("/:id", deleteZone);

module.exports = router;
