const router = require("express").Router();
const { updateGstConfig, getGstConfig } = require("./admin.gstConfig.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/", getGstConfig);
router.patch("/", updateGstConfig);

module.exports = router;
