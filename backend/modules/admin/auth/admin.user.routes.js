const router = require("express").Router();
const { getAllUsers, createUser, updateUser, deleteUser, login, logout } = require("./admin.user.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.post("/login", login);

router.use(adminAuthMiddleware);

router.post("/logout", logout);
router.get("/", getAllUsers);
router.post("/", createUser);
router.patch("/:id", updateUser);
router.delete("/:id", deleteUser);

module.exports = router;