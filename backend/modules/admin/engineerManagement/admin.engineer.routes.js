const router = require("express").Router();
const { getActiveEngineers, getEngineers } = require("./admin.engineer.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/", getEngineers);
router.get("/active", getActiveEngineers);

module.exports = router;
