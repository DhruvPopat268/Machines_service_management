const router = require("express").Router();

router.use("/users", require("./auth/admin.user.routes"));
router.use("/zones", require("./zoneManagement/admin.zone.routes"));

module.exports = router;
