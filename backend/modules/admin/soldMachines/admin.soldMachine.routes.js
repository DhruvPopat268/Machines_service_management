const router = require("express").Router();
const { getAll, getById, createSale } = require("./admin.soldMachine.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/",     getAll);
router.get("/:id",  getById);
router.post("/",    createSale);

module.exports = router;
