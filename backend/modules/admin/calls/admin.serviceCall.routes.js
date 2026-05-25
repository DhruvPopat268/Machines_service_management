const express = require("express");
const { getCalls, getCallDetail } = require("./admin.serviceCall.controller");
const authMiddleware = require("../../../middleware/admin.auth.middleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getCalls);
router.get("/:id", getCallDetail);

module.exports = router;
