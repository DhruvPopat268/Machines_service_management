const router = require("express").Router();
const multer = require("multer");
const { getAssignedCalls, getOnHoldCalls, getHistoryCalls, getReimbursementPreview, startTravel, reachedLocation, startWork, putOnHold, getPartsMachines, getChargesSummary, createReimbursement, completeCall } = require("./engineer.serviceCall.controller");
const engineerAuthMiddleware = require("../../../middleware/engineer.auth.middleware");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split(".").pop().toLowerCase();
    if (!["jpg", "jpeg", "png", "webp"].includes(ext))
      return cb(new Error("Invalid file type. Allowed: jpg, jpeg, png, webp"));
    cb(null, true);
  },
});

router.use(engineerAuthMiddleware);

router.get("/assigned", getAssignedCalls);
router.get("/on-hold", getOnHoldCalls);
router.get("/history", getHistoryCalls);
router.get("/parts-machines", getPartsMachines);
router.post("/reimbursement-preview", getReimbursementPreview);
router.patch("/travel-started", startTravel);
router.patch("/reached-location", reachedLocation);
router.patch("/start-work", upload.array("beforeWorkImages", 10), startWork);
router.patch("/on-hold", putOnHold);
router.post("/charges-summary", getChargesSummary);
router.post("/reimbursement", createReimbursement);
router.patch("/complete", upload.fields([
  { name: "afterWorkImages", maxCount: 10 },
  { name: "customerSignature", maxCount: 1 },
]), completeCall);

module.exports = router;
