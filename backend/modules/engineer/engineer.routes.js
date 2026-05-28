const router = require("express").Router();

router.use("/auth", require("./auth/engineer.routes"));
router.use("/calls", require("./calls/engineer.serviceCall.routes"));

module.exports = router;
