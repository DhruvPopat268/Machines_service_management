const express = require("express");
const { createShortcutFlow } = require("./admin.flowShortcut.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

const router = express.Router();

router.use(adminAuthMiddleware);

router.post("/setup", createShortcutFlow);

module.exports = router;
