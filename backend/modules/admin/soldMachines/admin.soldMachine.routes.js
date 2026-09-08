const router = require("express").Router();
const multer = require("multer");
const { getAll, getById, createSale, cancelSale, exportToExcel, renewContract, addContract, verifySerialNumbers, verifyPartCodes, getAvailableCodes, getAvailableMachines, generateInvoice, sendContractExpiryAlerts, getContractExpiryStatus, addPayment, customerOutstandingDue, customerPaymentReceipts, getSystemUsers, downloadSample, importSales } = require("./admin.soldMachine.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Cron — no auth middleware
router.get("/cron/contract-expiry-alerts", sendContractExpiryAlerts);

router.use(adminAuthMiddleware);

router.get("/contract-expiry-status",     getContractExpiryStatus);

router.get("/system-users",           getSystemUsers);
router.get("/export",                 exportToExcel);
router.get("/sample",                 downloadSample);
router.post("/import",                upload.single("file"), importSales);
router.get("/available-machines",     getAvailableMachines);
router.get("/available-codes",        getAvailableCodes);
router.post("/verify-serial-numbers", verifySerialNumbers);
router.post("/verify-part-codes",     verifyPartCodes);
router.get("/",                       getAll);
router.get("/:id",                    getById);
router.post("/",                      createSale);
router.patch("/:id/cancel",           cancelSale);
router.patch("/renew-contract",       renewContract);
router.patch("/add-contract",         addContract);
router.post("/:id/generate-invoice",  generateInvoice);
router.post("/:id/add-payment",       addPayment);
router.get("/customer/:customerId/outstanding-due", customerOutstandingDue);
router.get("/:id/payment-receipts",               customerPaymentReceipts);

module.exports = router;
