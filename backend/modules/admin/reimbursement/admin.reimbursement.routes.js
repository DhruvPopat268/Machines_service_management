const router = require("express").Router();
const { getReimbursements } = require("./admin.reimbursement.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/", getReimbursements);

module.exports = router;
