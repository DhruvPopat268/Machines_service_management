const router = require("express").Router();
const { getAll, getById, createPurchase, cancelPurchase, verifySerialNumbers, exportToExcel } = require("./admin.purchasedMachine.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/export",                 exportToExcel);
router.post("/verify-serial-numbers", verifySerialNumbers);
router.get("/",                        getAll);
router.get("/:id",                     getById);
router.post("/",                       createPurchase);
router.patch("/:id/cancel",            cancelPurchase);

module.exports = router;
