const mongoose = require("mongoose");
const xlsx = require("xlsx");
const PurchasedMachine = require("./admin.purchasedMachine.model");
const Machine = require("../inventoryManagement/admin.machine.model");
const Vendor = require("../vendorManagement/admin.vendor.model");
const MachineCategory = require("../machineCategoryManagement/admin.machineCategory.model");
const MachineDivision = require("../machineDivisionManagement/admin.machineDivision.model");
const InventoryLog = require("../inventoryLogs/admin.inventoryLog.model");
const GstConfig = require("../gstConfig/admin.gstConfig.model");
const { validateCreatePurchase } = require("./admin.purchasedMachine.validator");

const PRODUCT_CATEGORY_ID = process.env.PRODUCT_CATEGORY_ID;

const resolveStockStatus = (currentStock, lowStockThreshold) => {
  if (currentStock === 0) return "Out of Stock";
  if (lowStockThreshold === -1) return "In Stock";
  return lowStockThreshold < currentStock ? "In Stock" : "Low Stock";
};

const buildMachineFilter = (category, division, machineId) => {
  const f = {};
  if (category)  f.categoryId = category;
  if (division)  f.divisionId = division;
  if (machineId) f.machineId  = machineId;
  return Object.keys(f).length > 0 ? { $elemMatch: f } : null;
};

const getAll = async (req, res) => {
  try {
    const { search, vendorId, category, division, machineId, inventoryStatus, fromDate, toDate, page = 1, limit = 10 } = req.query;
    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { "machines.machineName":  { $regex: escaped, $options: "i" } },
          { "machines.modelNumber":  { $regex: escaped, $options: "i" } },
          { "machines.partCode":     { $regex: escaped, $options: "i" } },
          { "machines.serialNumbers.serialNumber": { $regex: escaped, $options: "i" } },
          { "vendorInfo.name":       { $regex: escaped, $options: "i" } },
          { "vendorInfo.companyName":{ $regex: escaped, $options: "i" } },
          { "vendorInfo.phone":      { $regex: escaped, $options: "i" } },
        ];
      }
    }

    if (vendorId) {
      if (!mongoose.isValidObjectId(vendorId))
        return res.status(400).json({ success: false, message: "Invalid vendorId format" });
      query["vendorInfo.vendorId"] = vendorId;
    }

    const machineFilter = buildMachineFilter(category, division, machineId);
    if (inventoryStatus === "available" || inventoryStatus === "sold") {
      // For serial number machines: check serialNumbers[].status
      const serialFilter = { serialNumbers: { $elemMatch: { status: inventoryStatus } } };
      // For parts machines: check availableParts > 0 (available) or soldParts > 0 (sold)
      const partsFilter = inventoryStatus === "available"
        ? { availableParts: { $gt: 0 } }
        : { soldParts: { $gt: 0 } };

      if (machineFilter) {
        query.machines = { $elemMatch: { ...machineFilter.$elemMatch, $or: [ serialFilter, partsFilter ] } };
      } else {
        query.machines = { $elemMatch: { $or: [ serialFilter, partsFilter ] } };
      }
    } else if (machineFilter) {
      query.machines = machineFilter;
    }

    if (fromDate || toDate) {
      const parseIST = (ddmmyy, endOfDay = false) => {
        const [dd, mm, yy] = ddmmyy.split("/");
        const base = Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
        return new Date(base - 5.5 * 60 * 60 * 1000);
      };
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = parseIST(fromDate, false);
      if (toDate)   query.createdAt.$lte = parseIST(toDate, true);
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [purchases, total] = await Promise.all([
      PurchasedMachine.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      PurchasedMachine.countDocuments(query),
    ]);

    const allPurchases      = await PurchasedMachine.find(query).lean();
    const totalPurchased     = allPurchases.reduce((s, p) => s + p.grandTotalBase, 0);
    const totalMachines      = allPurchases.reduce((s, p) => s + p.machines.reduce((ms, m) => ms + m.quantity, 0), 0);
    const avgValue           = allPurchases.length > 0 ? Math.round(totalPurchased / allPurchases.length) : 0;

    let totalAvailable = 0;
    let totalSold = 0;
    for (const p of allPurchases) {
      for (const m of p.machines) {
        // For product machines: serialNumbers array has items
        if (m.serialNumbers && m.serialNumbers.length > 0) {
          for (const sn of m.serialNumbers) {
            if (sn.status === "available") totalAvailable++;
            else if (sn.status === "sold") totalSold++;
          }
        } else {
          // For parts machines: use availableParts and soldParts numeric fields
          totalAvailable += m.availableParts || 0;
          totalSold += m.soldParts || 0;
        }
      }
    }

    res.status(200).json({
      success: true,
      data: purchases.map((p) => ({ ...p.toObject(), machinesCount: p.machines.length })),
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
      stats: {
        totalPurchased:        Math.round(totalPurchased * 100) / 100,
        totalMachinesPurchased: totalMachines,
        totalAvailable,
        totalSold,
        avgPurchaseValue:      avgValue,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid purchase ID" });

    const purchase = await PurchasedMachine.findById(id);
    if (!purchase)
      return res.status(404).json({ success: false, message: "Purchase not found" });

    res.status(200).json({ success: true, data: { ...purchase.toObject(), machinesCount: purchase.machines.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createPurchase = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const abort = async (status, message) => {
      await session.abortTransaction();
      session.endSession();
      return res.status(status).json({ success: false, message });
    };

    const validationError = validateCreatePurchase(req.body);
    if (validationError) return abort(400, validationError);

    const { vendorId, machines } = req.body;

    const vendor = await Vendor.findById(vendorId).session(session);
    if (!vendor)                       return abort(404, "Vendor not found");
    if (vendor.status === "Inactive")  return abort(400, "Vendor is inactive");

    const vendorInfo = {
      vendorId:    vendor._id,
      name:        vendor.name,
      phone:       vendor.phone,
      email:       vendor.email,
      companyName: vendor.companyName,
      gstNumber:   vendor.gstNumber || "",
    };

    // ── Fetch GST config ──
    const gstConfig = await GstConfig.findOne().lean();
    const totalGst = gstConfig ? (gstConfig.cgst || 0) + (gstConfig.sgst || 0) + (gstConfig.igst || 0) : 0;
    const gstDivisor = 1 + totalGst / 100;

    // ── Collect all serial numbers for bulk duplicate check ──
    const allSerialNumbers = machines.flatMap((m) => m.serialNumbers || []).map((s) => s.trim());

    if (allSerialNumbers.length > 0) {
      const unique = new Set(allSerialNumbers.map((s) => s.toUpperCase()));
      if (unique.size !== allSerialNumbers.length)
        return abort(400, "Duplicate serial numbers in submitted list");
      const existing = await PurchasedMachine.findOne({ "machines.serialNumbers.serialNumber": { $in: allSerialNumbers } }).session(session);
      if (existing)
        return abort(400, `One or more serial numbers already exist in a purchase record`);
    }

    // ── Build machine entries ──
    const machineEntries = [];
    let grandTotalWithGst = 0;
    let grandTotalBase    = 0;

    for (const m of machines) {
      const machine = await Machine.findById(m.machineId)
        .populate("category", "name")
        .populate("division", "name")
        .session(session);
      if (!machine)                       return abort(404, `Machine "${m.machineId}" not found`);
      if (machine.status === "Inactive")  return abort(400, `Machine "${machine.name}" is inactive`);

      const isParts    = machine.category?._id?.toString() !== PRODUCT_CATEGORY_ID;
      const buyBase          = Math.round((m.buyingPriceWithGst / gstDivisor) * 100) / 100;
      const gstPerUnit       = Math.round((m.buyingPriceWithGst - buyBase) * 100) / 100;
      const buyingTotalWithGst = Math.round(m.buyingPriceWithGst * m.quantity * 100) / 100;
      const buyingTotalBase    = Math.round(buyBase * m.quantity);
      const gstTotalForMachine = Math.round((buyingTotalWithGst - buyingTotalBase) * 100) / 100;
      
      grandTotalWithGst        = Math.round((grandTotalWithGst + buyingTotalWithGst) * 100) / 100;
      grandTotalBase           = Math.round(grandTotalBase + buyingTotalBase);

      const machineEntry = {
        machineId:           machine._id,
        machineName:         machine.name,
        modelNumber:         machine.modelNumber || "",
        partCode:            machine.partCode || "",
        categoryId:          machine.category?._id || null,
        category:            machine.category?.name || "",
        divisionId:          machine.division?._id || null,
        division:            machine.division?.name || "",
        quantity:            m.quantity,
        buyingPriceWithGst:  m.buyingPriceWithGst,
        buyingPriceBase:     buyBase,
        gstAmountPerUnit:    gstPerUnit,
        buyingTotalWithGst,
        buyingTotalBase,
        gstAmountTotal:      gstTotalForMachine,
      };

      if (isParts) {
        machineEntry.availableParts = m.quantity;
        machineEntry.soldParts = 0;
      } else {
        machineEntry.serialNumbers = (m.serialNumbers || []).map((s) => ({ serialNumber: s.trim(), status: "available" }));
      }

      machineEntries.push(machineEntry);
    }

    const grandTotalGstAmount = Math.round((grandTotalWithGst - grandTotalBase) * 100) / 100;
    const gstConfigData = {
      cgst: gstConfig?.cgst || 0,
      sgst: gstConfig?.sgst || 0,
      igst: gstConfig?.igst || 0,
      totalGst: totalGst,
    };

    const [purchase] = await PurchasedMachine.create([{ 
      vendorInfo, 
      gstConfig: gstConfigData,
      machines: machineEntries, 
      grandTotalWithGst, 
      grandTotalBase,
      grandTotalGstAmount,
    }], { session });

    // ── Update machine stock ──
    for (const e of machineEntries) {
      const machine = await Machine.findById(e.machineId).session(session);
      const newStock = machine.currentStock + e.quantity;
      await Machine.findByIdAndUpdate(
        e.machineId,
        { currentStock: newStock, stockStatus: resolveStockStatus(newStock, machine.lowStockThreshold) },
        { session }
      );
    }

    // ── Create inventory log ──
    await InventoryLog.create(
      [{
        action: "purchased",
        vendorInfo,
        machines: machineEntries.map((e) => ({
          machineId:     e.machineId,
          machineName:   e.machineName,
          modelNumber:   e.modelNumber,
          partCode:      e.partCode,
          categoryId:    e.categoryId,
          category:      e.category,
          divisionId:    e.divisionId,
          division:      e.division,
          quantity:      e.quantity,
          serialNumbers: (e.serialNumbers || []).map(s => s.serialNumber),
        })),
      }],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ success: true, data: purchase });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: err.message });
  }
};

const verifySerialNumbers = async (req, res) => {
  try {
    const { serialNumbers } = req.body;
    if (!Array.isArray(serialNumbers) || serialNumbers.length === 0)
      return res.status(400).json({ success: false, message: "serialNumbers must be a non-empty array" });

    const trimmed = serialNumbers.map((s) => s.trim()).filter(Boolean);
    const unique  = new Set(trimmed.map((s) => s.toUpperCase()));
    if (unique.size !== trimmed.length)
      return res.status(400).json({ success: false, message: "Duplicate serial numbers in submitted list" });

    const existing = await PurchasedMachine.find(
      { "machines.serialNumbers.serialNumber": { $in: trimmed } },
      { "machines.serialNumbers": 1 }
    );
    const foundCodes = existing.flatMap((p) => p.machines.flatMap((m) => (m.serialNumbers || []).map(e => e.serialNumber))).map((s) => s.toUpperCase());
    const duplicates = trimmed.filter((s) => foundCodes.includes(s.toUpperCase()));

    if (duplicates.length > 0)
      return res.status(200).json({ success: true, available: false, duplicates });

    return res.status(200).json({ success: true, available: true, duplicates: [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const verifyPartCodes = async (req, res) => {
  try {
    const { partCodes } = req.body;
    if (!Array.isArray(partCodes) || partCodes.length === 0)
      return res.status(400).json({ success: false, message: "partCodes must be a non-empty array" });

    const trimmed = partCodes.map((c) => c.trim()).filter(Boolean);
    const unique  = new Set(trimmed.map((c) => c.toUpperCase()));
    if (unique.size !== trimmed.length)
      return res.status(400).json({ success: false, message: "Duplicate part codes in submitted list" });

    const existing = await PurchasedMachine.find(
      { "machines.partCodes.partCode": { $in: trimmed } },
      { "machines.partCodes": 1 }
    );
    const foundCodes = existing.flatMap((p) => p.machines.flatMap((m) => (m.partCodes || []).map(e => e.partCode))).map((c) => c.toUpperCase());
    const duplicates = trimmed.filter((c) => foundCodes.includes(c.toUpperCase()));

    if (duplicates.length > 0)
      return res.status(200).json({ success: true, available: false, duplicates });

    return res.status(200).json({ success: true, available: true, duplicates: [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const exportToExcel = async (req, res) => {
  try {
    const { search, vendorId, category, division, machineId, inventoryStatus, fromDate, toDate } = req.query;
    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { "machines.machineName":  { $regex: escaped, $options: "i" } },
          { "machines.modelNumber":  { $regex: escaped, $options: "i" } },
          { "vendorInfo.name":       { $regex: escaped, $options: "i" } },
          { "vendorInfo.companyName":{ $regex: escaped, $options: "i" } },
        ];
      }
    }

    if (vendorId && mongoose.isValidObjectId(vendorId)) query["vendorInfo.vendorId"] = vendorId;

    const machineFilter = buildMachineFilter(category, division, machineId);
    if (inventoryStatus === "available" || inventoryStatus === "sold") {
      if (machineFilter) {
        query.machines = { $elemMatch: { ...machineFilter.$elemMatch, $or: [ { serialNumbers: { $elemMatch: { status: inventoryStatus } } }, { partCodes: { $elemMatch: { status: inventoryStatus } } } ] } };
      } else {
        query.machines = { $elemMatch: { $or: [ { serialNumbers: { $elemMatch: { status: inventoryStatus } } }, { partCodes: { $elemMatch: { status: inventoryStatus } } } ] } };
      }
    } else if (machineFilter) {
      query.machines = machineFilter;
    }

    if (fromDate || toDate) {
      const parseIST = (ddmmyy, endOfDay = false) => {
        const [dd, mm, yy] = ddmmyy.split("/");
        const base = Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
        return new Date(base - 5.5 * 60 * 60 * 1000);
      };
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = parseIST(fromDate, false);
      if (toDate)   query.createdAt.$lte = parseIST(toDate, true);
    }

    const purchases = await PurchasedMachine.find(query).sort({ createdAt: -1 }).lean();

    const COLS = ["Vendor Company", "Vendor Name", "Vendor Phone", "Machine Name", "Model Number", "Part Code", "Category", "Division", "Quantity", "Buying Price (Base)", "Buying Price (With GST)", "Buying Total (Base)", "Buying Total (With GST)", "Available Parts", "Sold Parts", "Purchase Date", "Purchase Time"];

    const rows = [];
    const merges = [];

    purchases.forEach((p) => {
      const date = new Date(p.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
      const time = new Date(p.createdAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

      const purchaseStartRow = rows.length;

      p.machines.forEach((m) => {
        const isParts  = !!(m.availableParts || m.availableParts === 0);
        const machineStartRow = rows.length;
        const isMachineFirst = true;
        const isPurchaseFirst = machineStartRow === purchaseStartRow;
        
        rows.push({
          "Vendor Company":           isPurchaseFirst ? p.vendorInfo.companyName || "" : "",
          "Vendor Name":              isPurchaseFirst ? p.vendorInfo.name        || "" : "",
          "Vendor Phone":             isPurchaseFirst ? p.vendorInfo.phone       || "" : "",
          "Machine Name":             m.machineName || "",
          "Model Number":             m.modelNumber || "",
          "Part Code":                m.partCode    || "",
          "Category":                 m.category    || "",
          "Division":                 m.division    || "",
          "Quantity":                 m.quantity,
          "Buying Price (Base)":      m.buyingPriceBase,
          "Buying Price (With GST)":  m.buyingPriceWithGst,
          "Buying Total (Base)":      m.buyingTotalBase,
          "Buying Total (With GST)":  m.buyingTotalWithGst,
          "Available Parts":          isParts ? (m.availableParts || 0) : "",
          "Sold Parts":               isParts ? (m.soldParts || 0) : "",
          "Purchase Date":            isPurchaseFirst ? date : "",
          "Purchase Time":            isPurchaseFirst ? time : "",
        });

        const sheetMachineStart = machineStartRow + 1;
        const sheetMachineEnd   = rows.length;
        if (sheetMachineStart < sheetMachineEnd) {
          ["Machine Name", "Model Number", "Part Code", "Category", "Division", "Quantity", "Buying Price (Base)", "Buying Price (With GST)", "Buying Total (Base)", "Buying Total (With GST)", "Available Parts", "Sold Parts"].forEach((col) => {
            const c = COLS.indexOf(col);
            merges.push({ s: { r: sheetMachineStart, c }, e: { r: sheetMachineEnd, c } });
          });
        }
      });

      const sheetPurchaseStart = purchaseStartRow + 1;
      const sheetPurchaseEnd   = rows.length;
      if (sheetPurchaseStart < sheetPurchaseEnd) {
        ["Vendor Company", "Vendor Name", "Vendor Phone", "Purchase Date", "Purchase Time"].forEach((col) => {
          const c = COLS.indexOf(col);
          merges.push({ s: { r: sheetPurchaseStart, c }, e: { r: sheetPurchaseEnd, c } });
        });
      }
    });

    const ws = xlsx.utils.json_to_sheet(rows, { header: COLS });
    if (merges.length) ws["!merges"] = merges;
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Purchases");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=purchases_export.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getById, createPurchase, verifySerialNumbers, exportToExcel };
