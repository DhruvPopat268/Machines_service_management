const router = require("express").Router();

router.use("/users", require("./auth/admin.user.routes"));
router.use("/zones", require("./zoneManagement/admin.zone.routes"));
router.use("/contract-types", require("./contractTypesManagement/admin.contractType.routes"));
router.use("/vendors", require("./vendorManagement/admin.vendor.routes"));
router.use("/attributes", require("./attributeManagement/admin.attribute.routes"));
router.use("/machine-categories", require("./machineCategoryManagement/admin.machineCategory.routes"));
router.use("/machine-divisions", require("./machineDivisionManagement/admin.machineDivision.routes"));
router.use("/problem-types", require("./problemTypeManagement/admin.problemType.routes"));
router.use("/customers", require("./customerManagement/admin.customer.routes"));
router.use("/machines",  require("./inventoryManagement/admin.machine.routes"));

module.exports = router;
