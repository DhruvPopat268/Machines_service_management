const ServiceCall = require("../../customer/calls/customer.serviceCall.model");
const mongoose = require("mongoose");
const AdminUser = require("../auth/admin.user.model");

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getCalls = async (req, res) => {
  try {
    const { status, search, problemTypeId, machineName, customerName, engineerName, category, division, fromDate, toDate, page = 1, limit = 10 } = req.query;

    const query = {};

    if (status) query.status = status;

    if (search) {
      const s = escapeRegex(search.trim().slice(0, 100));
      query.$or = [
        { callId:               { $regex: s, $options: "i" } },
        { "customerInfo.name":  { $regex: s, $options: "i" } },
        { "customerInfo.phone": { $regex: s, $options: "i" } },
        { "engineerInfo.name":  { $regex: s, $options: "i" } },
      ];
    }

    if (problemTypeId && mongoose.isValidObjectId(problemTypeId)) query["machines.problemTypeIds"] = new mongoose.Types.ObjectId(problemTypeId);
    if (machineName)  query["machines.machineName"] = { $regex: escapeRegex(machineName), $options: "i" };
    if (req.query.serialNumber) query["machines.serialNumber"] = { $regex: escapeRegex(req.query.serialNumber.trim()), $options: "i" };
    if (customerName) query["customerInfo.name"]    = { $regex: escapeRegex(customerName), $options: "i" };
    if (engineerName) query["engineerInfo.name"]    = { $regex: escapeRegex(engineerName), $options: "i" };
    if (category && mongoose.isValidObjectId(category)) query["machines.categoryId"] = new mongoose.Types.ObjectId(category);
    if (division && mongoose.isValidObjectId(division)) query["machines.divisionId"] = new mongoose.Types.ObjectId(division);

    if (fromDate || toDate) {
      const parseIST = (ddmmyy, endOfDay = false) => {
        const [dd, mm, yy] = ddmmyy.split("/");
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const base = Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
        return new Date(base - istOffsetMs);
      };
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = parseIST(fromDate, false);
      if (toDate)   query.createdAt.$lte = parseIST(toDate, true);
    }

    const sortKey = status === "Assigned"    ? "dates.assigned"
      : status === "In Progress" ? "dates.inProgress"
      : status === "On Hold"     ? "dates.onHold"
      : status === "Completed"   ? "dates.completed"
      : status === "Cancelled"   ? "dates.cancelled"
      : "createdAt";

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [calls, total] = await Promise.all([
      ServiceCall.find(query)
        .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt")
        .sort({ [sortKey]: -1 })
        .skip(skip)
        .limit(limitNum),
      ServiceCall.countDocuments(query),
    ]);

    const response = {
      success: true,
      data: calls,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    };

    if (!status && !search && !problemTypeId && !machineName && !customerName && !engineerName && !category && !division && !fromDate && !toDate) {
      const statusCounts = await ServiceCall.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]);
      const stats = { total: 0, open: 0, assigned: 0, inProgress: 0, onHold: 0, completed: 0, cancelled: 0 };
      let grandTotal = 0;
      for (const { _id, count } of statusCounts) {
        grandTotal += count;
        if (_id === "Open")           stats.open        = count;
        else if (_id === "Assigned")    stats.assigned    = count;
        else if (_id === "In Progress") stats.inProgress  = count;
        else if (_id === "On Hold")     stats.onHold      = count;
        else if (_id === "Completed")   stats.completed   = count;
        else if (_id === "Cancelled")   stats.cancelled   = count;
      }
      stats.total = grandTotal;
      response.stats = stats;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching calls:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch calls" });
  }
};

const getCallDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const serviceCall = await ServiceCall.findById(id);
    if (!serviceCall) {
      return res.status(404).json({ success: false, message: "Service call not found" });
    }
    return res.status(200).json({ success: true, data: serviceCall });
  } catch (error) {
    console.error("Error fetching call detail:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch call detail" });
  }
};

const assignEngineer = async (req, res) => {
  try {
    const { id } = req.params;
    const { engineerId } = req.body;

    if (!mongoose.isValidObjectId(engineerId))
      return res.status(400).json({ success: false, message: "Invalid engineerId" });

    const engineer = await AdminUser.findOne({ _id: engineerId, role: "Engineer", status: "Active" })
      .select("_id engineerId name email phone");
    if (!engineer)
      return res.status(404).json({ success: false, message: "Active engineer not found" });

    const call = await ServiceCall.findOne({ _id: id, status: { $in: ["Open", "Assigned"] } });
    if (!call)
      return res.status(400).json({ success: false, message: "Call not found or cannot be assigned in current status" });

    await call.updateOne({
      engineerInfo: {
        _id:        engineer._id,
        identityId: engineer.engineerId,
        name:       engineer.name,
        email:      engineer.email,
        phone:      engineer.phone,
      },
      status: "Assigned",
      "dates.assigned": new Date(),
    });

    return res.status(200).json({ success: true, data: await ServiceCall.findById(id) });
  } catch (error) {
    console.error("Error assigning engineer:", error);
    return res.status(500).json({ success: false, message: "Failed to assign engineer" });
  }
};

const VALID_STATUSES = ["Open", "Assigned", "Travel Started", "Reached Location", "In Progress", "On Hold", "Completed", "Cancelled"];
const VALID_PRIORITIES = ["Low", "Medium", "High", "Critical"];

const STATUS_TRANSITIONS = {
  "Open":             ["Assigned", "Cancelled"],
  "Assigned":         ["Travel Started", "Cancelled"],
  "Travel Started":   ["Reached Location", "Cancelled"],
  "Reached Location": ["In Progress", "Cancelled"],
  "In Progress":      ["On Hold", "Completed", "Cancelled"],
  "On Hold":          ["In Progress", "Cancelled"],
};

const STATUS_DATE_MAP = {
  "Assigned":         "dates.assigned",
  "Travel Started":   "dates.travelStarted",
  "Reached Location": "dates.reachedLocation",
  "In Progress":      "dates.inProgress",
  "On Hold":          "dates.onHold",
  "Completed":        "dates.completed",
  "Cancelled":        "dates.cancelled",
};

const updateCall = async (req, res) => {
  try {
    const { id } = req.params;
    const { note, priority, status } = req.body;

    const call = await ServiceCall.findById(id);
    if (!call)
      return res.status(404).json({ success: false, message: "Service call not found" });

    const update = {};

    if (note !== undefined) {
      if (typeof note !== "string" || !note.trim())
        return res.status(400).json({ success: false, message: "Note cannot be empty" });
      update.note = note.trim();
    }

    if (priority !== undefined) {
      if (!VALID_PRIORITIES.includes(priority))
        return res.status(400).json({ success: false, message: "Invalid priority" });
      update.priority = priority;
    }

    if (status !== undefined) {
      const allowed = STATUS_TRANSITIONS[call.status] ?? [];
      if (!allowed.includes(status))
        return res.status(400).json({ success: false, message: `Cannot transition from ${call.status} to ${status}` });
      update.status = status;
      const dateField = STATUS_DATE_MAP[status];
      if (dateField) update[dateField] = new Date();
    }

    if (!Object.keys(update).length)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    const updated = await ServiceCall.findByIdAndUpdate(id, update, { new: true });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error("Error updating call:", err);
    return res.status(500).json({ success: false, message: "Failed to update call" });
  }
};

module.exports = { getCalls, getCallDetail, assignEngineer, updateCall };
