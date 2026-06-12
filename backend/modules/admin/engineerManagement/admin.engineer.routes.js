const router = require("express").Router();
const { getActiveEngineers, getEngineers, getEngineerCallTimeline, getAllEngineersCallTimeline } = require("./admin.engineer.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/", getEngineers);
router.get("/active", getActiveEngineers);
router.get("/call-timeline", getAllEngineersCallTimeline);
router.get("/:engineerId/call-timeline", getEngineerCallTimeline);

module.exports = router;
