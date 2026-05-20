const router = require("express").Router();

router.use("/auth", require("./auth/customer.routes"));

module.exports = router;
