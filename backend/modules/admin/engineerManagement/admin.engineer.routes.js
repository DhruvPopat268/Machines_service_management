const router = require("express").Router();
const { getActiveEngineers } = require("./admin.engineer.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/active", getActiveEngineers);

module.exports = router;
