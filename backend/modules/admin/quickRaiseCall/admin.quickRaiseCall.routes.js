const express = require("express");
const router  = express.Router();
const authMiddleware = require("../../../middleware/admin.auth.middleware");
const { quickRaiseCall, getQuickRaiseStatus, getVendors, checkModelSerial } = require("./admin.quickRaiseCall.controller");

// All routes require admin authentication
router.use(authMiddleware);

/**
 * GET  /api/admin/quick-raise-call/vendors
 * List all vendors with isDummy flag + available stock per vendor.
 */
router.get("/vendors", getVendors);

/**
 * GET  /api/admin/quick-raise-call/status?serialNumber=<sn>
 * Check current state of the workflow for a serial number.
 */
router.get("/status", getQuickRaiseStatus);

/**
 * GET  /api/admin/quick-raise-call/check-model-serial?modelNumber=<mn>&serialNumber=<sn>
 * Check if modelNumber + serialNumber combination already exists in sold machines.
 */
router.get("/check-model-serial", checkModelSerial);

/**
 * POST /api/admin/quick-raise-call
 * Run the full automated workflow in one request.
 *
 * Body (mode: "dummy"):
 * { customer, machine, call }
 *
 * Body (mode: "existing"):
 * { customer, existing: { vendorId, machineId, serialNumber, sellingPrice? }, call }
 */
router.post("/", quickRaiseCall);

module.exports = router;
