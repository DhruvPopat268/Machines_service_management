const router = require("express").Router();
const { getAll, createPurchase, addToInventory } = require("./admin.purchasedMachine.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/",                    getAll);
router.post("/",                   createPurchase);
router.patch("/:id/add-inventory", addToInventory);

module.exports = router;
