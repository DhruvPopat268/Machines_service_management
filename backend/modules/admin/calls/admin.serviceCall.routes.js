const express = require("express");
const { getCalls, getCallDetail, assignEngineer, updateCall } = require("./admin.serviceCall.controller");
const authMiddleware = require("../../../middleware/admin.auth.middleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getCalls);
router.get("/:id", getCallDetail);
router.patch("/:id/assign-engineer", assignEngineer);
router.patch("/:id", updateCall);

module.exports = router;
