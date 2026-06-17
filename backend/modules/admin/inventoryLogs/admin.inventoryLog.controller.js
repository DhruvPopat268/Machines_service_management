const mongoose = require("mongoose");
const xlsx = require("xlsx");
const InventoryLog = require("./admin.inventoryLog.model");
const { validateAndParseDate, parseIST } = require("../../../utils/dateValidation");
const MachineCategory = require("../machineCategoryManagement/admin.machineCategory.model");
const MachineDivision = require("../machineDivisionManagement/admin.machineDivision.model");
const Machine = require("../inventoryManagement/admin.machine.model");
const Vendor = require("../vendorManagement/admin.vendor.model");
const Customer = require("../customerManagement/admin.customer.model");
// Helper function to build machine-level filters using $elemMatch
const buildMachineFilter = (category, division, machineId) => {
  const machineFilter = {};
  
  if (category) machineFilter.categoryId = category;
  if (division) machineFilter.divisionId = division;
  if (machineId) machineFilter.machineId = machineId;
  
  // Only return $elemMatch if there are machine-level filters
  return Object.keys(machineFilter).length > 0 ? { $elemMatch: machineFilter } : null;
};


const getAll = async (req, res) => {
  try {
    const { action, search, vendorId, customerId, category, division, machineId, fromDate, toDate, page = 1, limit = 10 } = req.query;

    const query = {};

    if (action && ["purchased", "sold", "dis-installed"].includes(action)) query.action = action;

    // Filter by vendor
    if (vendorId) {
      if (!mongoose.isValidObjectId(vendorId)) {
        return res.status(400).json({ success: false, message: "Invalid vendorId format" });
      }
      const vendor = await Vendor.findById(vendorId);
      if (!vendor) {
        query._id = new mongoose.Types.ObjectId(); // Impossible match
      } else {
        query["vendorInfo.vendorId"] = vendorId;
      }
    }

    // Filter by customer
    if (customerId) {
      if (!mongoose.isValidObjectId(customerId)) {
        return res.status(400).json({ success: false, message: "Invalid customerId format" });
      }
      const customer = await Customer.findById(customerId);
      if (!customer) {
        query._id = new mongoose.Types.ObjectId(); // Impossible match
      } else {
        query["customerInfo.customerId"] = customerId;
      }
    }

    // Filter by category - using ID
    if (category) {
      if (!mongoose.isValidObjectId(category)) {
        return res.status(400).json({ success: false, message: "Invalid category format" });
      }
      const cat = await MachineCategory.findById(category);
      if (!cat) {
        query._id = new mongoose.Types.ObjectId(); // Impossible match
      }
    }

    // Filter by division - using ID
    if (division) {
      if (!mongoose.isValidObjectId(division)) {
        return res.status(400).json({ success: false, message: "Invalid division format" });
      }
      const div = await MachineDivision.findById(division);
      if (!div) {
        query._id = new mongoose.Types.ObjectId(); // Impossible match
      }
    }

    // Filter by machine - using ID
    if (machineId) {
      if (!mongoose.isValidObjectId(machineId)) {
        return res.status(400).json({ success: false, message: "Invalid machineId format" });
      }
      const machine = await Machine.findById(machineId);
      if (!machine) {
        query._id = new mongoose.Types.ObjectId(); // Impossible match
      }
    }

    // Apply machine-level filters using $elemMatch
    const machineFilter = buildMachineFilter(category, division, machineId);
    if (machineFilter) {
      query.machines = machineFilter;
    }

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { "machines.machineName":  { $regex: escaped, $options: "i" } },
          { "machines.modelNumber":  { $regex: escaped, $options: "i" } },
          { "vendorInfo.name":       { $regex: escaped, $options: "i" } },
          { "vendorInfo.companyName":{ $regex: escaped, $options: "i" } },
          { "vendorInfo.phone":      { $regex: escaped, $options: "i" } },
          { "customerInfo.name":     { $regex: escaped, $options: "i" } },
          { "customerInfo.phone":    { $regex: escaped, $options: "i" } },
        ];
      }
    }

    if (fromDate || toDate) {
      if (fromDate) {
        const parsed = validateAndParseDate(fromDate, "fromDate");
        if (parsed.error) {
          return res.status(400).json({ success: false, message: parsed.error });
        }
        const istDate = parseIST(fromDate, false);
        if (!istDate) {
          return res.status(400).json({ success: false, message: "Invalid fromDate" });
        }
        query.createdAt = query.createdAt || {};
        query.createdAt.$gte = istDate;
      }
      
      if (toDate) {
        const parsed = validateAndParseDate(toDate, "toDate");
        if (parsed.error) {
          return res.status(400).json({ success: false, message: parsed.error });
        }
        const istDate = parseIST(toDate, true);
        if (!istDate) {
          return res.status(400).json({ success: false, message: "Invalid toDate" });
        }
        query.createdAt = query.createdAt || {};
        query.createdAt.$lte = istDate;
      }
    }

    // Validate pagination parameters
    const pageNum = Number(page);
    const limitNum = Number(limit);

    if (!Number.isInteger(pageNum) || pageNum < 1) {
      return res.status(400).json({ success: false, message: "page must be a positive integer" });
    }

    if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({ success: false, message: "limit must be a positive integer between 1 and 100" });
    }

    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      InventoryLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      InventoryLog.countDocuments(query),
    ]);

    const data = logs.map((l) => ({ ...l.toObject(), machinesCount: l.machines.length }));

    res.status(200).json({
      success: true,
      data,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid log ID" });

    const log = await InventoryLog.findById(id);
    if (!log)
      return res.status(404).json({ success: false, message: "Inventory log not found" });

    res.status(200).json({ success: true, data: { ...log.toObject(), machinesCount: log.machines.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const formatIST = (date) => {
  const d = new Date(new Date(date).getTime() + 5.5 * 60 * 60 * 1000);
  const dd  = String(d.getUTCDate()).padStart(2, "0");
  const mm  = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy  = String(d.getUTCFullYear()).slice(2);
  const h   = d.getUTCHours();
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = String(h % 12 || 12).padStart(2, "0");
  return { date: `${dd}/${mm}/${yy}`, time: `${h12}:${min} ${ampm}` };
};

const exportInventoryLogs = async (req, res) => {
  try {
    const { action, search, vendorId, customerId, category, division, machineId, fromDate, toDate } = req.query;
    const query = {};

    if (action && ["purchased", "sold", "dis-installed"].includes(action)) query.action = action;

    // Filter by vendor
    if (vendorId) {
      if (!mongoose.isValidObjectId(vendorId)) {
        return res.status(400).json({ success: false, message: "Invalid vendorId format" });
      }
      const vendor = await Vendor.findById(vendorId);
      if (!vendor) {
        query._id = new mongoose.Types.ObjectId(); // Impossible match
      } else {
        query["vendorInfo.vendorId"] = vendorId;
      }
    }

    // Filter by customer
    if (customerId) {
      if (!mongoose.isValidObjectId(customerId)) {
        return res.status(400).json({ success: false, message: "Invalid customerId format" });
      }
      const customer = await Customer.findById(customerId);
      if (!customer) {
        query._id = new mongoose.Types.ObjectId(); // Impossible match
      } else {
        query["customerInfo.customerId"] = customerId;
      }
    }

    // Filter by category - using ID
    if (category) {
      if (!mongoose.isValidObjectId(category)) {
        return res.status(400).json({ success: false, message: "Invalid category format" });
      }
      const cat = await MachineCategory.findById(category);
      if (!cat) {
        query._id = new mongoose.Types.ObjectId(); // Impossible match
      }
    }

    // Filter by division - using ID
    if (division) {
      if (!mongoose.isValidObjectId(division)) {
        return res.status(400).json({ success: false, message: "Invalid division format" });
      }
      const div = await MachineDivision.findById(division);
      if (!div) {
        query._id = new mongoose.Types.ObjectId(); // Impossible match
      }
    }

    // Filter by machine - using ID
    if (machineId) {
      if (!mongoose.isValidObjectId(machineId)) {
        return res.status(400).json({ success: false, message: "Invalid machineId format" });
      }
      const machine = await Machine.findById(machineId);
      if (!machine) {
        query._id = new mongoose.Types.ObjectId(); // Impossible match
      }
    }

    // Apply machine-level filters using $elemMatch
    const machineFilter = buildMachineFilter(category, division, machineId);
    if (machineFilter) {
      query.machines = machineFilter;
    }

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { "machines.machineName":  { $regex: escaped, $options: "i" } },
          { "machines.modelNumber":  { $regex: escaped, $options: "i" } },
          { "vendorInfo.name":       { $regex: escaped, $options: "i" } },
          { "vendorInfo.companyName":{ $regex: escaped, $options: "i" } },
          { "vendorInfo.phone":      { $regex: escaped, $options: "i" } },
          { "customerInfo.name":     { $regex: escaped, $options: "i" } },
          { "customerInfo.phone":    { $regex: escaped, $options: "i" } },
        ];
      }
    }

    if (fromDate || toDate) {
      if (fromDate) {
        const parsed = validateAndParseDate(fromDate, "fromDate");
        if (parsed.error) {
          return res.status(400).json({ success: false, message: parsed.error });
        }
        const istDate = parseIST(fromDate, false);
        if (!istDate) {
          return res.status(400).json({ success: false, message: "Invalid fromDate" });
        }
        query.createdAt = query.createdAt || {};
        query.createdAt.$gte = istDate;
      }
      
      if (toDate) {
        const parsed = validateAndParseDate(toDate, "toDate");
        if (parsed.error) {
          return res.status(400).json({ success: false, message: parsed.error });
        }
        const istDate = parseIST(toDate, true);
        if (!istDate) {
          return res.status(400).json({ success: false, message: "Invalid toDate" });
        }
        query.createdAt = query.createdAt || {};
        query.createdAt.$lte = istDate;
      }
    }

    const logs = await InventoryLog.find(query).sort({ createdAt: -1 }).lean();

    const rows = [];
    logs.forEach((log) => {
      const created = formatIST(log.createdAt);
      const isPurchased = log.action === "purchased";
      
      log.machines.forEach((machine) => {
          rows.push({
            "Company Name":    log.vendorInfo?.companyName || "",
            "Vendor Name":     log.vendorInfo?.name || "",
            "Vendor Contact":  log.vendorInfo?.phone || "",
            "Customer Name":   log.customerInfo?.name || "",
            "Customer Contact":log.customerInfo?.phone || "",
            "Machine Name":    machine.machineName,
            "Model Number":    machine.modelNumber || "",
            "Category":        machine.category || "",
            "Division":        machine.division || "",
            "Action":          log.action === "purchased" ? "Purchased" : log.action === "sold" ? "Sold" : "Dis-Installed",
            "Quantity":        machine.quantity,
            "Serial Numbers":  (machine.serialNumbers || []).join(", "),
            "Part Codes":      (machine.partCodes || []).join(", "),
            [isPurchased ? "Purchase Date" : log.action === "dis-installed" ? "Dis-Installation Date" : "Sale Date"]: created.date,
            [isPurchased ? "Purchase Time" : log.action === "dis-installed" ? "Dis-Installation Time" : "Sale Time"]: created.time,
          });
      });
    });

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Inventory Logs");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=inventory_logs.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getById, exportInventoryLogs };
