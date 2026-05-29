const router = require("express").Router();
const { getActiveCalls, getReimbursementPreview, startTravel, reachedLocation, startWork, putOnHold } = require("./engineer.serviceCall.controller");
const engineerAuthMiddleware = require("../../../middleware/engineer.auth.middleware");

router.use(engineerAuthMiddleware);

router.get("/active", getActiveCalls);
router.post("/reimbursement-preview", getReimbursementPreview);
router.patch("/travel-started", startTravel);
router.patch("/reached-location", reachedLocation);
router.patch("/start-work", startWork);
router.patch("/on-hold", putOnHold);

module.exports = router;
