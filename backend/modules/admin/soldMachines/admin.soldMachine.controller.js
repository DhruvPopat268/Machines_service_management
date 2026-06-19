const mongoose = require("mongoose");
const xlsx = require("xlsx");
const path = require("path");
const fs   = require("fs/promises");
const SoldMachine      = require("./admin.soldMachine.model");
const PurchasedMachine = require("../purchasedMachines/admin.purchasedMachine.model");
const Machine          = require("../inventoryManagement/admin.machine.model");
const Customer         = require("../customerManagement/admin.customer.model");
const ContractType     = require("../contractTypesManagement/admin.contractType.model");
const PagesCategory    = require("../pagesCategoryManagement/admin.pagesCategory.model");
const InventoryLog     = require("../inventoryLogs/admin.inventoryLog.model");
const Company          = require("../companyManagement/admin.company.model");
const Zone             = require("../zoneManagement/admin.zone.model");
const Counter          = require("../auth/counter.model");
const { validateCreateSale } = require("./admin.soldMachine.validator");
const { sendContractExpiryAlert } = require("../../../utils/emailService");

const PARTS_CATEGORY_ID    = process.env.PARTS_CATEGORY_ID;
const TSS_CONTRACT_TYPE_ID = process.env.TSS_CONTRACT_TYPE_ID;

const buildMachineFilter = (category, division, machineId) => {
  const f = {};
  if (category)  f.categoryId = category;
  if (division)  f.divisionId = division;
  if (machineId) f.machineId  = machineId;
  return Object.keys(f).length > 0 ? { $elemMatch: f } : null;
};

const getAvailableCodes = async (req, res) => {
  try {
    const { machineId } = req.query;

    if (!mongoose.isValidObjectId(machineId))
      return res.status(400).json({ success: false, message: "Invalid machineId" });

    const machine = await Machine.findById(machineId).populate("category", "_id").lean();
    if (!machine)
      return res.status(404).json({ success: false, message: "Machine not found" });

    const isParts = machine.category?._id?.toString() === PARTS_CATEGORY_ID;

    const allRecords = await PurchasedMachine.find(
      { "machines.machineId": new mongoose.Types.ObjectId(machineId) },
      { "machines": 1 }
    ).lean();

    const matchingMachines = allRecords.flatMap(r =>
      r.machines.filter(m => m.machineId?.toString() === machineId)
    );

    if (isParts) {
      const partCodes = matchingMachines
        .flatMap(m => m.partCodes || [])
        .filter(p => p.status === "available")
        .map(p => p.partCode);

      return res.status(200).json({ success: true, type: "partCodes", data: partCodes });
    } else {
      const serialNumbers = matchingMachines
        .flatMap(m => m.serialNumbers || [])
        .filter(s => s.status === "available")
        .map(s => s.serialNumber);

      return res.status(200).json({ success: true, type: "serialNumbers", data: serialNumbers });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getAll = async (req, res) => {
  try {
    const { search, customerId, zoneId, category, division, machineId, fromDate, toDate, page = 1, limit = 10 } = req.query;
    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { "machines.machineName": { $regex: escaped, $options: "i" } },
          { "machines.modelNumber": { $regex: escaped, $options: "i" } },
          { "customerInfo.name":    { $regex: escaped, $options: "i" } },
          { "customerInfo.phone":   { $regex: escaped, $options: "i" } },
        ];
      }
    }

    if (customerId) {
      if (!mongoose.isValidObjectId(customerId))
        return res.status(400).json({ success: false, message: "Invalid customerId format" });
      query["customerInfo.customerId"] = customerId;
    }

    if (zoneId) {
      if (!mongoose.isValidObjectId(zoneId))
        return res.status(400).json({ success: false, message: "Invalid zoneId format" });
      const zone = await Zone.findById(zoneId, { name: 1 }).lean();
      if (!zone) return res.status(404).json({ success: false, message: "Zone not found" });
      query["customerInfo.zone"] = zone.name;
    }

    const machineFilter = buildMachineFilter(category, division, machineId);
    if (machineFilter) query.machines = machineFilter;

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

    const [sales, total] = await Promise.all([
      SoldMachine.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      SoldMachine.countDocuments(query),
    ]);

    const allSales    = await SoldMachine.find(query).lean();
    const totalSales  = allSales.reduce((s, sale) => s + sale.grandTotal, 0);
    const totalMachines = allSales.reduce((s, sale) => s + sale.machines.length, 0);
    const avgValue    = allSales.length > 0 ? Math.round((totalSales / allSales.length) * 100) / 100 : 0;

    res.status(200).json({
      success: true,
      data: sales.map((s) => ({ ...s.toObject(), machinesCount: s.machines.length })),
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
      stats: {
        totalSales:        Math.round(totalSales * 100) / 100,
        totalMachinesSold: totalMachines,
        avgSaleValue:      avgValue,
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
      return res.status(400).json({ success: false, message: "Invalid sale ID" });

    const sale = await SoldMachine.findById(id);
    if (!sale)
      return res.status(404).json({ success: false, message: "Sale not found" });

    res.status(200).json({ success: true, data: { ...sale.toObject(), machinesCount: sale.machines.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createSale = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const abort = async (status, message) => {
      await session.abortTransaction();
      session.endSession();
      return res.status(status).json({ success: false, message });
    };

    const validationError = validateCreateSale(req.body);
    if (validationError) return abort(400, validationError);

    const { customerId, machines } = req.body;

    const customer = await Customer.findById(customerId).populate("zone", "name").session(session);
    if (!customer)                      return abort(404, "Customer not found");
    if (customer.status === "Inactive") return abort(400, "Customer is inactive");

    const customerInfo = {
      customerId:       customer._id,
      customerUniqueId: customer.customerId || "",
      name:             customer.name,
      phone:      customer.phone,
      email:      customer.email,
      address:    customer.userLocation?.address || "",
      zone:       customer.zone?.name || "",
      gstNumber:  customer.gstNumber || "",
    };

    // ── Collect all serial numbers and part codes for bulk verification ──
    const allSerialNumbers = machines.flatMap((m) => (m.serialNumbers || []).map(e => e.serialNumber.trim()));
    const allPartCodes     = machines.flatMap((m) => m.partCodes || []).map((c) => c.trim());

    // Check serial numbers: must exist in purchase as available, must not already be sold
    if (allSerialNumbers.length > 0) {
      const uniqueSet = new Set(allSerialNumbers.map((s) => s.toUpperCase()));
      if (uniqueSet.size !== allSerialNumbers.length)
        return abort(400, "Duplicate serial numbers in submitted list");

      const purchaseDocs = await PurchasedMachine.find(
        { "machines.serialNumbers.serialNumber": { $in: allSerialNumbers } },
        { "machines.serialNumbers": 1 }
      ).session(session);

      const foundEntries = purchaseDocs.flatMap(p => p.machines.flatMap(m => m.serialNumbers || []));
      const notInPurchase = allSerialNumbers.filter(sn => !foundEntries.some(e => e.serialNumber.toUpperCase() === sn.toUpperCase()));
      if (notInPurchase.length > 0)
        return abort(400, `Serial numbers not found in any purchase: ${notInPurchase.join(", ")}`);

      const alreadySold = allSerialNumbers.filter(sn => foundEntries.some(e => e.serialNumber.toUpperCase() === sn.toUpperCase() && e.status === "sold"));
      if (alreadySold.length > 0)
        return abort(400, `Serial numbers already sold: ${alreadySold.join(", ")}`);
    }

    // Check part codes: must exist in purchase as available, must not already be sold
    if (allPartCodes.length > 0) {
      const uniqueSet = new Set(allPartCodes.map((c) => c.toUpperCase()));
      if (uniqueSet.size !== allPartCodes.length)
        return abort(400, "Duplicate part codes in submitted list");

      const purchaseDocs = await PurchasedMachine.find(
        { "machines.partCodes.partCode": { $in: allPartCodes } },
        { "machines.partCodes": 1 }
      ).session(session);

      const foundEntries = purchaseDocs.flatMap(p => p.machines.flatMap(m => m.partCodes || []));
      const notInPurchase = allPartCodes.filter(pc => !foundEntries.some(e => e.partCode.toUpperCase() === pc.toUpperCase()));
      if (notInPurchase.length > 0)
        return abort(400, `Part codes not found in any purchase: ${notInPurchase.join(", ")}`);

      const alreadySold = allPartCodes.filter(pc => foundEntries.some(e => e.partCode.toUpperCase() === pc.toUpperCase() && e.status === "sold"));
      if (alreadySold.length > 0)
        return abort(400, `Part codes already sold: ${alreadySold.join(", ")}`);
    }

    // ── Build machine entries ──
    const machineEntries = [];
    let grandTotal = 0;

    for (const m of machines) {
      const machine = await Machine.findById(m.machineId)
        .populate("category", "name")
        .populate("division", "name")
        .session(session);
      if (!machine)                       return abort(404, `Machine "${m.machineId}" not found`);
      if (machine.status === "Inactive")  return abort(400, `Machine "${machine.name}" is inactive`);

      const isParts = machine.category?._id?.toString() === PARTS_CATEGORY_ID;

      const effectivePrice = m.discountedSellingPrice != null ? m.discountedSellingPrice : m.sellingPrice;
      const sellingTotal   = Math.round(effectivePrice * m.quantity * 100) / 100;
      grandTotal           = Math.round((grandTotal + sellingTotal) * 100) / 100;

      const entryData = {
        machineId:              machine._id,
        machineName:            machine.name,
        modelNumber:            machine.modelNumber || "",
        hsnCode:                machine.hsnCode || "",
        categoryId:             machine.category?._id || null,
        category:               machine.category?.name || "",
        divisionId:             machine.division?._id || null,
        division:               machine.division?.name || "",
        quantity:               m.quantity,
        sellingPrice:           m.sellingPrice,
        discountedSellingPrice: m.discountedSellingPrice ?? null,
        sellingTotal,
      };

      if (isParts) {
        entryData.partCodes = (m.partCodes || []).map(c => ({ partCode: c.trim(), contractType: null }));
      } else {
        entryData.serialNumbers = await Promise.all((m.serialNumbers || []).map(async (sEntry) => {
          const ct = await ContractType.findById(sEntry.contractTypeId).session(session);
          if (!ct) throw new Error(`Contract type "${sEntry.contractTypeId}" not found`);
          if (ct.status === "Inactive") throw new Error(`Contract type "${ct.name}" is inactive`);
          const validFrom = new Date(sEntry.validFrom);
          const validTo   = new Date(sEntry.validTo);
          if (isNaN(validFrom.getTime())) throw new Error(`Invalid validFrom for serial ${sEntry.serialNumber}`);
          if (isNaN(validTo.getTime()))   throw new Error(`Invalid validTo for serial ${sEntry.serialNumber}`);
          if (validTo <= validFrom)       throw new Error(`validTo must be after validFrom for serial ${sEntry.serialNumber}`);

          let pagesCategories = [];
          if (TSS_CONTRACT_TYPE_ID && ct._id.toString() === TSS_CONTRACT_TYPE_ID) {
            pagesCategories = await Promise.all((sEntry.pagesCategories || []).map(async (pc) => {
              const cat = await PagesCategory.findById(pc.pagesCategoryId).session(session);
              if (!cat) throw new Error(`Pages category "${pc.pagesCategoryId}" not found`);
              if (cat.status === "Inactive") throw new Error(`Pages category "${cat.name}" is inactive`);
              return {
                pagesCategoryId: cat._id,
                pagesCategory:   cat.name,
                costPerPage:     Number(pc.costPerPage),
              };
            }));
          }

          return {
            serialNumber: sEntry.serialNumber.trim(),
            minCopies:    Number(sEntry.minCopies) || 0,
            contractType: {
              contractTypeId: ct._id,
              name:           ct.name,
              code:           ct.code,
              freeService:    ct.freeService,
              freeParts:      ct.freeParts,
              validFrom,
              validTo,
            },
            pagesCategories,
          };
        }));
      }

      machineEntries.push(entryData);
    }

    const [sale] = await SoldMachine.create([{ customerInfo, machines: machineEntries, grandTotal }], { session });

    // ── Deduct currentStock from Machine ──
    for (const e of machineEntries) {
      const machine = await Machine.findById(e.machineId).session(session);
      const newStock = Math.max(0, machine.currentStock - e.quantity);
      const stockStatus = newStock === 0 ? "Out of Stock" : machine.lowStockThreshold === -1 ? "In Stock" : newStock <= machine.lowStockThreshold ? "Low Stock" : "In Stock";
      await Machine.updateOne({ _id: e.machineId }, { $set: { currentStock: newStock, stockStatus } }, { session });
    }

    // ── Mark serial numbers and part codes as sold in PurchasedMachine ──
    for (const sn of allSerialNumbers) {
      await PurchasedMachine.updateOne(
        { "machines.serialNumbers.serialNumber": sn },
        { $set: { "machines.$[outer].serialNumbers.$[inner].status": "sold" } },
        { arrayFilters: [{ "outer.serialNumbers.serialNumber": sn }, { "inner.serialNumber": sn }], session }
      );
    }
    for (const pc of allPartCodes) {
      await PurchasedMachine.updateOne(
        { "machines.partCodes.partCode": pc },
        { $set: { "machines.$[outer].partCodes.$[inner].status": "sold" } },
        { arrayFilters: [{ "outer.partCodes.partCode": pc }, { "inner.partCode": pc }], session }
      );
    }

    // ── Inventory log ──
    await InventoryLog.create(
      [{
        action: "sold",
        customerInfo,
        machines: machineEntries.map((e) => ({
          machineId:     e.machineId,
          machineName:   e.machineName,
          modelNumber:   e.modelNumber,
          categoryId:    e.categoryId,
          category:      e.category,
          divisionId:    e.divisionId,
          division:      e.division,
          quantity:      e.quantity,
          serialNumbers: (e.serialNumbers || []).map(s => s.serialNumber),
          partCodes:     (e.partCodes || []).map(p => p.partCode),
        })),
      }],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ success: true, data: sale });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: err.message });
  }
};

const renewContract = async (req, res) => {
  try {
    const { serialNumber, newContractTypeId, newValidFrom, newValidTo } = req.body;

    if (!serialNumber?.trim())
      return res.status(400).json({ success: false, message: "serialNumber is required" });
    if (!mongoose.isValidObjectId(newContractTypeId))
      return res.status(400).json({ success: false, message: "Invalid newContractTypeId" });

    const validFrom = new Date(newValidFrom);
    const validTo   = new Date(newValidTo);
    if (isNaN(validFrom.getTime())) return res.status(400).json({ success: false, message: "Invalid newValidFrom" });
    if (isNaN(validTo.getTime()))   return res.status(400).json({ success: false, message: "Invalid newValidTo" });
    if (validTo <= validFrom)       return res.status(400).json({ success: false, message: "newValidTo must be after newValidFrom" });

    const ct = await ContractType.findOne({ _id: newContractTypeId, status: "Active" });
    if (!ct) return res.status(404).json({ success: false, message: "Active contract type not found" });

    const sn = serialNumber.trim();
    const result = await SoldMachine.updateOne(
      { "machines.serialNumbers.serialNumber": sn },
      {
        $set: {
          "machines.$[outer].serialNumbers.$[inner].contractType": {
            contractTypeId: ct._id,
            name:           ct.name,
            code:           ct.code,
            freeService:    ct.freeService,
            freeParts:      ct.freeParts,
            validFrom,
            validTo,
          },
        },
      },
      { arrayFilters: [{ "outer.serialNumbers.serialNumber": sn }, { "inner.serialNumber": sn }] }
    );

    if (result.matchedCount === 0)
      return res.status(404).json({ success: false, message: "Serial number not found in any sale" });

    res.status(200).json({ success: true, message: "Contract renewed successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const exportToExcel = async (req, res) => {
  try {
    const { search, customerId, zoneId, category, division, machineId, fromDate, toDate } = req.query;
    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { "machines.machineName": { $regex: escaped, $options: "i" } },
          { "customerInfo.name":    { $regex: escaped, $options: "i" } },
        ];
      }
    }

    if (customerId && mongoose.isValidObjectId(customerId))
      query["customerInfo.customerId"] = customerId;

    if (zoneId && mongoose.isValidObjectId(zoneId)) {
      const zone = await Zone.findById(zoneId, { name: 1 }).lean();
      if (zone) query["customerInfo.zone"] = zone.name;
    }

    const machineFilter = buildMachineFilter(category, division, machineId);
    if (machineFilter) query.machines = machineFilter;

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

    const sales = await SoldMachine.find(query).sort({ createdAt: -1 }).lean();

    const COLS = ["Customer Name", "Customer Phone", "Machine Name", "Model Number", "Category", "Division", "Quantity", "Selling Price", "Discounted Selling Price", "Selling Total", "Serial / Part Code", "Contract Type", "Contract Code", "Free Service", "Free Parts", "Valid From", "Valid To", "Sale Date", "Sale Time"];

    const rows = [];
    const merges = [];

    sales.forEach((sale) => {
      const date = new Date(sale.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
      const time = new Date(sale.createdAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

      const saleStartRow = rows.length;

      sale.machines.forEach((m) => {
        const isParts  = !!(m.partCodes && m.partCodes.length);
        const codes    = isParts ? (m.partCodes || []) : (m.serialNumbers || []);
        const machineStartRow = rows.length;

        const codeList = codes.length > 0 ? codes : [null];
        codeList.forEach((entry, ci) => {
          const code          = entry ? (isParts ? entry.partCode : entry.serialNumber) : "";
          const ct            = entry ? entry.contractType : null;
          const isMachineFirst = ci === 0;
          const isSaleFirst    = isMachineFirst && machineStartRow === saleStartRow;
          rows.push({
            "Customer Name":            isSaleFirst ? sale.customerInfo.name  || "" : "",
            "Customer Phone":           isSaleFirst ? sale.customerInfo.phone || "" : "",
            "Machine Name":             isMachineFirst ? m.machineName || "" : "",
            "Model Number":             isMachineFirst ? m.modelNumber || "" : "",
            "Category":                 isMachineFirst ? m.category    || "" : "",
            "Division":                 isMachineFirst ? m.division    || "" : "",
            "Quantity":                 isMachineFirst ? m.quantity           : "",
            "Selling Price":            isMachineFirst ? m.sellingPrice       : "",
            "Discounted Selling Price": isMachineFirst ? (m.discountedSellingPrice ?? "") : "",
            "Selling Total":            isMachineFirst ? m.sellingTotal       : "",
            "Serial / Part Code":       code,
            "Contract Type":            ct?.name || "",
            "Contract Code":            ct?.code || "",
            "Free Service":             ct ? (ct.freeService ? "Yes" : "No") : "",
            "Free Parts":               ct ? (ct.freeParts   ? "Yes" : "No") : "",
            "Valid From":               ct?.validFrom ? new Date(ct.validFrom).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "",
            "Valid To":                 ct?.validTo   ? new Date(ct.validTo).toLocaleDateString("en-IN",   { timeZone: "Asia/Kolkata" }) : "",
            "Sale Date":                isSaleFirst ? date : "",
            "Sale Time":                isSaleFirst ? time : "",
          });
        });
        const sheetMachineStart = machineStartRow + 1; // +1 for header row
        const sheetMachineEnd   = rows.length; // rows.length - 1 + 1 for header
        if (sheetMachineStart < sheetMachineEnd) {
          ["Machine Name", "Model Number", "Category", "Division", "Quantity", "Selling Price", "Discounted Selling Price", "Selling Total"].forEach((col) => {
            const c = COLS.indexOf(col);
            merges.push({ s: { r: sheetMachineStart, c }, e: { r: sheetMachineEnd, c } });
          });
        }
      });

      const saleEndRow = rows.length - 1;
      const sheetSaleStart = saleStartRow + 1;
      const sheetSaleEnd   = saleEndRow   + 1;
      if (sheetSaleStart < sheetSaleEnd) {
        ["Customer Name", "Customer Phone", "Sale Date", "Sale Time"].forEach((col) => {
          const c = COLS.indexOf(col);
          merges.push({ s: { r: sheetSaleStart, c }, e: { r: sheetSaleEnd, c } });
        });
      }
    });

    const ws = xlsx.utils.json_to_sheet(rows, { header: COLS });
    if (merges.length) ws["!merges"] = merges;
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Sales");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=sales_export.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
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

    const purchaseDocs = await PurchasedMachine.find(
      { "machines.serialNumbers.serialNumber": { $in: trimmed } },
      { "machines.serialNumbers": 1 }
    );
    const foundEntries = purchaseDocs.flatMap(p => p.machines.flatMap(m => m.serialNumbers || []));

    const notInPurchase = trimmed.filter(sn => !foundEntries.some(e => e.serialNumber.toUpperCase() === sn.toUpperCase()));
    if (notInPurchase.length > 0)
      return res.status(200).json({ success: true, available: false, reason: "not_in_purchase", codes: notInPurchase, message: `Not found in any purchase: ${notInPurchase.join(", ")}` });

    const alreadySold = trimmed.filter(sn => foundEntries.some(e => e.serialNumber.toUpperCase() === sn.toUpperCase() && e.status === "sold"));
    if (alreadySold.length > 0)
      return res.status(200).json({ success: true, available: false, reason: "already_sold", codes: alreadySold, message: `Already sold: ${alreadySold.join(", ")}` });

    return res.status(200).json({ success: true, available: true, codes: trimmed });
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

    const purchaseDocs = await PurchasedMachine.find(
      { "machines.partCodes.partCode": { $in: trimmed } },
      { "machines.partCodes": 1 }
    );
    const foundEntries = purchaseDocs.flatMap(p => p.machines.flatMap(m => m.partCodes || []));

    const notInPurchase = trimmed.filter(pc => !foundEntries.some(e => e.partCode.toUpperCase() === pc.toUpperCase()));
    if (notInPurchase.length > 0)
      return res.status(200).json({ success: true, available: false, reason: "not_in_purchase", codes: notInPurchase, message: `Not found in any purchase: ${notInPurchase.join(", ")}` });

    const alreadySold = trimmed.filter(pc => foundEntries.some(e => e.partCode.toUpperCase() === pc.toUpperCase() && e.status === "sold"));
    if (alreadySold.length > 0)
      return res.status(200).json({ success: true, available: false, reason: "already_sold", codes: alreadySold, message: `Already sold: ${alreadySold.join(", ")}` });

    return res.status(200).json({ success: true, available: true, codes: trimmed });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const DOCS_DIR = process.env.NODE_ENV === "production"
  ? "/app/cloud/Documents"
  : path.join(__dirname, "../../../cloud/Documents");

const generateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid sale ID" });

    const { companyId, cgst, sgst, igst } = req.body;

    if (!mongoose.isValidObjectId(companyId))
      return res.status(400).json({ success: false, message: "Invalid companyId" });
    if (cgst === undefined || isNaN(Number(cgst)) || Number(cgst) < 0)
      return res.status(400).json({ success: false, message: "cgst must be a non-negative number" });
    if (sgst === undefined || isNaN(Number(sgst)) || Number(sgst) < 0)
      return res.status(400).json({ success: false, message: "sgst must be a non-negative number" });
    if (igst === undefined || isNaN(Number(igst)) || Number(igst) < 0)
      return res.status(400).json({ success: false, message: "igst must be a non-negative number" });

    const sale = await SoldMachine.findById(id);
    if (!sale) return res.status(404).json({ success: false, message: "Sale not found" });

    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ success: false, message: "Company not found" });

    const counter = await Counter.findByIdAndUpdate(
      "salesInvoice",
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const invoiceNumber = `INV-${counter.seq}`;

    const companyInfo = {
      companyId:         company._id,
      name:              company.name,
      tagline:           company.tagline || "",
      address:           company.address,
      phone:             company.phone,
      email:             company.email,
      gstNumber:         company.gstNumber,
      bankAccountNumber: company.bankAccountNumber || "",
      bankName:          company.bankName || "",
      ifscCode:          company.ifscCode || "",
      bankBranch:        company.bankBranch || "",
      qrCode:            company.qrCode || "",
    };

    const cgstNum = Number(cgst);
    const sgstNum = Number(sgst);
    const igstNum = Number(igst);

    const invoiceLogoUrl  = process.env.INVOICE_LOGO_URL  || "";
    const invoiceLogoText = process.env.INVOICE_LOGO_TEXT || "";

    const templatePath = path.join(__dirname, "../../../invoicesExamples/sales-invoice.html");
    let html = await fs.readFile(templatePath, "utf-8");

    const formatNum = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const basicTotal       = sale.grandTotal;
    const cgstAmount       = parseFloat(((basicTotal * cgstNum) / 100).toFixed(2));
    const sgstAmount       = parseFloat(((basicTotal * sgstNum) / 100).toFixed(2));
    const igstAmount       = parseFloat(((basicTotal * igstNum) / 100).toFixed(2));
    const invoiceGrandTotal = parseFloat((basicTotal + cgstAmount + sgstAmount + igstAmount).toFixed(2));

    const d = new Date(sale.createdAt);
    const invoiceDate = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

    html = html
      .replace(/{{invoiceNumber}}/g, invoiceNumber)
      .replace(/{{invoiceDate}}/g, invoiceDate)
      .replace(/{{companyName}}/g, company.name)
      .replace(/{{companyTagline}}/g, company.tagline || "")
      .replace(/{{companyAddress}}/g, company.address)
      .replace(/{{companyPhone}}/g, company.phone)
      .replace(/{{companyEmail}}/g, company.email)
      .replace(/{{companyGst}}/g, company.gstNumber)
      .replace(/{{bankAccountNumber}}/g, company.bankAccountNumber || "")
      .replace(/{{bankName}}/g, company.bankName || "")
      .replace(/{{ifscCode}}/g, company.ifscCode || "")
      .replace(/{{bankBranch}}/g, company.bankBranch || "")
      .replace(/{{qrCode}}/g, company.qrCode || "")
      .replace(/{{invoiceLogoUrl}}/g, invoiceLogoUrl)
      .replace(/{{invoiceLogoText}}/g, invoiceLogoText)
      .replace(/{{customerName}}/g, sale.customerInfo.name)
      .replace(/{{customerAddress}}/g, sale.customerInfo.address || "")
      .replace(/{{customerUniqueId}}/g, sale.customerInfo.customerUniqueId || "")
      .replace(/{{customerZone}}/g, sale.customerInfo.zone || "")
      .replace(/{{customerGst}}/g, sale.customerInfo.gstNumber || "")
      .replace(/{{basicTotal}}/g, formatNum(basicTotal))
      .replace(/{{cgstPercent}}/g, cgstNum)
      .replace(/{{cgstAmount}}/g, formatNum(cgstAmount))
      .replace(/{{sgstPercent}}/g, sgstNum)
      .replace(/{{sgstAmount}}/g, formatNum(sgstAmount))
      .replace(/{{igstPercent}}/g, igstNum)
      .replace(/{{igstAmount}}/g, formatNum(igstAmount))
      .replace(/{{grandTotal}}/g, formatNum(invoiceGrandTotal));

    // Handle conditional blocks
    html = cgstNum > 0 ? html.replace(/{{#if cgst}}([\.\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if cgst}}[\.\s\S]*?{{\/if}}/g, "");
    html = sgstNum > 0 ? html.replace(/{{#if sgst}}([\.\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if sgst}}[\.\s\S]*?{{\/if}}/g, "");
    html = igstNum > 0 ? html.replace(/{{#if igst}}([\.\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if igst}}[\.\s\S]*?{{\/if}}/g, "");
    html = company.tagline
      ? html.replace(/{{#if companyTagline}}([\.\s\S]*?){{\/if}}/g, "$1")
      : html.replace(/{{#if companyTagline}}[\.\s\S]*?{{\/if}}/g, "");
    html = company.qrCode
      ? html.replace(/{{#if qrCode}}([\.\s\S]*?){{\/if}}/g, "$1")
      : html.replace(/{{#if qrCode}}[\.\s\S]*?{{\/if}}/g, "");
    html = invoiceLogoUrl
      ? html.replace(/{{#if invoiceLogoUrl}}([\.\s\S]*?){{\/if}}/g, "$1")
      : html.replace(/{{#if invoiceLogoUrl}}[\.\s\S]*?{{\/if}}/g, "");
    html = invoiceLogoText
      ? html.replace(/{{#if invoiceLogoText}}([\.\s\S]*?){{\/if}}/g, "$1")
      : html.replace(/{{#if invoiceLogoText}}[\.\s\S]*?{{\/if}}/g, "");

    // Build machine rows
    const machineRowsMatch = html.match(/{{#each machines}}([\.\s\S]*?){{\/each}}/);
    if (machineRowsMatch) {
      const rowTemplate = machineRowsMatch[1];
      const rows = sale.machines.map((m, idx) => {
        const rate    = m.discountedSellingPrice != null ? m.discountedSellingPrice : m.sellingPrice;
        const isParts = m.categoryId?.toString() === PARTS_CATEGORY_ID;
        const serials = isParts
          ? (m.partCodes || []).map(p => p.partCode)
          : (m.serialNumbers || []).map(s => s.serialNumber);
        const serialLabel = isParts ? "P/C" : "S/N";
        let row = rowTemplate
          .replace(/{{srNo}}/g, idx + 1)
          .replace(/{{machineName}}/g, m.machineName)
          .replace(/{{hsnCode}}/g, m.hsnCode || "")
          .replace(/{{serialLabel}}/g, serialLabel)
          .replace(/{{quantity}}/g, m.quantity)
          .replace(/{{rate}}/g, formatNum(rate))
          .replace(/{{amount}}/g, formatNum(m.sellingTotal));
        row = m.modelNumber
          ? row.replace(/{{#if modelNumber}}([\.\s\S]*?){{\/if}}/g, "$1").replace(/{{modelNumber}}/g, m.modelNumber)
          : row.replace(/{{#if modelNumber}}[\.\s\S]*?{{\/if}}/g, "");
        const serialsStr = serials.join(", ");
        row = serialsStr
          ? row.replace(/{{#if serials}}([\.\s\S]*?){{\/if}}/g, "$1").replace(/{{serials}}/g, serialsStr)
          : row.replace(/{{#if serials}}[\.\s\S]*?{{\/if}}/g, "");
        return row;
      }).join("");
      html = html.replace(/{{#each machines}}[\.\s\S]*?{{\/each}}/, rows);
    }

    const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
      import("puppeteer"),
      import("@sparticuz/chromium"),
    ]);
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || await chromium.executablePath();
    await fs.mkdir(DOCS_DIR, { recursive: true });
    const filename = `sales_invoice_${invoiceNumber}_${Date.now()}.pdf`;
    const filepath = path.join(DOCS_DIR, filename);

    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: filepath, format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
    await browser.close();

    const invoiceUrl = `${process.env.BACKEND_URL}/app/cloud/Documents/${filename}`;
    await SoldMachine.findByIdAndUpdate(id, {
      invoiceNumber, companyInfo, invoiceUrl,
      basicTotal,
      cgst: { percent: cgstNum, amount: cgstAmount },
      sgst: { percent: sgstNum, amount: sgstAmount },
      igst: { percent: igstNum, amount: igstAmount },
      invoiceGrandTotal,
    });

    return res.status(200).json({ success: true, invoiceUrl, invoiceNumber });
  } catch (err) {
    console.error("Error generating invoice:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getContractExpiryStatus = async (req, res) => {
  try {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // start of today, no time
    const days  = parseInt(process.env.CONTRACT_EXPIRY_SOON_DAYS) || 30;
    const inNDays = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);

    const sales = await SoldMachine.find({
      "machines.serialNumbers.contractType.validTo": { $lte: inNDays },
    }).lean();

    const customerMap = {};
    for (const sale of sales) {
      const { customerId, name, email, phone } = sale.customerInfo;
      const key = customerId?.toString() || email;
      if (!customerMap[key]) customerMap[key] = { customerId: customerId || null, name, email, phone, expired: [], expiringSoon: [] };

      for (const machine of sale.machines) {
        for (const sn of (machine.serialNumbers || [])) {
          const ct = sn.contractType;
          if (!ct?.validTo) continue;
          const validTo = new Date(ct.validTo);
          const item = {
            machineName:  machine.machineName,
            modelNumber:  machine.modelNumber,
            serialNumber: sn.serialNumber,
            contractType: ct.name,
            validFrom:    ct.validFrom,
            validTo:      ct.validTo,
          };
          if (validTo < today)       customerMap[key].expired.push(item);
          else if (validTo <= inNDays) customerMap[key].expiringSoon.push(item);
        }
      }
    }

    const customers = Object.values(customerMap).filter(c => c.expired.length || c.expiringSoon.length);
    return res.status(200).json({ success: true, data: customers });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const sendContractExpiryAlerts = async (req, res) => {
  try {
    const cronKey = req.headers["x-cron-key"];
    if (!cronKey || cronKey !== process.env.CRON_JOB_KEY)
      return res.status(403).json({ success: false, message: "Access denied" });

    const now      = new Date();
    const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // start of today, no time
    const days     = parseInt(process.env.CONTRACT_EXPIRY_SOON_DAYS) || 30;
    const in30Days = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);

    // Fetch all sales that have at least one serial number with a contract expiring or expired
    const sales = await SoldMachine.find({
      "machines.serialNumbers.contractType.validTo": { $lte: in30Days },
    }).lean();

    if (!sales.length)
      return res.status(200).json({ success: true, message: "No expiring contracts found" });

    // Group by customer email
    const customerMap = {};
    for (const sale of sales) {
      const { customerId, name, email } = sale.customerInfo;
      if (!email) continue;
      const key = customerId?.toString() || email;
      if (!customerMap[key]) customerMap[key] = { name, email, expired: [], expiringSoon: [] };

      for (const machine of sale.machines) {
        for (const sn of (machine.serialNumbers || [])) {
          const ct = sn.contractType;
          if (!ct?.validTo) continue;
          const validTo = new Date(ct.validTo);
          const item = {
            machineName:  machine.machineName,
            serialNumber: sn.serialNumber,
            contractType: ct.name,
            validFrom:    ct.validFrom,
            validTo:      ct.validTo,
          };
          if (validTo < today) {
            customerMap[key].expired.push(item);
          } else if (validTo <= in30Days) {
            customerMap[key].expiringSoon.push(item);
          }
        }
      }
    }

    const results = { sent: 0, skipped: 0, failed: 0 };
    for (const entry of Object.values(customerMap)) {
      if (!entry.expired.length && !entry.expiringSoon.length) { results.skipped++; continue; }
      const result = await sendContractExpiryAlert({
        customerName:       entry.name,
        customerEmail:      entry.email,
        expiredItems:       entry.expired,
        expiringSoonItems:  entry.expiringSoon,
      });
      result.success ? results.sent++ : results.failed++;
    }

    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getById, createSale, renewContract, exportToExcel, verifySerialNumbers, verifyPartCodes, getAvailableCodes, generateInvoice, sendContractExpiryAlerts, getContractExpiryStatus };
