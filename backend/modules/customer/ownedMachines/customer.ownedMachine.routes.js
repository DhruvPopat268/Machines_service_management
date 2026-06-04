const express = require("express");
const { getOwnedMachines, getMachineDetail } = require("./customer.ownedMachine.controller");
const customerAuthMiddleware = require("../../../middleware/customer.auth.middleware");

const router = express.Router();

router.use(customerAuthMiddleware);

router.get("/all", getOwnedMachines);
router.get("/", getOwnedMachines);
router.get("/:serialNumber", getMachineDetail);

module.exports = router;
