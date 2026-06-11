const express = require("express");
const multer  = require("multer");
const { getCalls, getCallDetail, assignEngineer, updateCall, getCustomerMachines, getCustomerMachineDetail, raiseServiceCall, getServiceCallInvoice, getCounterReadingInvoice } = require("./admin.serviceCall.controller");
const authMiddleware = require("../../../middleware/admin.auth.middleware");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split(".").pop().toLowerCase();
    ["jpg", "jpeg", "png", "webp"].includes(ext) ? cb(null, true) : cb(new Error("Invalid file type"));
  },
});

const router = express.Router();

router.use(authMiddleware);

router.post("/raise", upload.any(), raiseServiceCall);
router.get("/customer-machines", getCustomerMachines);
router.get("/customer-machines/detail", getCustomerMachineDetail);
router.get("/", getCalls);

router.post("/:id/invoice", getServiceCallInvoice);
router.post("/:id/counter-reading-invoice", getCounterReadingInvoice);
router.get("/:id", getCallDetail);
router.patch("/:id/assign-engineer", assignEngineer);
router.patch("/:id", updateCall);

module.exports = router;
