const router = require("express").Router();
const { getAll, getById, createSale, exportToExcel, checkSerialNumbers, renewContract } = require("./admin.soldMachine.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/export",           exportToExcel);
router.get("/",                 getAll);
router.get("/:id",              getById);
router.post("/",                createSale);
router.post("/check-serials",   checkSerialNumbers);
router.patch("/renew-contract", renewContract);

module.exports = router;
