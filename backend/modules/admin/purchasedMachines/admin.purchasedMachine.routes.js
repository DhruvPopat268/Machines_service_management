const router = require("express").Router();
const multer = require("multer");
const { getAll, getById, createPurchase, cancelPurchase, verifySerialNumbers, exportToExcel, downloadSample, importPurchases } = require("./admin.purchasedMachine.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(adminAuthMiddleware);

router.get("/export",                 exportToExcel);
router.get("/sample",                 downloadSample);
router.post("/import",                upload.single("file"), importPurchases);
router.post("/verify-serial-numbers", verifySerialNumbers);
router.get("/",                        getAll);
router.get("/:id",                     getById);
router.post("/",                       createPurchase);
router.patch("/:id/cancel",            cancelPurchase);

module.exports = router;
