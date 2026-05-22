const express = require("express");
const { getActiveProblemTypes } = require("./customer.problemType.controller");
const customerAuthMiddleware = require("../../../middleware/customer.auth.middleware");

const router = express.Router();

router.use(customerAuthMiddleware);

router.get("/", getActiveProblemTypes);

module.exports = router;
