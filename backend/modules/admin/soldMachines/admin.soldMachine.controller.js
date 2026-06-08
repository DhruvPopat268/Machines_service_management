const mongoose = require("mongoose");
const xlsx = require("xlsx");
const SoldMachine      = require("./admin.soldMachine.model");
const PurchasedMachine = require("../purchasedMachines/admin.purchasedMachine.model");
const Machine          = require("../inventoryManagement/admin.machine.model");
const Customer         = require("../customerManagement/admin.customer.model");
const ContractType     = require("../contractTypesManagement/admin.contractType.model");
const PagesCategory    = require("../pagesCategoryManagement/admin.pagesCategory.model");
const InventoryLog     = require("../inventoryLogs/admin.inventoryLog.model");
const { validateCreateSale } = require("./admin.soldMachine.validator");

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
    const { search, customerId, category, division, machineId, fromDate, toDate, page = 1, limit = 10 } = req.query;
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
      customerId: customer._id,
      name:       customer.name,
      phone:      customer.phone,
      email:      customer.email,
      address:    customer.address || "",
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
    const { search, customerId, category, division, machineId, fromDate, toDate } = req.query;
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

    const rows = [];
    sales.forEach((sale) => {
      const date = new Date(sale.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
      const time = new Date(sale.createdAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
      sale.machines.forEach((m) => {
        const codes = [...(m.serialNumbers || []).map(e => e.serialNumber), ...(m.partCodes || []).map(e => e.partCode)];
        rows.push({
          "Customer Name":            sale.customerInfo.name || "",
          "Customer Phone":           sale.customerInfo.phone || "",
          "Customer GST":             sale.customerInfo.gstNumber || "",
          "Machine Name":             m.machineName || "",
          "Model Number":             m.modelNumber || "",
          "Category":                 m.category || "",
          "Division":                 m.division || "",
          "Quantity":                 m.quantity,
          "Selling Price":            m.sellingPrice,
          "Discounted Selling Price": m.discountedSellingPrice ?? "",
          "Selling Total":            m.sellingTotal,
          "Serial / Part Codes":      codes.join(", "),
          "Contract Type":            "",
          "Contract Code":            "",
          "Free Service":             "",
          "Free Parts":               "",
          "Valid From":               "",
          "Valid To":                 "",
          "Sale Date":                date,
          "Sale Time":                time,
        });
      });
    });

    const ws = xlsx.utils.json_to_sheet(rows);
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

module.exports = { getAll, getById, createSale, renewContract, exportToExcel, verifySerialNumbers, verifyPartCodes, getAvailableCodes };
