const router = require("express").Router();
const { getHome, updateOnlineStatus, updateCurrentLocation } = require("./engineer.home.controller");
const engineerAuthMiddleware = require("../../../middleware/engineer.auth.middleware");

router.use(engineerAuthMiddleware);

router.get("/", getHome);
router.patch("/online-status", updateOnlineStatus);
router.patch("/current-location", updateCurrentLocation);

module.exports = router;
