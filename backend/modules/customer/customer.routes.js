const router = require("express").Router();

router.use("/auth", require("./auth/customer.routes"));
router.use("/owned-machines", require("./ownedMachines/customer.ownedMachine.routes"));

module.exports = router;
