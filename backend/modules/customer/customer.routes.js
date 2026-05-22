const router = require("express").Router();

router.use("/auth", require("./auth/customer.routes"));
router.use("/owned-machines", require("./ownedMachines/customer.ownedMachine.routes"));
router.use("/service-calls", require("./calls/customer.serviceCall.routes"));
router.use("/problem-types", require("./problemTypes/customer.problemType.routes"));

module.exports = router;
