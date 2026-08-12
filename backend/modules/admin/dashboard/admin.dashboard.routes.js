const router = require("express").Router();
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");
const { getCharts, getStats, getAccountCharts, getNetProfitCharts } = require("./admin.dashboard.controller");

router.get("/stats",              adminAuthMiddleware, getStats);
router.get("/charts",             adminAuthMiddleware, getCharts);
router.get("/account-charts",     adminAuthMiddleware, getAccountCharts);
router.get("/net-profit-charts",  adminAuthMiddleware, getNetProfitCharts);

module.exports = router;
