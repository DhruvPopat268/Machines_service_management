const router = require("express").Router();
const { getActiveCalls, getReimbursementPreview, startTravel } = require("./engineer.serviceCall.controller");
const engineerAuthMiddleware = require("../../../middleware/engineer.auth.middleware");

router.use(engineerAuthMiddleware);

router.get("/active", getActiveCalls);
router.get("/:callId/reimbursement-preview", getReimbursementPreview);
router.patch("/travel-started", startTravel);

module.exports = router;
