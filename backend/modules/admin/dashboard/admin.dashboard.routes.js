const router = require("express").Router();
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");
const { getCharts, getStats } = require("./admin.dashboard.controller");

router.get("/stats", adminAuthMiddleware, getStats);
router.get("/charts", adminAuthMiddleware, getCharts);

module.exports = router;
