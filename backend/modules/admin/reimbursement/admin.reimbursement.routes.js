const router = require("express").Router();
const { getReimbursements, markAsPaid } = require("./admin.reimbursement.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/", getReimbursements);
router.patch("/mark-paid", markAsPaid);

module.exports = router;
