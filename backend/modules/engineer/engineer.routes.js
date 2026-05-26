const router = require("express").Router();

router.use("/auth", require("./auth/engineer.routes"));

module.exports = router;
