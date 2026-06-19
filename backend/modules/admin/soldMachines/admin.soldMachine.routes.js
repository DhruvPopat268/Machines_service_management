const router = require("express").Router();
const { getAll, getById, createSale, exportToExcel, renewContract, verifySerialNumbers, verifyPartCodes, getAvailableCodes, generateInvoice, sendContractExpiryAlerts, getContractExpiryStatus } = require("./admin.soldMachine.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

// Cron — no auth middleware
router.get("/cron/contract-expiry-alerts", sendContractExpiryAlerts);

router.use(adminAuthMiddleware);

router.get("/contract-expiry-status",     getContractExpiryStatus);

router.get("/export",                 exportToExcel);
router.get("/available-codes",        getAvailableCodes);
router.post("/verify-serial-numbers", verifySerialNumbers);
router.post("/verify-part-codes",     verifyPartCodes);
router.get("/",                       getAll);
router.get("/:id",                    getById);
router.post("/",                      createSale);
router.patch("/renew-contract",       renewContract);
router.post("/:id/generate-invoice",  generateInvoice);

module.exports = router;
