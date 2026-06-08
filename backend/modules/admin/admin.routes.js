const router = require("express").Router();

router.use("/users", require("./auth/admin.user.routes"));
router.use("/zones", require("./zoneManagement/admin.zone.routes"));
router.use("/contract-types", require("./contractTypesManagement/admin.contractType.routes"));
router.use("/vendors", require("./vendorManagement/admin.vendor.routes"));
router.use("/machine-categories", require("./machineCategoryManagement/admin.machineCategory.routes"));
router.use("/machine-divisions", require("./machineDivisionManagement/admin.machineDivision.routes"));
router.use("/problem-types", require("./problemTypeManagement/admin.problemType.routes"));
router.use("/customers", require("./customerManagement/admin.customer.routes"));
router.use("/machines",  require("./inventoryManagement/admin.machine.routes"));
router.use("/purchases", require("./purchasedMachines/admin.purchasedMachine.routes"));
router.use("/sales", require("./soldMachines/admin.soldMachine.routes"));
router.use("/inventory-logs", require("./inventoryLogs/admin.inventoryLog.routes"));
router.use("/service-calls", require("./calls/admin.serviceCall.routes"));
router.use("/system-users",  require("./usersManagement/admin.systemUser.routes"));
router.use("/engineers",     require("./engineerManagement/admin.engineer.routes"));
router.use("/reimbursements", require("./reimbursement/admin.reimbursement.routes"));
router.use("/pages-categories", require("./pagesCategoryManagement/admin.pagesCategory.routes"));

module.exports = router;
