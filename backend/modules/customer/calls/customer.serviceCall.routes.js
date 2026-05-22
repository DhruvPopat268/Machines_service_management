const express = require("express");
const multer = require("multer");
const { raiseServiceCall, getActiveCalls, getCompletedCalls, getCancelledCalls, getCallDetail, getDashboardStats } = require("./customer.serviceCall.controller");
const { validateRaiseServiceCall } = require("./customer.serviceCall.validator");
const customerAuthMiddleware = require("../../../middleware/customer.auth.middleware");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split(".").pop().toLowerCase();
    const allowedExtensions = ["jpg", "jpeg", "png", "webp"];
    if (!allowedExtensions.includes(ext))
      return cb(new Error(`Invalid file type. Allowed: ${allowedExtensions.join(", ")}`));
    cb(null, true);
  },
});

const router = express.Router();

router.use(customerAuthMiddleware);

router.get("/dashboard", getDashboardStats);
router.get("/active", getActiveCalls);
router.get("/completed", getCompletedCalls);
router.get("/cancelled", getCancelledCalls);
router.get("/:id", getCallDetail);

// Use upload.any() to accept multiple fields with different names (images_0, images_1, etc.)
router.post("/raise", upload.any(), validateRaiseServiceCall, raiseServiceCall);

module.exports = router;
