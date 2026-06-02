const mongoose = require("mongoose");
const xlsx = require("xlsx");
const SoldMachine = require("./admin.soldMachine.model");
const Machine     = require("../inventoryManagement/admin.machine.model");
const Customer    = require("../customerManagement/admin.customer.model");
const Attribute   = require("../attributeManagement/admin.attribute.model");
const ContractType = require("../contractTypesManagement/admin.contractType.model");
const { validateCreateSale } = require("./admin.soldMachine.validator");
const InventoryLog = require("../inventoryLogs/admin.inventoryLog.model");

const resolveStockStatus = (currentStock, lowStockThreshold) => {
  if (currentStock === 0) return "Out of Stock";
  if (lowStockThreshold === -1) return "In Stock";
  return lowStockThreshold < currentStock ? "In Stock" : "Low Stock";
};

const buildMachineFilter = (category, division, machineId) => {
  const machineFilter = {};
  if (category) machineFilter.categoryId = category;
  if (division) machineFilter.divisionId = division;
  if (machineId) machineFilter.machineId = machineId;
  return Object.keys(machineFilter).length > 0 ? { $elemMatch: machineFilter } : null;
};

const getAll = async (req, res) => {
  try {
    const { search, customerId, category, division, machineId, serialNumber, fromDate, toDate, page = 1, limit = 10 } = req.query;

    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { "machines.machineName": { $regex: escaped, $options: "i" } },
          { "machines.modelNumber": { $regex: escaped, $options: "i" } },
          { "customerInfo.name": { $regex: escaped, $options: "i" } },
          { "customerInfo.phone": { $regex: escaped, $options: "i" } },
          { "customerInfo.email": { $regex: escaped, $options: "i" } },
        ];
      }
    }

    if (customerId) {
      if (!mongoose.isValidObjectId(customerId))
        return res.status(400).json({ success: false, message: "Invalid customerId format" });
      const customer = await Customer.findById(customerId);
      if (!customer) query._id = new mongoose.Types.ObjectId();
      else query["customerInfo.customerId"] = customerId;
    }

    if (category && !mongoose.isValidObjectId(category))
      return res.status(400).json({ success: false, message: "Invalid category format" });
    if (division && !mongoose.isValidObjectId(division))
      return res.status(400).json({ success: false, message: "Invalid division format" });
    if (machineId && !mongoose.isValidObjectId(machineId))
      return res.status(400).json({ success: false, message: "Invalid machineId format" });

    const machineFilter = buildMachineFilter(category, division, machineId);
    if (machineFilter) query.machines = machineFilter;

    if (serialNumber) {
      const escaped = serialNumber.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query["machines.variants.serialNumbers.serialNumber"] = { $regex: escaped, $options: "i" };
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

    const [sales, total] = await Promise.all([
      SoldMachine.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      SoldMachine.countDocuments(query),
    ]);

    const data = sales.map((s) => {
      const obj = s.toObject();
      obj.machinesCount = s.machines.length;
      obj.totalVariants = s.machines.reduce((sum, m) => sum + m.variants.length, 0);
      return obj;
    });

    const allSales = await SoldMachine.find(query);
    const totalSalesCount   = allSales.length;
    const totalSales        = allSales.reduce((sum, s) => sum + s.grandTotal, 0);
    const totalMachinesSold = allSales.reduce((sum, s) => sum + s.machines.length, 0);
    const totalVariantsSold = allSales.reduce((sum, s) => sum + s.machines.reduce((vSum, m) => vSum + m.variants.length, 0), 0);
    const avgSaleValue      = totalSalesCount > 0 ? Math.round((totalSales / totalSalesCount) * 100) / 100 : 0;

    res.status(200).json({
      success: true,
      data,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
      stats: {
        totalSales: Math.round(totalSales * 100) / 100,
        totalMachinesSold,
        totalVariantsSold,
        avgSaleValue,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createSale = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { customerId, machines } = req.body;

    const abort = async (status, message) => {
      await session.abortTransaction();
      session.endSession();
      return res.status(status).json({ success: false, message });
    };

    const validationError = validateCreateSale(req.body);
    if (validationError) return abort(400, validationError);

    // Collect and validate all serial numbers
    const allSerialNumbers = [];
    for (const machineInput of machines) {
      for (const v of machineInput.variants) {
        const uniqueSerials = new Set(v.serialNumbers.map(e => e.serialNumber.trim().toUpperCase()));
        if (uniqueSerials.size !== v.serialNumbers.length)
          return abort(400, `Duplicate serial numbers found in variant`);
        allSerialNumbers.push(...v.serialNumbers.map(e => e.serialNumber.trim().toUpperCase()));
      }
    }

    const uniqueAllSerials = new Set(allSerialNumbers);
    if (uniqueAllSerials.size !== allSerialNumbers.length)
      return abort(400, `Duplicate serial numbers found across different variants in this sale`);

    const existingSerials = await SoldMachine.find(
      { "machines.variants.serialNumbers.serialNumber": { $in: allSerialNumbers } },
      { "machines.variants.serialNumbers.serialNumber": 1 }
    ).session(session);

    if (existingSerials.length > 0) {
      const foundSerials = existingSerials.flatMap(sale =>
        sale.machines.flatMap(m =>
          m.variants.flatMap(v => v.serialNumbers.map(e => e.serialNumber.toUpperCase()))
        )
      );
      const duplicates = allSerialNumbers.filter(sn => foundSerials.includes(sn));
      return abort(400, `Serial number(s) already exist in system: ${duplicates.slice(0, 5).join(", ")}${duplicates.length > 5 ? ` and ${duplicates.length - 5} more` : ""}`);
    }

    const customer = await Customer.findById(customerId).populate("zone", "name").session(session);
    if (!customer)                     return abort(404, "Customer not found");
    if (customer.status === "Inactive") return abort(400, "Customer is inactive");

    const customerInfo = {
      customerId:  customer._id,
      name:        customer.name,
      phone:       customer.phone,
      email:       customer.email,
      address:     customer.address || "",
      zone:        customer.zone?.name || "",
      gstNumber:   customer.gstNumber || "",
    };

    const allAttributeIds = machines.flatMap((m) => m.variants.map((v) => v.attribute)).filter(Boolean);
    const attributes      = await Attribute.find({ _id: { $in: allAttributeIds } }).session(session);
    const attrMap         = Object.fromEntries(attributes.map((a) => [a._id.toString(), a]));

    // Collect all contract type IDs from serialNumbers entries
    const allContractTypeIds = machines
      .flatMap((m) => m.variants.flatMap((v) => v.serialNumbers.map((e) => e.contractTypeId)))
      .filter((id) => id && mongoose.isValidObjectId(id));
    const contractTypes   = await ContractType.find({ _id: { $in: allContractTypeIds } }).session(session);
    const contractTypeMap = Object.fromEntries(contractTypes.map((ct) => [ct._id.toString(), ct]));

    const saleMachineEntries = [];
    let grandTotal = 0;

    for (const machineInput of machines) {
      const { machineId, variants } = machineInput;

      const machine = await Machine.findById(machineId)
        .populate("category", "name")
        .populate("division", "name")
        .session(session);
      if (!machine)                     return abort(404, `Machine "${machineId}" not found`);
      if (machine.status === "Inactive") return abort(400, `Machine "${machine.name}" is inactive`);

      const machineAttrIds  = new Set(machine.variants.map((mv) => mv.attribute.toString()));
      const machineVariants = machine.variants;
      const saleVariants    = [];

      for (const v of variants) {
        const { attribute, value, quantity, price, discountedPrice } = v;

        const attrDoc = attrMap[attribute.toString()];
        if (!attrDoc)                     return abort(404, `Attribute "${attribute}" not found`);
        if (attrDoc.status === "Inactive") return abort(400, `Attribute "${attrDoc.name}" is inactive`);
        if (!machineAttrIds.has(attribute.toString()))
          return abort(400, `Attribute "${attrDoc.name}" does not belong to machine "${machine.name}"`);

        const machineVariant = machineVariants.find(
          (mv) => mv.attribute.toString() === attribute.toString() && mv.value.trim().toLowerCase() === value.trim().toLowerCase()
        );
        if (!machineVariant) return abort(404, `Variant "${attrDoc.name}: ${value}" not found on machine "${machine.name}"`);

        // Build serialNumbers with embedded contractType per entry
        const builtSerialNumbers = [];
        for (const entry of v.serialNumbers) {
          const contractTypeDoc = contractTypeMap[entry.contractTypeId.toString()];
          if (!contractTypeDoc)                       return abort(404, `Contract type "${entry.contractTypeId}" not found`);
          if (contractTypeDoc.status === "Inactive")  return abort(400, `Contract type "${contractTypeDoc.name}" is inactive`);

          const fromDate = new Date(entry.validFrom);
          const toDate   = new Date(entry.validTo);
          if (isNaN(fromDate.getTime())) return abort(400, `Invalid validFrom for serial "${entry.serialNumber}"`);
          if (isNaN(toDate.getTime()))   return abort(400, `Invalid validTo for serial "${entry.serialNumber}"`);
          if (toDate <= fromDate)        return abort(400, `validTo must be after validFrom for serial "${entry.serialNumber}"`);

          builtSerialNumbers.push({
            serialNumber: entry.serialNumber.trim(),
            contractType: {
              contractTypeId: contractTypeDoc._id,
              name:           contractTypeDoc.name,
              code:           contractTypeDoc.code,
              freeService:    contractTypeDoc.freeService,
              freeParts:      contractTypeDoc.freeParts,
              validFrom:      fromDate,
              validTo:        toDate,
            },
          });
        }

        const effectivePrice = discountedPrice !== null && discountedPrice !== undefined ? discountedPrice : price;
        const total          = Math.round(effectivePrice * quantity * 100) / 100;

        saleVariants.push({
          attribute:             attrDoc._id,
          name:                  attrDoc.name,
          value:                 value.trim(),
          quantity,
          serialNumbers:         builtSerialNumbers,
          price,
          discountedPrice:       discountedPrice ?? null,
          total,
          deductedFromInventory: false,
        });
      }

      const machineTotalSold = Math.round(saleVariants.reduce((sum, v) => sum + v.total, 0) * 100) / 100;
      grandTotal = Math.round((grandTotal + machineTotalSold) * 100) / 100;

      saleMachineEntries.push({
        machineId:        machine._id,
        machineName:      machine.name,
        modelNumber:      machine.modelNumber || "",
        categoryId:       machine.category?._id || null,
        category:         machine.category?.name || "",
        divisionId:       machine.division?._id || null,
        division:         machine.division?.name || "",
        variants:         saleVariants,
        machineTotalSold,
        _machineDoc:      machine,
      });
    }

    const [sale] = await SoldMachine.create(
      [{ customerInfo, machines: saleMachineEntries.map(({ _machineDoc, ...rest }) => rest), grandTotal }],
      { session }
    );

    const logMachineEntries = [];

    for (const entry of saleMachineEntries) {
      const { _machineDoc: machine, variants: saleVariants } = entry;
      const machineVariants = machine.variants;
      const logVariants     = [];

      for (const sv of saleVariants) {
        const machineVariant = machineVariants.find(
          (mv) => mv.attribute.toString() === sv.attribute.toString() && mv.value.trim().toLowerCase() === sv.value.trim().toLowerCase()
        );

        const updated = await Machine.findOneAndUpdate(
          {
            _id: machine._id,
            "variants.attribute": sv.attribute,
            "variants.value": machineVariant.value,
            "variants.currentStock": { $gte: sv.quantity },
          },
          { $inc: { "variants.$.currentStock": -sv.quantity } },
          { new: true, session }
        );

        if (!updated)
          return abort(400, `Insufficient stock for "${machine.name}" - "${sv.name}: ${sv.value}". Stock changed during transaction or insufficient quantity available.`);

        const updatedVariant = updated.variants.find(
          (mv) => mv.attribute.toString() === sv.attribute.toString() && mv.value.trim().toLowerCase() === sv.value.trim().toLowerCase()
        );
        const newStatus = resolveStockStatus(updatedVariant.currentStock, updatedVariant.lowStockThreshold);

        await Machine.updateOne(
          { _id: machine._id, "variants.attribute": sv.attribute, "variants.value": machineVariant.value },
          { $set: { "variants.$.stockStatus": newStatus } },
          { session }
        );

        logVariants.push({ name: sv.name, value: sv.value, qtyChange: `-${sv.quantity}`, serialNumbers: sv.serialNumbers.map(e => e.serialNumber) });
      }

      if (logVariants.length) {
        logMachineEntries.push({
          machineId:   machine._id,
          machineName: machine.name,
          modelNumber: machine.modelNumber || "",
          categoryId:  machine.category?._id || null,
          category:    machine.category?.name || "",
          divisionId:  machine.division?._id || null,
          division:    machine.division?.name || "",
          variants:    logVariants,
        });
      }
    }

    if (logMachineEntries.length) {
      await InventoryLog.create(
        [{ action: "sold", customerInfo, machines: logMachineEntries }],
        { session }
      );
    }

    await SoldMachine.updateOne(
      { _id: sale._id },
      {
        $set: Object.fromEntries(
          saleMachineEntries.flatMap((entry, mi) =>
            entry.variants.map((_, vi) => [`machines.${mi}.variants.${vi}.deductedFromInventory`, true])
          )
        ),
      },
      { session }
    );

    await Customer.updateOne(
      { _id: customerId },
      { $inc: { totalPurchases: 1 } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    const result = await SoldMachine.findById(sale._id);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
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

    const obj         = sale.toObject();
    obj.machinesCount = sale.machines.length;
    obj.totalVariants = sale.machines.reduce((sum, m) => sum + m.variants.length, 0);

    res.status(200).json({ success: true, data: obj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const exportToExcel = async (req, res) => {
  try {
    const { search, customerId, category, division, machineId, serialNumber, fromDate, toDate } = req.query;

    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { "machines.machineName": { $regex: escaped, $options: "i" } },
          { "machines.modelNumber": { $regex: escaped, $options: "i" } },
          { "customerInfo.name": { $regex: escaped, $options: "i" } },
          { "customerInfo.phone": { $regex: escaped, $options: "i" } },
          { "customerInfo.email": { $regex: escaped, $options: "i" } },
        ];
      }
    }

    if (customerId) {
      if (!mongoose.isValidObjectId(customerId))
        return res.status(400).json({ success: false, message: "Invalid customerId format" });
      const customer = await Customer.findById(customerId);
      if (!customer) query._id = new mongoose.Types.ObjectId();
      else query["customerInfo.customerId"] = customerId;
    }

    if (category && !mongoose.isValidObjectId(category))
      return res.status(400).json({ success: false, message: "Invalid category format" });
    if (division && !mongoose.isValidObjectId(division))
      return res.status(400).json({ success: false, message: "Invalid division format" });
    if (machineId && !mongoose.isValidObjectId(machineId))
      return res.status(400).json({ success: false, message: "Invalid machineId format" });

    const machineFilter = buildMachineFilter(category, division, machineId);
    if (machineFilter) query.machines = machineFilter;

    if (serialNumber) {
      const escaped = serialNumber.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query["machines.variants.serialNumbers.serialNumber"] = { $regex: escaped, $options: "i" };
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

    const sales = await SoldMachine.find(query).sort({ createdAt: -1 }).lean();

    const rows = [];
    sales.forEach((sale) => {
      const saleDate = new Date(sale.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
      const saleTime = new Date(sale.createdAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

      sale.machines.forEach((machine) => {
        machine.variants.forEach((variant) => {
          // One export row per serial entry
          (variant.serialNumbers || []).forEach((entry) => {
            rows.push({
              "Customer Name":     sale.customerInfo.name || "",
              "Customer Phone":    sale.customerInfo.phone || "",
              "Customer GST":      sale.customerInfo.gstNumber || "",
              "Machine Name":      machine.machineName || "",
              "Model Number":      machine.modelNumber || "",
              "Category":          machine.category || "",
              "Division":          machine.division || "",
              "Variant Name":      variant.name || "",
              "Variant Value":     variant.value || "",
              "Serial Number":     entry.serialNumber || "",
              "Price":             variant.price || 0,
              "Discounted Price":  variant.discountedPrice !== null && variant.discountedPrice !== undefined ? variant.discountedPrice : "",
              "Contract Type":     entry.contractType?.name || "",
              "Contract Code":     entry.contractType?.code || "",
              "Free Service":      entry.contractType?.freeService ? "Yes" : "No",
              "Free Parts":        entry.contractType?.freeParts ? "Yes" : "No",
              "Valid From":        entry.contractType?.validFrom ? new Date(entry.contractType.validFrom).toLocaleDateString("en-IN") : "",
              "Valid To":          entry.contractType?.validTo ? new Date(entry.contractType.validTo).toLocaleDateString("en-IN") : "",
              "Stock Deducted":    variant.deductedFromInventory ? "Yes" : "No",
              "Sale Date":         saleDate,
              "Sale Time":         saleTime,
            });
          });
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

const checkSerialNumbers = async (req, res) => {
  try {
    const { serialNumbers } = req.body;
    if (!Array.isArray(serialNumbers) || serialNumbers.length === 0)
      return res.status(400).json({ success: false, message: "serialNumbers array is required" });

    const normalized = serialNumbers.map(sn => sn.trim().toUpperCase());

    const uniqueSet = new Set(normalized);
    if (uniqueSet.size !== normalized.length) {
      const seen = new Set();
      const dupes = normalized.filter(sn => seen.size === seen.add(sn).size);
      return res.status(409).json({ success: false, message: `Duplicate serial numbers in your list: ${[...new Set(dupes)].join(", ")}` });
    }

    const existing = await SoldMachine.find(
      { "machines.variants.serialNumbers.serialNumber": { $in: normalized } },
      { "machines.variants.serialNumbers.serialNumber": 1 }
    ).lean();

    if (existing.length > 0) {
      const foundSerials = existing.flatMap(sale =>
        sale.machines.flatMap(m =>
          m.variants.flatMap(v => (v.serialNumbers || []).map(e => e.serialNumber.toUpperCase()))
        )
      );
      const duplicates = normalized.filter(sn => foundSerials.includes(sn));
      return res.status(409).json({ success: false, message: `Serial number(s) already exist in system: ${duplicates.join(", ")}` });
    }

    res.status(200).json({ success: true, message: "All serial numbers are unique" });
  } catch (err) {
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
    if (validTo <= validFrom)        return res.status(400).json({ success: false, message: "newValidTo must be after newValidFrom" });

    const contractType = await ContractType.findOne({ _id: newContractTypeId, status: "Active" });
    if (!contractType)
      return res.status(404).json({ success: false, message: "Active contract type not found" });

    const sn = serialNumber.trim();
    const result = await SoldMachine.updateOne(
      { "machines.variants.serialNumbers.serialNumber": sn },
      {
        $set: {
          "machines.$[].variants.$[].serialNumbers.$[entry].contractType": {
            contractTypeId: contractType._id,
            name:           contractType.name,
            code:           contractType.code,
            freeService:    contractType.freeService,
            freeParts:      contractType.freeParts,
            validFrom,
            validTo,
          }
        }
      },
      { arrayFilters: [{ "entry.serialNumber": sn }] }
    );

    if (result.matchedCount === 0)
      return res.status(404).json({ success: false, message: "Serial number not found" });

    return res.status(200).json({ success: true, message: "Contract renewed successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getById, createSale, exportToExcel, checkSerialNumbers, renewContract };
