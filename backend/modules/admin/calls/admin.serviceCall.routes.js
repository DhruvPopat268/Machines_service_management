const express = require("express");
const {
  getAllCalls,
  getOpenCalls,
  getAssignedCalls,
  getInProgressCalls,
  getOnHoldCalls,
  getCompletedCalls,
  getCancelledCalls,
  getCallDetail
} = require("./admin.serviceCall.controller");
const authMiddleware = require("../../../middleware/admin.auth.middleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/all", getAllCalls);
router.get("/open", getOpenCalls);
router.get("/assigned", getAssignedCalls);
router.get("/in-progress", getInProgressCalls);
router.get("/on-hold", getOnHoldCalls);
router.get("/completed", getCompletedCalls);
router.get("/cancelled", getCancelledCalls);
router.get("/:id", getCallDetail);

module.exports = router;
