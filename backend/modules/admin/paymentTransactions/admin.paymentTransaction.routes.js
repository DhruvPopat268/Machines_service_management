const router = require("express").Router();
const { generatePaymentReceipt } = require("./admin.paymentTransaction.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.post("/:id/generate-receipt", generatePaymentReceipt);

module.exports = router;
