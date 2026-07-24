const mongoose = require("mongoose");
const ServiceCall = require("../../customer/calls/customer.serviceCall.model");
const Customer    = require("../customerManagement/admin.customer.model");
const AdminUser   = require("../auth/admin.user.model");
const Machine     = require("../inventoryManagement/admin.machine.model");

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

    const callFilter = { ...dateFilter };

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
    ]);


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

module.exports = { getStats, getCharts };
