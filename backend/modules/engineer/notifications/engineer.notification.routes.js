const express = require("express");
const router  = express.Router();
const { getNotifications, markAsRead } = require("./engineer.notification.controller");
const engineerAuthMiddleware = require("../../../middleware/engineer.auth.middleware");

router.use(engineerAuthMiddleware);

router.get("/", getNotifications);
router.patch("/mark-read", markAsRead);

module.exports = router;
