const router = require("express").Router();

router.use("/admin", require("../modules/admin/admin.routes"));
// router.use("/customer", require("../modules/customer/customer.routes"));
// router.use("/engineer", require("../modules/engineer/engineer.routes"));

module.exports = router;