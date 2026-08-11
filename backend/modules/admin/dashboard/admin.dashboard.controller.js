const mongoose = require("mongoose");
const ServiceCall = require("../../customer/calls/customer.serviceCall.model");
const Customer    = require("../customerManagement/admin.customer.model");
const AdminUser   = require("../auth/admin.user.model");
const Machine     = require("../inventoryManagement/admin.machine.model");
const PurchasedMachine = require("../purchasedMachines/admin.purchasedMachine.model");
const SoldMachine      = require("../soldMachines/admin.soldMachine.model");
const Expense          = require("../addExpense/admin.expense.model");

const getStats = async (req, res) => {
  try {
    const { from, to } = req.query;

    const dateFilter = {};
    if (from || to) {
      dateFilter["dates.created"] = {};
      if (from) dateFilter["dates.created"].$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        dateFilter["dates.created"].$lte = toDate;
      }
    }

    const callFilter  = { ...dateFilter };
    const dateCreated = {};
    if (from || to) {
      dateCreated.createdAt = {};
      if (from) dateCreated.createdAt.$gte = new Date(from);
      if (to) {
        const toDate2 = new Date(to);
        toDate2.setHours(23, 59, 59, 999);
        dateCreated.createdAt.$lte = toDate2;
      }
    }

    const [
      totalCalls,
      completedCalls,
      openCalls,
      assignedCalls,
      inProgressCalls,
      onHoldCalls,
      cancelledCalls,
      activeEngineers,
      activeCustomers,
      lowStockMachines,
      purchaseAgg,
      saleAgg,
      expenseAgg,
      serviceChargesAgg,
    ] = await Promise.all([
      ServiceCall.countDocuments(callFilter),
      ServiceCall.countDocuments({ ...callFilter, status: "Completed" }),
      ServiceCall.countDocuments({ ...callFilter, status: "Open" }),
      ServiceCall.countDocuments({ ...callFilter, status: "Assigned" }),
      ServiceCall.countDocuments({ ...callFilter, status: "In Progress" }),
      ServiceCall.countDocuments({ ...callFilter, status: "On Hold" }),
      ServiceCall.countDocuments({ ...callFilter, status: "Cancelled" }),
      AdminUser.countDocuments({ role: "Engineer", status: "Active" }),
      Customer.countDocuments({ status: "Active" }),
      Machine.countDocuments({ stockStatus: { $in: ["Low Stock", "Out of Stock"] } }),
      PurchasedMachine.aggregate([
        { $match: dateCreated },
        { $group: { _id: null, totalAmount: { $sum: "$grandTotalBase" }, totalUnits: { $sum: { $sum: "$machines.quantity" } } } },
      ]),
      SoldMachine.aggregate([
        { $match: dateCreated },
        { $group: { _id: null, totalAmount: { $sum: "$grandTotalBase" }, totalUnits: { $sum: { $sum: "$machines.quantity" } }, totalCogs: { $sum: "$cogsTotalBase" } } },
      ]),
      Expense.aggregate([
        { $match: from || to ? {
            date: {
              ...(from ? { $gte: new Date(from) } : {}),
              ...(to   ? { $lte: (() => { const d = new Date(to); d.setHours(23,59,59,999); return d; })() } : {}),
            },
          } : {} },
        { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
      ]),
      ServiceCall.aggregate([
        { $match: { ...dateCreated, totalCharges: { $gt: 0 } } },
        { $group: { _id: null, totalAmount: { $sum: "$totalCharges" } } },
      ]),
    ]);

    const totalPurchaseAmount  = purchaseAgg[0]?.totalAmount ?? 0;
    const totalUnitsPurchased  = purchaseAgg[0]?.totalUnits  ?? 0;
    const totalSaleAmount      = saleAgg[0]?.totalAmount     ?? 0;
    const totalUnitsSold       = saleAgg[0]?.totalUnits      ?? 0;
    const totalCogs            = saleAgg[0]?.totalCogs       ?? 0;
    const totalExpenses        = expenseAgg[0]?.totalAmount  ?? 0;
    const totalServiceCharges  = serviceChargesAgg[0]?.totalAmount ?? 0;
    const netProfit            = totalSaleAmount + totalServiceCharges - totalCogs - totalExpenses;

    return res.status(200).json({
      success: true,
      data: {
        totalCalls,
        completedCalls,
        openCalls,
        assignedCalls,
        inProgressCalls,
        onHoldCalls,
        cancelledCalls,
        activeEngineers,
        activeCustomers,
        lowStockMachines,
        totalPurchaseAmount,
        totalUnitsPurchased,
        totalSaleAmount,
        totalUnitsSold,
        totalCogs,
        totalExpenses,
        totalServiceCharges,
        netProfit,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getCharts = async (req, res) => {
  try {
    const { from, to } = req.query;

    const createdFilter = {};
    if (from || to) {
      createdFilter["dates.created"] = {};
      if (from) createdFilter["dates.created"].$gte = new Date(from);
      if (to) {
        const d = new Date(to); d.setHours(23, 59, 59, 999);
        createdFilter["dates.created"].$lte = d;
      }
    }

    const freePartsMatch = { status: "Completed", callType: "Service-Call" };
    if (from || to) {
      freePartsMatch["dates.completed"] = {};
      if (from) freePartsMatch["dates.completed"].$gte = new Date(from);
      if (to) {
        const d = new Date(to); d.setHours(23, 59, 59, 999);
        freePartsMatch["dates.completed"].$lte = d;
      }
    }

    const CALL_TYPES = ["Service-Call", "Installation", "Dis-Installation", "Counter-Reading", "Others"];
    const STATUSES   = ["Open", "Assigned", "Travel Started", "Reached Location", "In Progress", "On Hold", "Completed", "Cancelled"];

    // Monthly trends — independent of date filter, uses its own mYear/mMonth window
    const now        = new Date();
    const mYear      = parseInt(req.query.mYear)  || now.getFullYear();
    const mMonth     = parseInt(req.query.mMonth) || (now.getMonth() + 1); // 1-12
    const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    // Build 4-month window ending at mYear/mMonth
    const monthWindow = [];
    for (let i = 3; i >= 0; i--) {
      let m = mMonth - i;
      let y = mYear;
      if (m <= 0) { m += 12; y -= 1; }
      monthWindow.push({ year: y, month: m, label: `${MONTH_NAMES[m - 1]} ${y}` });
    }
    const windowStart = new Date(monthWindow[0].year, monthWindow[0].month - 1, 1);
    const windowEnd   = new Date(monthWindow[3].year, monthWindow[3].month,     1); // exclusive

    const [callTypeRows, callStatusRows, freeParts, monthlyRows, zoneRows, totalEngineers, inactiveEngineers, totalCustomers, inactiveCustomers] = await Promise.all([
      // Calls by Call Type
      ServiceCall.aggregate([
        { $match: createdFilter },
        { $group: {
          _id:       "$callType",
          total:     { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } },
        }},
      ]),

      // Calls by Status
      ServiceCall.aggregate([
        { $match: createdFilter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),

      // Free Parts
      ServiceCall.aggregate([
        { $match: freePartsMatch },
        { $unwind: "$machines" },
        { $unwind: "$machines.usedParts" },
        { $match: { "machines.usedParts.total": 0 } },
        { $group: {
          _id: {
            contractTypeId:   "$machines.contractType.contractTypeId",
            contractTypeName: "$machines.contractType.name",
            contractTypeCode: "$machines.contractType.code",
            partMachineId:    "$machines.usedParts.machineId",
            machineName:      "$machines.usedParts.machineName",
          },
          modelNumber: { $max: "$machines.usedParts.modelNumber" },
          freeCount:   { $sum: 1 },
        }},
        { $group: {
          _id: {
            contractTypeId:   "$_id.contractTypeId",
            contractTypeName: "$_id.contractTypeName",
            contractTypeCode: "$_id.contractTypeCode",
          },
          totalFreeParts: { $sum: "$freeCount" },
          parts: { $push: {
            machineId:   "$_id.partMachineId",
            machineName: "$_id.machineName",
            modelNumber: "$modelNumber",
            freeCount:   "$freeCount",
          }},
        }},
        { $project: {
          _id:              0,
          contractTypeId:   "$_id.contractTypeId",
          contractTypeName: "$_id.contractTypeName",
          contractTypeCode: "$_id.contractTypeCode",
          totalFreeParts:   1,
          parts: { $map: { input: "$parts", as: "p", in: {
            machineId:   "$$p.machineId",
            machineName: "$$p.machineName",
            modelNumber: "$$p.modelNumber",
            freeCount:   "$$p.freeCount",
            percentage:  { $round: [{ $multiply: [{ $divide: ["$$p.freeCount", "$totalFreeParts"] }, 100] }, 2] },
          }}},
        }},
        { $addFields: { parts: { $sortArray: { input: "$parts", sortBy: { freeCount: -1 } } } } },
        { $sort: { totalFreeParts: -1 } },
      ]),
      // Monthly Service Trends
      ServiceCall.aggregate([
        { $match: { "dates.created": { $gte: windowStart, $lt: windowEnd } } },
        { $group: {
          _id:       { year: { $year: "$dates.created" }, month: { $month: "$dates.created" } },
          total:     { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } },
        }},
      ]),
      // Calls by Zone (top 5)
      ServiceCall.aggregate([
        { $match: { ...createdFilter, "customerInfo.zone": { $nin: [null, ""] } } },
        { $group: { _id: "$customerInfo.zone", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        { $project: { _id: 0, zone: "$_id", count: 1 } },
      ]),
      AdminUser.countDocuments({ role: "Engineer" }),
      AdminUser.countDocuments({ role: "Engineer", status: "Inactive" }),
      Customer.countDocuments({}),
      Customer.countDocuments({ status: "Inactive" }),
    ]);

    const monthlyMap = Object.fromEntries(monthlyRows.map(r => [`${r._id.year}-${r._id.month}`, r]));
    const monthlyStats = monthWindow.map(({ year, month, label }) => ({
      month: label,
      total:     monthlyMap[`${year}-${month}`]?.total     ?? 0,
      completed: monthlyMap[`${year}-${month}`]?.completed ?? 0,
    }));
    const isCurrentWindow = mYear === now.getFullYear() && mMonth === (now.getMonth() + 1);

    const callTypeMap = Object.fromEntries(callTypeRows.map(r => [r._id, { total: r.total, completed: r.completed }]));
    const callTypeStats = CALL_TYPES.map(type => ({
      type, total: callTypeMap[type]?.total ?? 0, completed: callTypeMap[type]?.completed ?? 0,
    }));

    const callStatusMap = Object.fromEntries(callStatusRows.map(r => [r._id, r.count]));
    const callStatusStats = STATUSES.map(status => ({ status, count: callStatusMap[status] ?? 0 }));

    const zoneStats = zoneRows;

    return res.status(200).json({ success: true, data: { callTypeStats, callStatusStats, freeParts, monthlyStats, isCurrentWindow, zoneStats, totalEngineers, inactiveEngineers, totalCustomers, inactiveCustomers } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAccountCharts = async (req, res) => {
  try {
    const { from, to } = req.query;

    const accountFilter = {};
    if (from || to) {
      accountFilter.createdAt = {};
      if (from) accountFilter.createdAt.$gte = new Date(from);
      if (to) {
        const d = new Date(to); d.setHours(23, 59, 59, 999);
        accountFilter.createdAt.$lte = d;
      }
    }

    const now    = new Date();
    const mYear  = parseInt(req.query.mYear)  || now.getFullYear();
    const mMonth = parseInt(req.query.mMonth) || (now.getMonth() + 1);
    const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    const monthWindow = [];
    for (let i = 3; i >= 0; i--) {
      let m = mMonth - i, y = mYear;
      if (m <= 0) { m += 12; y -= 1; }
      monthWindow.push({ year: y, month: m, label: `${MONTH_NAMES[m - 1]} ${y}` });
    }
    const windowStart = new Date(monthWindow[0].year, monthWindow[0].month - 1, 1);
    const windowEnd   = new Date(monthWindow[3].year, monthWindow[3].month,     1);

    const [categoryPurchaseRows, categorySaleRows, divisionPurchaseRows, divisionSaleRows, vendorRows, customerSaleRows, purchaseTrendRows, saleTrendRows, contractTypeRows] = await Promise.all([
      // Category-wise Purchase
      PurchasedMachine.aggregate([
        { $match: accountFilter },
        { $unwind: "$machines" },
        { $match: { "machines.category": { $nin: [null, ""] } } },
        { $group: { _id: "$machines.category", purchaseAmount: { $sum: "$machines.buyingTotalBase" } } },
        { $project: { _id: 0, category: "$_id", purchaseAmount: 1 } },
      ]),
      // Category-wise Sale
      SoldMachine.aggregate([
        { $match: accountFilter },
        { $unwind: "$machines" },
        { $match: { "machines.category": { $nin: [null, ""] } } },
        { $group: { _id: "$machines.category", saleAmount: { $sum: "$machines.sellingTotalBase" } } },
        { $project: { _id: 0, category: "$_id", saleAmount: 1 } },
      ]),
      // Division-wise Purchase
      PurchasedMachine.aggregate([
        { $match: accountFilter },
        { $unwind: "$machines" },
        { $match: { "machines.division": { $nin: [null, ""] } } },
        { $group: { _id: "$machines.division", purchaseAmount: { $sum: "$machines.buyingTotalBase" } } },
        { $project: { _id: 0, division: "$_id", purchaseAmount: 1 } },
      ]),
      // Division-wise Sale
      SoldMachine.aggregate([
        { $match: accountFilter },
        { $unwind: "$machines" },
        { $match: { "machines.division": { $nin: [null, ""] } } },
        { $group: { _id: "$machines.division", saleAmount: { $sum: "$machines.sellingTotalBase" } } },
        { $project: { _id: 0, division: "$_id", saleAmount: 1 } },
      ]),
      // Top 5 Vendors
      PurchasedMachine.aggregate([
        { $match: accountFilter },
        { $addFields: { vendorLabel: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$vendorInfo.companyName", ""] } }, 0] }, "$vendorInfo.companyName", "$vendorInfo.name"] } } },
        { $match: { vendorLabel: { $nin: [null, ""] } } },
        { $group: { _id: "$vendorLabel", totalAmount: { $sum: "$grandTotalBase" } } },
        { $sort: { totalAmount: -1 } },
        { $limit: 5 },
        { $project: { _id: 0, vendor: "$_id", totalAmount: 1 } },
      ]),
      // Top 5 Customers
      SoldMachine.aggregate([
        { $match: { ...accountFilter, "customerInfo.customerId": { $nin: [null, ""] } } },
        { $group: { _id: "$customerInfo.customerId", totalAmount: { $sum: "$grandTotalBase" } } },
        { $sort: { totalAmount: -1 } },
        { $limit: 5 },
        { $lookup: { from: "customers", localField: "_id", foreignField: "_id", as: "cust" } },
        { $project: { _id: 0, customer: { $ifNull: [{ $arrayElemAt: ["$cust.customerId", 0] }, "Unknown"] }, totalAmount: 1 } },
      ]),
      // Monthly Purchase Trend
      PurchasedMachine.aggregate([
        { $match: { createdAt: { $gte: windowStart, $lt: windowEnd } } },
        { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, purchaseAmount: { $sum: "$grandTotalBase" } } },
      ]),
      // Monthly Sale Trend
      SoldMachine.aggregate([
        { $match: { createdAt: { $gte: windowStart, $lt: windowEnd } } },
        { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, saleAmount: { $sum: "$grandTotalBase" } } },
      ]),
      // Contract Type-wise Sales
      SoldMachine.aggregate([
        { $match: accountFilter },
        { $unwind: "$machines" },
        { $unwind: { path: "$machines.serialNumbers", includeArrayIndex: "snIdx" } },
        { $match: { "machines.serialNumbers.contractType.name": { $nin: [null, ""] } } },
        { $group: {
          _id: { docId: "$_id", machineId: "$machines.machineId", contractType: "$machines.serialNumbers.contractType.name" },
          sellingTotal: { $first: "$machines.sellingTotalBase" },
        }},
        { $group: { _id: "$_id.contractType", totalAmount: { $sum: "$sellingTotal" } } },
        { $project: { _id: 0, name: "$_id", totalAmount: 1 } },
      ]),
    ]);

    const categoryMap = {};
    categoryPurchaseRows.forEach(r => { categoryMap[r.category] = { category: r.category, purchaseAmount: r.purchaseAmount, saleAmount: 0 }; });
    categorySaleRows.forEach(r => {
      if (categoryMap[r.category]) categoryMap[r.category].saleAmount = r.saleAmount;
      else categoryMap[r.category] = { category: r.category, purchaseAmount: 0, saleAmount: r.saleAmount };
    });
    const categoryStats = Object.values(categoryMap).sort((a, b) => (b.purchaseAmount + b.saleAmount) - (a.purchaseAmount + a.saleAmount));

    const divisionMap = {};
    divisionPurchaseRows.forEach(r => { divisionMap[r.division] = { division: r.division, purchaseAmount: r.purchaseAmount, saleAmount: 0 }; });
    divisionSaleRows.forEach(r => {
      if (divisionMap[r.division]) divisionMap[r.division].saleAmount = r.saleAmount;
      else divisionMap[r.division] = { division: r.division, purchaseAmount: 0, saleAmount: r.saleAmount };
    });
    const divisionStats = Object.values(divisionMap).sort((a, b) => (b.purchaseAmount + b.saleAmount) - (a.purchaseAmount + a.saleAmount));

    const vendorStats       = vendorRows;
    const customerSaleStats = customerSaleRows;

    const purchaseTrendMap = Object.fromEntries(purchaseTrendRows.map(r => [`${r._id.year}-${r._id.month}`, r.purchaseAmount]));
    const saleTrendMap     = Object.fromEntries(saleTrendRows.map(r => [`${r._id.year}-${r._id.month}`, r.saleAmount]));
    const purchaseTrendStats = monthWindow.map(({ year, month, label }) => ({
      month: label,
      purchaseAmount: purchaseTrendMap[`${year}-${month}`] ?? 0,
      saleAmount:     saleTrendMap[`${year}-${month}`]     ?? 0,
    }));
    const isCurrentWindow = mYear === now.getFullYear() && mMonth === (now.getMonth() + 1);

    const contractTypeStats = contractTypeRows;

    return res.status(200).json({ success: true, data: { categoryStats, divisionStats, vendorStats, customerSaleStats, purchaseTrendStats, contractTypeStats, isCurrentWindow } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getStats, getCharts, getAccountCharts };