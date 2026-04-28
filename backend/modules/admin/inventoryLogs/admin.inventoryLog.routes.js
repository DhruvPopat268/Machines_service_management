const router = require("express").Router();
const { getAll, getById, exportInventoryLogs } = require("./admin.inventoryLog.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/",        getAll);
router.get("/export", exportInventoryLogs);
router.get("/:id",     getById);

module.exports = router;
