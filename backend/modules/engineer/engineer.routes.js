const router = require("express").Router();

router.use("/auth", require("./auth/engineer.routes"));
router.use("/calls", require("./calls/engineer.serviceCall.routes"));
router.use("/reimbursements", require("./reimbursement/engineer.reimbursement.routes"));
router.use("/home", require("./home/engineer.home.routes"));

module.exports = router;
