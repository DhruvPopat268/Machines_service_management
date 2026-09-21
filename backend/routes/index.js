const router = require("express").Router();

router.use("/admin", require("../modules/admin/admin.routes"));
// ── New module: Quick Raise Call (automated workflow) ─────────────────────────
router.use("/admin/quick-raise-call", require("../modules/admin/quickRaiseCall/admin.quickRaiseCall.routes"));
router.use("/customer", require("../modules/customer/customer.routes"));
router.use("/engineer", require("../modules/engineer/engineer.routes"));

module.exports = router;