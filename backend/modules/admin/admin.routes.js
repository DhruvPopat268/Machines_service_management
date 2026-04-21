const router = require("express").Router();

router.use("/users", require("./auth/admin.user.routes"));
router.use("/zones", require("./zoneManagement/admin.zone.routes"));
router.use("/contract-types", require("./contractTypesManagement/admin.contractType.routes"));

module.exports = router;
