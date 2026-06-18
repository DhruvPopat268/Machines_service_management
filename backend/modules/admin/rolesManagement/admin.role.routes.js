const router = require("express").Router();
const { getAllRoles, getActiveRoles, createRole, updateRole, deleteRole } = require("./admin.role.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/active", getActiveRoles);
router.get("/",       getAllRoles);
router.post("/",      createRole);
router.patch("/:id",  updateRole);
router.delete("/:id", deleteRole);

module.exports = router;
