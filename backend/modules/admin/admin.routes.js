const router = require("express").Router();

router.use("/users", require("./auth/admin.user.routes"));

module.exports = router;
