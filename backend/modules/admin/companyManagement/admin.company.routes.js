const router = require("express").Router();
const { getAllCompanies, createCompany, updateCompany, deleteCompany } = require("./admin.company.controller");
const adminAuthMiddleware = require("../../../middleware/admin.auth.middleware");

router.use(adminAuthMiddleware);

router.get("/", getAllCompanies);
router.post("/", createCompany);
router.patch("/:id", updateCompany);
router.delete("/:id", deleteCompany);

module.exports = router;
