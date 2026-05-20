const express = require("express");
const { getOwnedMachines, getVariantDetail } = require("./customer.ownedMachine.controller");
const { validateVariantId } = require("./customer.ownedMachine.validator");
const customerAuthMiddleware = require("../../../middleware/customer.auth.middleware");

const router = express.Router();

router.use(customerAuthMiddleware);

router.get("/", getOwnedMachines);
router.get("/:variantId", validateVariantId, getVariantDetail);

module.exports = router;
