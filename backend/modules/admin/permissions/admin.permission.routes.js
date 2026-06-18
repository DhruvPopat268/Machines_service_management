const router = require("express").Router();
const { getAllPermissions, createPermission, updatePermission, deletePermission } = require("./admin.permission.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/",       getAllPermissions);
router.post("/",      createPermission);
router.patch("/:id",  updatePermission);
router.delete("/:id", deletePermission);

module.exports = router;
