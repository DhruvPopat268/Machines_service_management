const mongoose = require("mongoose");
const ServiceCall = require("../../customer/calls/customer.serviceCall.model");
const Customer    = require("../customerManagement/admin.customer.model");
const AdminUser   = require("../auth/admin.user.model");
const Machine     = require("../inventoryManagement/admin.machine.model");
const PurchasedMachine = require("../purchasedMachines/admin.purchasedMachine.model");
const SoldMachine      = require("../soldMachines/admin.soldMachine.model");
const Expense          = require("../addExpense/admin.expense.model");
const Incentive        = require("../addIncentive/admin.incentive.model");

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
      incentiveAgg,
      serviceChargesAgg,
      freeMaterialCostAgg,
      paidServicePartsCostAgg,
      stockValueAgg,
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
      Incentive.aggregate([
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
      ServiceCall.aggregate([
        { $match: { ...callFilter, status: "Completed", callType: "Service-Call" } },
        { $unwind: "$machines" },
        { $unwind: "$machines.usedParts" },
        { $match: { "machines.usedParts.total": 0 } },
        { $group: { _id: null, totalCost: { $sum: "$machines.usedParts.buyingPriceBase" } } },
      ]),
      ServiceCall.aggregate([
        { $match: { ...callFilter, status: "Completed", callType: "Service-Call" } },
        { $unwind: "$machines" },
        { $unwind: "$machines.usedParts" },
        { $match: { "machines.usedParts.total": { $gt: 0 } } },
        { $group: { _id: null, totalCost: { $sum: "$machines.usedParts.buyingPriceBase" } } },
      ]),
      PurchasedMachine.aggregate([
        { $unwind: "$machines" },
        { $project: {
          buyingPriceBase: "$machines.buyingPriceBase",
          availableSerialCount: {
            $size: {
              $filter: { input: { $ifNull: ["$machines.serialNumbers", []] }, as: "s", cond: { $eq: ["$$s.status", "available"] } }
            }
          },
          availablePartCount: {
            $size: {
              $filter: { input: { $ifNull: ["$machines.partCodes", []] }, as: "p", cond: { $eq: ["$$p.status", "available"] } }
            }
          },
        }},
        { $project: {
          availableValue: {
            $multiply: [
              { $add: ["$availableSerialCount", "$availablePartCount"] },
              "$buyingPriceBase"
            ]
          }
        }},
        { $group: { _id: null, totalStockValue: { $sum: "$availableValue" } } },
      ]),
    ]);

    const totalPurchaseAmount  = purchaseAgg[0]?.totalAmount ?? 0;
    const totalUnitsPurchased  = purchaseAgg[0]?.totalUnits  ?? 0;
    const totalSaleAmount      = saleAgg[0]?.totalAmount     ?? 0;
    const totalUnitsSold       = saleAgg[0]?.totalUnits      ?? 0;
    const soldMachineCogs      = saleAgg[0]?.totalCogs       ?? 0;
    const paidServicePartsCogs = paidServicePartsCostAgg[0]?.totalCost ?? 0;
    const totalCogs            = soldMachineCogs + paidServicePartsCogs;
    const totalExpenses        = expenseAgg[0]?.totalAmount  ?? 0;
    const totalIncentives      = incentiveAgg[0]?.totalAmount ?? 0;
    const totalServiceCharges  = serviceChargesAgg[0]?.totalAmount ?? 0;
    const freeMaterialCost     = freeMaterialCostAgg[0]?.totalCost ?? 0;
    const netProfit            = totalSaleAmount + totalServiceCharges + totalIncentives - totalCogs - freeMaterialCost - totalExpenses;
    const stockValue           = Math.round((stockValueAgg[0]?.totalStockValue ?? 0) * 100) / 100;

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
        totalIncentives,
        totalServiceCharges,
        freeMaterialCost,
        stockValue,
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

    const [categoryPurchaseRows, categorySaleRows, divisionPurchaseRows, divisionSaleRows, vendorRows, customerSaleRows, purchaseTrendRows, saleTrendRows, contractTypeRows, expenseCategoryRows] = await Promise.all([
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
      // Expense Category-wise
      Expense.aggregate([
        { $match: accountFilter },
        { $match: { "category.name": { $nin: [null, ""] } } },
        { $group: { _id: "$category.name", totalAmount: { $sum: "$amount" } } },
        { $project: { _id: 0, category: "$_id", totalAmount: 1 } },
        { $sort: { totalAmount: -1 } },
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
    const expenseCategoryStats = expenseCategoryRows;

    return res.status(200).json({ success: true, data: { categoryStats, divisionStats, vendorStats, customerSaleStats, purchaseTrendStats, contractTypeStats, expenseCategoryStats, isCurrentWindow } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Get net profit charts data
 * - Monthly net profit trend (4-month window, navigable)
 * - Category-wise net profit
 * - Division-wise net profit
 */
const getNetProfitCharts = async (req, res) => {
  try {
    const { from, to } = req.query;

    // ── Date filter for category/division (respects custom date range) ──
    const dateFilter = {};
    if (from || to) {
      dateFilter.createdAt = {};
      if (from) dateFilter.createdAt.$gte = new Date(from);
      if (to) {
        const d = new Date(to);
        d.setHours(23, 59, 59, 999);
        dateFilter.createdAt.$lte = d;
      }
    }

    // ── Monthly trends — independent of date filter, uses its own mYear/mMonth window ──
    const now = new Date();
    const mYear = parseInt(req.query.mYear) || now.getFullYear();
    const mMonth = parseInt(req.query.mMonth) || (now.getMonth() + 1); // 1-12
    const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Build 4-month window ending at mYear/mMonth
    const monthWindow = [];
    for (let i = 3; i >= 0; i--) {
      let m = mMonth - i;
      let y = mYear;
      if (m <= 0) {
        m += 12;
        y -= 1;
      }
      monthWindow.push({ year: y, month: m, label: `${MONTH_NAMES[m - 1]} ${y}` });
    }
    const windowStart = new Date(monthWindow[0].year, monthWindow[0].month - 1, 1);
    const windowEnd = new Date(monthWindow[3].year, monthWindow[3].month, 1); // exclusive

    // ── Calculate monthly net profit ──
    const [monthlySalesRows, monthlyServiceChargesRows, monthlyExpensesRows, monthlyIncentivesRows, monthlyFreeMaterialRows, monthlyPaidServicePartsRows] = await Promise.all([
      // Monthly sales revenue and COGS
      SoldMachine.aggregate([
        { $match: { createdAt: { $gte: windowStart, $lt: windowEnd } } },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            revenue: { $sum: "$grandTotalBase" },
            cogs: { $sum: "$cogsTotalBase" },
          },
        },
      ]),

      // Monthly service charges
      ServiceCall.aggregate([
        { $match: { createdAt: { $gte: windowStart, $lt: windowEnd }, totalCharges: { $gt: 0 } } },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            serviceCharges: { $sum: "$totalCharges" },
          },
        },
      ]),

      // Monthly expenses
      Expense.aggregate([
        { $match: { date: { $gte: windowStart, $lt: windowEnd } } },
        {
          $group: {
            _id: { year: { $year: "$date" }, month: { $month: "$date" } },
            expenses: { $sum: "$amount" },
          },
        },
      ]),

      // Monthly incentives
      Incentive.aggregate([
        { $match: { date: { $gte: windowStart, $lt: windowEnd } } },
        {
          $group: {
            _id: { year: { $year: "$date" }, month: { $month: "$date" } },
            incentives: { $sum: "$amount" },
          },
        },
      ]),

      // Monthly free material cost
      ServiceCall.aggregate([
        {
          $match: {
            createdAt: { $gte: windowStart, $lt: windowEnd },
            status: "Completed",
            callType: "Service-Call",
          },
        },
        { $unwind: "$machines" },
        { $unwind: "$machines.usedParts" },
        { $match: { "machines.usedParts.total": 0 } },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            freeMaterialCost: { $sum: "$machines.usedParts.buyingPriceBase" },
          },
        },
      ]),

      // Monthly paid service parts cost (COGS)
      ServiceCall.aggregate([
        {
          $match: {
            createdAt: { $gte: windowStart, $lt: windowEnd },
            status: "Completed",
            callType: "Service-Call",
          },
        },
        { $unwind: "$machines" },
        { $unwind: "$machines.usedParts" },
        { $match: { "machines.usedParts.total": { $gt: 0 } } },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            paidServicePartsCost: { $sum: "$machines.usedParts.buyingPriceBase" },
          },
        },
      ]),
    ]);

    // Build monthly data map
    const monthlyDataMap = {};
    monthlySalesRows.forEach((r) => {
      const key = `${r._id.year}-${r._id.month}`;
      monthlyDataMap[key] = {
        revenue: r.revenue || 0,
        cogs: r.cogs || 0,
        serviceCharges: 0,
        expenses: 0,
        incentives: 0,
        freeMaterialCost: 0,
        paidServicePartsCost: 0,
      };
    });

    monthlyServiceChargesRows.forEach((r) => {
      const key = `${r._id.year}-${r._id.month}`;
      if (!monthlyDataMap[key]) {
        monthlyDataMap[key] = { revenue: 0, cogs: 0, serviceCharges: 0, expenses: 0, incentives: 0, freeMaterialCost: 0, paidServicePartsCost: 0 };
      }
      monthlyDataMap[key].serviceCharges = r.serviceCharges || 0;
    });

    monthlyExpensesRows.forEach((r) => {
      const key = `${r._id.year}-${r._id.month}`;
      if (!monthlyDataMap[key]) {
        monthlyDataMap[key] = { revenue: 0, cogs: 0, serviceCharges: 0, expenses: 0, incentives: 0, freeMaterialCost: 0, paidServicePartsCost: 0 };
      }
      monthlyDataMap[key].expenses = r.expenses || 0;
    });

    monthlyIncentivesRows.forEach((r) => {
      const key = `${r._id.year}-${r._id.month}`;
      if (!monthlyDataMap[key]) {
        monthlyDataMap[key] = { revenue: 0, cogs: 0, serviceCharges: 0, expenses: 0, incentives: 0, freeMaterialCost: 0, paidServicePartsCost: 0 };
      }
      monthlyDataMap[key].incentives = r.incentives || 0;
    });

    monthlyFreeMaterialRows.forEach((r) => {
      const key = `${r._id.year}-${r._id.month}`;
      if (!monthlyDataMap[key]) {
        monthlyDataMap[key] = { revenue: 0, cogs: 0, serviceCharges: 0, expenses: 0, incentives: 0, freeMaterialCost: 0, paidServicePartsCost: 0 };
      }
      monthlyDataMap[key].freeMaterialCost = r.freeMaterialCost || 0;
    });

    monthlyPaidServicePartsRows.forEach((r) => {
      const key = `${r._id.year}-${r._id.month}`;
      if (!monthlyDataMap[key]) {
        monthlyDataMap[key] = { revenue: 0, cogs: 0, serviceCharges: 0, expenses: 0, incentives: 0, freeMaterialCost: 0, paidServicePartsCost: 0 };
      }
      monthlyDataMap[key].paidServicePartsCost = r.paidServicePartsCost || 0;
    });

    // Map to 4-month window
    const monthlyNetProfitStats = monthWindow.map(({ year, month, label }) => {
      const key = `${year}-${month}`;
      const data = monthlyDataMap[key] || {
        revenue: 0,
        cogs: 0,
        serviceCharges: 0,
        expenses: 0,
        incentives: 0,
        freeMaterialCost: 0,
        paidServicePartsCost: 0,
      };

      const totalRevenue = data.revenue + data.serviceCharges + data.incentives;
      const totalCosts = data.cogs + data.expenses + data.freeMaterialCost + data.paidServicePartsCost;
      const netProfit = Math.round((totalRevenue - totalCosts) * 100) / 100;

      return {
        month: label,
        revenue: Math.round(data.revenue * 100) / 100,
        serviceCharges: Math.round(data.serviceCharges * 100) / 100,
        incentives: Math.round(data.incentives * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        cogs: Math.round(data.cogs * 100) / 100,
        expenses: Math.round(data.expenses * 100) / 100,
        freeMaterialCost: Math.round(data.freeMaterialCost * 100) / 100,
        paidServicePartsCost: Math.round(data.paidServicePartsCost * 100) / 100,
        totalCosts: Math.round(totalCosts * 100) / 100,
        netProfit,
      };
    });

    const isCurrentWindow = mYear === now.getFullYear() && mMonth === now.getMonth() + 1;

    // ── Calculate category-wise net profit (respects custom date range) ──
    const [categorySalesRows, categoryServiceChargesRows, categoryPartsChargesRows, categoryFreeMaterialRows, categoryPaidServicePartsRows] = await Promise.all([
      // Category-wise sales revenue and COGS
      SoldMachine.aggregate([
        { $match: dateFilter },
        { $unwind: "$machines" },
        { $match: { "machines.category": { $nin: [null, ""] } } },
        {
          $project: {
            category: "$machines.category",
            revenue: "$machines.sellingTotalBase",
            quantity: "$machines.quantity",
            serialNumbersCogs: {
              $reduce: {
                input: { $ifNull: ["$machines.serialNumbers", []] },
                initialValue: 0,
                in: { $add: ["$$value", { $ifNull: ["$$this.buyingPriceBase", 0] }] },
              },
            },
            partCodesCogs: { $ifNull: ["$machines.partCodes.buyingPriceBase", 0] },
          },
        },
        {
          $project: {
            category: 1,
            revenue: 1,
            cogs: {
              $add: [
                "$serialNumbersCogs",
                { $multiply: ["$partCodesCogs", "$quantity"] },
              ],
            },
          },
        },
        {
          $group: {
            _id: "$category",
            revenue: { $sum: "$revenue" },
            cogs: { $sum: "$cogs" },
          },
        },
        { $project: { _id: 0, category: "$_id", revenue: 1, cogs: 1 } },
      ]),

      // Category-wise service charges (direct from machine.serviceCharge)
      ServiceCall.aggregate([
        { $match: { ...dateFilter, status: "Completed", callType: "Service-Call" } },
        { $unwind: "$machines" },
        { $match: { "machines.category": { $nin: [null, ""] } } },
        {
          $group: {
            _id: "$machines.category",
            serviceCharges: { $sum: { $ifNull: ["$machines.serviceCharge", 0] } },
          },
        },
        { $project: { _id: 0, category: "$_id", serviceCharges: 1 } },
      ]),

      // Category-wise parts charges (direct from usedParts where total > 0)
      ServiceCall.aggregate([
        {
          $match: {
            ...dateFilter,
            status: "Completed",
            callType: "Service-Call",
          },
        },
        { $unwind: "$machines" },
        { $unwind: "$machines.usedParts" },
        { $match: { "machines.usedParts.total": { $gt: 0 }, "machines.usedParts.category": { $nin: [null, ""] } } },
        {
          $group: {
            _id: "$machines.usedParts.category",
            partsCharges: { $sum: "$machines.usedParts.total" },
          },
        },
        { $project: { _id: 0, category: "$_id", partsCharges: 1 } },
      ]),

      // Category-wise free material cost
      ServiceCall.aggregate([
        {
          $match: {
            ...dateFilter,
            status: "Completed",
            callType: "Service-Call",
          },
        },
        { $unwind: "$machines" },
        { $unwind: "$machines.usedParts" },
        { $match: { "machines.usedParts.total": 0, "machines.usedParts.category": { $nin: [null, ""] } } },
        {
          $group: {
            _id: "$machines.usedParts.category",
            freeMaterialCost: { $sum: "$machines.usedParts.buyingPriceBase" },
          },
        },
        { $project: { _id: 0, category: "$_id", freeMaterialCost: 1 } },
      ]),

      // Category-wise paid service parts cost (COGS)
      ServiceCall.aggregate([
        {
          $match: {
            ...dateFilter,
            status: "Completed",
            callType: "Service-Call",
          },
        },
        { $unwind: "$machines" },
        { $unwind: "$machines.usedParts" },
        { $match: { "machines.usedParts.total": { $gt: 0 }, "machines.usedParts.category": { $nin: [null, ""] } } },
        {
          $group: {
            _id: "$machines.usedParts.category",
            paidServicePartsCost: { $sum: "$machines.usedParts.buyingPriceBase" },
          },
        },
        { $project: { _id: 0, category: "$_id", paidServicePartsCost: 1 } },
      ]),

      // Category-wise expenses
      // Category-wise incentives (proportional to machines in calls)
      ServiceCall.aggregate([
        { $match: { ...dateFilter, status: "Completed", callType: "Service-Call" } },
        { $unwind: "$machines" },
        { $match: { "machines.category": { $nin: [null, ""] } } },
        {
          $group: {
            _id: { callId: "$_id", category: "$machines.category", totalCharges: "$totalCharges" },
            machineCount: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: { callId: "$_id.callId", totalCharges: "$_id.totalCharges" },
            categories: {
              $push: { category: "$_id.category", machineCount: "$machineCount" },
            },
            totalMachines: { $sum: "$machineCount" },
          },
        },
        { $unwind: "$categories" },
        {
          $project: {
            category: "$categories.category",
            incentiveAmount: {
              $multiply: [
                "$_id.totalCharges",
                { $divide: ["$categories.machineCount", "$totalMachines"] },
              ],
            },
          },
        },
        {
          $group: {
            _id: "$category",
            incentives: { $sum: "$incentiveAmount" },
          },
        },
        { $project: { _id: 0, category: "$_id", incentives: 1 } },
      ]),
    ]);

    // Build category map
    const categoryMap = {};
    categorySalesRows.forEach((r) => {
      categoryMap[r.category] = {
        category: r.category,
        revenue: r.revenue || 0,
        cogs: r.cogs || 0,
        serviceCharges: 0,
        partsCharges: 0,
        freeMaterialCost: 0,
        paidServicePartsCost: 0,
      };
    });

    categoryServiceChargesRows.forEach((r) => {
      if (!categoryMap[r.category]) {
        categoryMap[r.category] = {
          category: r.category,
          revenue: 0,
          cogs: 0,
          serviceCharges: 0,
          partsCharges: 0,
          freeMaterialCost: 0,
          paidServicePartsCost: 0,
        };
      }
      categoryMap[r.category].serviceCharges = r.serviceCharges || 0;
    });

    categoryPartsChargesRows.forEach((r) => {
      if (!categoryMap[r.category]) {
        categoryMap[r.category] = {
          category: r.category,
          revenue: 0,
          cogs: 0,
          serviceCharges: 0,
          partsCharges: 0,
          freeMaterialCost: 0,
          paidServicePartsCost: 0,
        };
      }
      categoryMap[r.category].partsCharges = r.partsCharges || 0;
    });

    categoryFreeMaterialRows.forEach((r) => {
      if (!categoryMap[r.category]) {
        categoryMap[r.category] = {
          category: r.category,
          revenue: 0,
          cogs: 0,
          serviceCharges: 0,
          partsCharges: 0,
          freeMaterialCost: 0,
          paidServicePartsCost: 0,
        };
      }
      categoryMap[r.category].freeMaterialCost = r.freeMaterialCost || 0;
    });

    categoryPaidServicePartsRows.forEach((r) => {
      if (!categoryMap[r.category]) {
        categoryMap[r.category] = {
          category: r.category,
          revenue: 0,
          cogs: 0,
          serviceCharges: 0,
          partsCharges: 0,
          freeMaterialCost: 0,
          paidServicePartsCost: 0,
        };
      }
      categoryMap[r.category].paidServicePartsCost = r.paidServicePartsCost || 0;
    });

    const categoryNetProfitStats = Object.values(categoryMap)
      .map((data) => {
        const totalRevenue = data.revenue + data.serviceCharges + data.partsCharges;
        const totalCosts = data.cogs + data.paidServicePartsCost + data.freeMaterialCost;
        const netProfit = Math.round((totalRevenue - totalCosts) * 100) / 100;

        return {
          category: data.category,
          revenue: Math.round(data.revenue * 100) / 100,
          serviceCharges: Math.round(data.serviceCharges * 100) / 100,
          partsCharges: Math.round(data.partsCharges * 100) / 100,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          cogs: Math.round(data.cogs * 100) / 100,
          paidServicePartsCost: Math.round(data.paidServicePartsCost * 100) / 100,
          freeMaterialCost: Math.round(data.freeMaterialCost * 100) / 100,
          totalCosts: Math.round(totalCosts * 100) / 100,
          netProfit,
        };
      })
      .sort((a, b) => b.netProfit - a.netProfit);

    // ── Calculate division-wise net profit (respects custom date range) ──
    const [divisionSalesRows, divisionServiceChargesRows, divisionPartsChargesRows, divisionFreeMaterialRows, divisionPaidServicePartsRows] = await Promise.all([
      // Division-wise sales revenue and COGS
      SoldMachine.aggregate([
        { $match: dateFilter },
        { $unwind: "$machines" },
        { $match: { "machines.division": { $nin: [null, ""] } } },
        {
          $project: {
            division: "$machines.division",
            revenue: "$machines.sellingTotalBase",
            quantity: "$machines.quantity",
            serialNumbersCogs: {
              $reduce: {
                input: { $ifNull: ["$machines.serialNumbers", []] },
                initialValue: 0,
                in: { $add: ["$$value", { $ifNull: ["$$this.buyingPriceBase", 0] }] },
              },
            },
            partCodesCogs: { $ifNull: ["$machines.partCodes.buyingPriceBase", 0] },
          },
        },
        {
          $project: {
            division: 1,
            revenue: 1,
            cogs: {
              $add: [
                "$serialNumbersCogs",
                { $multiply: ["$partCodesCogs", "$quantity"] },
              ],
            },
          },
        },
        {
          $group: {
            _id: "$division",
            revenue: { $sum: "$revenue" },
            cogs: { $sum: "$cogs" },
          },
        },
        { $project: { _id: 0, division: "$_id", revenue: 1, cogs: 1 } },
      ]),

      // Division-wise service charges (direct from machine.serviceCharge)
      ServiceCall.aggregate([
        { $match: { ...dateFilter, status: "Completed", callType: "Service-Call" } },
        { $unwind: "$machines" },
        { $match: { "machines.division": { $nin: [null, ""] } } },
        {
          $group: {
            _id: "$machines.division",
            serviceCharges: { $sum: { $ifNull: ["$machines.serviceCharge", 0] } },
          },
        },
        { $project: { _id: 0, division: "$_id", serviceCharges: 1 } },
      ]),

      // Division-wise parts charges (direct from usedParts where total > 0)
      ServiceCall.aggregate([
        {
          $match: {
            ...dateFilter,
            status: "Completed",
            callType: "Service-Call",
          },
        },
        { $unwind: "$machines" },
        { $unwind: "$machines.usedParts" },
        { $match: { "machines.usedParts.total": { $gt: 0 }, "machines.usedParts.division": { $nin: [null, ""] } } },
        {
          $group: {
            _id: "$machines.usedParts.division",
            partsCharges: { $sum: "$machines.usedParts.total" },
          },
        },
        { $project: { _id: 0, division: "$_id", partsCharges: 1 } },
      ]),

      // Division-wise free material cost
      ServiceCall.aggregate([
        {
          $match: {
            ...dateFilter,
            status: "Completed",
            callType: "Service-Call",
          },
        },
        { $unwind: "$machines" },
        { $unwind: "$machines.usedParts" },
        { $match: { "machines.usedParts.total": 0, "machines.usedParts.division": { $nin: [null, ""] } } },
        {
          $group: {
            _id: "$machines.usedParts.division",
            freeMaterialCost: { $sum: "$machines.usedParts.buyingPriceBase" },
          },
        },
        { $project: { _id: 0, division: "$_id", freeMaterialCost: 1 } },
      ]),

      // Division-wise paid service parts cost (COGS)
      ServiceCall.aggregate([
        {
          $match: {
            ...dateFilter,
            status: "Completed",
            callType: "Service-Call",
          },
        },
        { $unwind: "$machines" },
        { $unwind: "$machines.usedParts" },
        { $match: { "machines.usedParts.total": { $gt: 0 }, "machines.usedParts.division": { $nin: [null, ""] } } },
        {
          $group: {
            _id: "$machines.usedParts.division",
            paidServicePartsCost: { $sum: "$machines.usedParts.buyingPriceBase" },
          },
        },
        { $project: { _id: 0, division: "$_id", paidServicePartsCost: 1 } },
      ]),

      // Division-wise incentives (proportional to machines in calls)
      ServiceCall.aggregate([
        { $match: { ...dateFilter, status: "Completed", callType: "Service-Call" } },
        { $unwind: "$machines" },
        { $match: { "machines.division": { $nin: [null, ""] } } },
        {
          $group: {
            _id: { callId: "$_id", division: "$machines.division", totalCharges: "$totalCharges" },
            machineCount: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: { callId: "$_id.callId", totalCharges: "$_id.totalCharges" },
            divisions: {
              $push: { division: "$_id.division", machineCount: "$machineCount" },
            },
            totalMachines: { $sum: "$machineCount" },
          },
        },
        { $unwind: "$divisions" },
        {
          $project: {
            division: "$divisions.division",
            incentiveAmount: {
              $multiply: [
                "$_id.totalCharges",
                { $divide: ["$divisions.machineCount", "$totalMachines"] },
              ],
            },
          },
        },
        {
          $group: {
            _id: "$division",
            incentives: { $sum: "$incentiveAmount" },
          },
        },
        { $project: { _id: 0, division: "$_id", incentives: 1 } },
      ]),
    ]);

    // Build division map
    const divisionMap = {};
    divisionSalesRows.forEach((r) => {
      divisionMap[r.division] = {
        division: r.division,
        revenue: r.revenue || 0,
        cogs: r.cogs || 0,
        serviceCharges: 0,
        partsCharges: 0,
        freeMaterialCost: 0,
        paidServicePartsCost: 0,
        expenses: 0,
        incentives: 0,
      };
    });

    divisionServiceChargesRows.forEach((r) => {
      if (!divisionMap[r.division]) {
        divisionMap[r.division] = {
          division: r.division,
          revenue: 0,
          cogs: 0,
          serviceCharges: 0,
          partsCharges: 0,
          freeMaterialCost: 0,
          paidServicePartsCost: 0,
          expenses: 0,
          incentives: 0,
        };
      }
      divisionMap[r.division].serviceCharges = r.serviceCharges || 0;
    });

    divisionPartsChargesRows.forEach((r) => {
      if (!divisionMap[r.division]) {
        divisionMap[r.division] = {
          division: r.division,
          revenue: 0,
          cogs: 0,
          serviceCharges: 0,
          partsCharges: 0,
          freeMaterialCost: 0,
          paidServicePartsCost: 0,
          expenses: 0,
          incentives: 0,
        };
      }
      divisionMap[r.division].partsCharges = r.partsCharges || 0;
    });

    divisionFreeMaterialRows.forEach((r) => {
      if (!divisionMap[r.division]) {
        divisionMap[r.division] = {
          division: r.division,
          revenue: 0,
          cogs: 0,
          serviceCharges: 0,
          partsCharges: 0,
          freeMaterialCost: 0,
          paidServicePartsCost: 0,
          expenses: 0,
          incentives: 0,
        };
      }
      divisionMap[r.division].freeMaterialCost = r.freeMaterialCost || 0;
    });

    divisionPaidServicePartsRows.forEach((r) => {
      if (!divisionMap[r.division]) {
        divisionMap[r.division] = {
          division: r.division,
          revenue: 0,
          cogs: 0,
          serviceCharges: 0,
          partsCharges: 0,
          freeMaterialCost: 0,
          paidServicePartsCost: 0,
          expenses: 0,
          incentives: 0,
        };
      }
      divisionMap[r.division].paidServicePartsCost = r.paidServicePartsCost || 0;
    });

    const divisionNetProfitStats = Object.values(divisionMap)
      .map((data) => {
        const totalRevenue = data.revenue + data.serviceCharges + data.partsCharges;
        const totalCosts = data.cogs + data.paidServicePartsCost + data.freeMaterialCost;
        const netProfit = Math.round((totalRevenue - totalCosts) * 100) / 100;

        return {
          division: data.division,
          revenue: Math.round(data.revenue * 100) / 100,
          serviceCharges: Math.round(data.serviceCharges * 100) / 100,
          partsCharges: Math.round(data.partsCharges * 100) / 100,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          cogs: Math.round(data.cogs * 100) / 100,
          paidServicePartsCost: Math.round(data.paidServicePartsCost * 100) / 100,
          freeMaterialCost: Math.round(data.freeMaterialCost * 100) / 100,
          totalCosts: Math.round(totalCosts * 100) / 100,
          netProfit,
        };
      })
      .sort((a, b) => b.netProfit - a.netProfit);

    return res.status(200).json({
      success: true,
      data: {
        monthlyNetProfitStats,
        isCurrentWindow,
        categoryNetProfitStats,
        divisionNetProfitStats,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getStats, getCharts, getAccountCharts, getNetProfitCharts };