const router = require("express").Router();
const { getMyReimbursements } = require("./engineer.reimbursement.controller");
const engineerAuthMiddleware = require("../../../middleware/engineer.auth.middleware");

router.use(engineerAuthMiddleware);

router.post("/", getMyReimbursements);

module.exports = router;
