const router = require("express").Router();
const { getAll, getById, createPurchase, verifySerialNumbers, verifyPartCodes, exportToExcel } = require("./admin.purchasedMachine.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/export",                exportToExcel);
router.post("/verify-serial-numbers", verifySerialNumbers);
router.post("/verify-part-codes",     verifyPartCodes);
router.get("/",                       getAll);
router.get("/:id",                    getById);
router.post("/",                      createPurchase);

module.exports = router;
