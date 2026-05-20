const express = require("express");
const { getOwnedMachines, getVariantDetail } = require("./customer.ownedMachine.controller");
const customerAuthMiddleware = require("../../../middleware/customer.auth.middleware");

const router = express.Router();

router.use(customerAuthMiddleware);

router.get("/", getOwnedMachines);
router.get("/:variantId", getVariantDetail);

module.exports = router;
