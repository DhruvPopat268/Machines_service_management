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

const getAll = async (req, res) => {
  try {
    const { search, customerId, category, division, machineId, fromDate, toDate, page = 1, limit = 10 } = req.query;

    const query = {};

    // Search
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
      query["machines.categoryId"] = category;
    }

    // Filter by division - using ID
    if (division) {
      if (!mongoose.isValidObjectId(division)) {
        return res.status(400).json({ success: false, message: "Invalid division format" });
      }
      query["machines.divisionId"] = division;
    }

    // Filter by machine - using ID
    if (machineId) {
      if (!mongoose.isValidObjectId(machineId)) {
        return res.status(400).json({ success: false, message: "Invalid machineId format" });
      }
      query["machines.machineId"] = machineId;
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
      obj.machinesCount  = s.machines.length;
      obj.totalVariants  = s.machines.reduce((sum, m) => sum + m.variants.length, 0);
      return obj;
    });

    // Calculate stats
    const allSales = await SoldMachine.find(query);
    const totalSalesCount = allSales.length;
    const totalSales = allSales.reduce((sum, s) => sum + s.grandTotal, 0);
    const totalMachinesSold = allSales.reduce((sum, s) => sum + s.machines.length, 0);
    const totalVariantsSold = allSales.reduce((sum, s) => sum + s.machines.reduce((vSum, m) => vSum + m.variants.length, 0), 0);
    const avgSaleValue = totalSalesCount > 0 ? Math.round((totalSales / totalSalesCount) * 100) / 100 : 0;

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

    // Collect all attribute IDs upfront
    const allAttributeIds = machines.flatMap((m) => m.variants.map((v) => v.attribute)).filter(Boolean);
    const attributes      = await Attribute.find({ _id: { $in: allAttributeIds } }).session(session);
    const attrMap         = Object.fromEntries(attributes.map((a) => [a._id.toString(), a]));

    // Collect all contract type IDs upfront
    const allContractTypeIds = machines.flatMap((m) => m.variants.map((v) => v.contractTypeId)).filter(Boolean);
    const contractTypes      = await ContractType.find({ _id: { $in: allContractTypeIds } }).session(session);
    const contractTypeMap    = Object.fromEntries(contractTypes.map((ct) => [ct._id.toString(), ct]));

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
      const saleVariants = [];

      for (const v of variants) {
        const { attribute, value, quantity, price, discountedPrice, contractTypeId, validFrom, validTo } = v;

        const attrDoc = attrMap[attribute.toString()];
        if (!attrDoc)                     return abort(404, `Attribute "${attribute}" not found`);
        if (attrDoc.status === "Inactive") return abort(400, `Attribute "${attrDoc.name}" is inactive`);
        if (!machineAttrIds.has(attribute.toString()))
          return abort(400, `Attribute "${attrDoc.name}" does not belong to machine "${machine.name}"`);

        const machineVariant = machineVariants.find(
          (mv) => mv.attribute.toString() === attribute.toString() && mv.value.trim().toLowerCase() === value.trim().toLowerCase()
        );
        if (!machineVariant) return abort(404, `Variant "${attrDoc.name}: ${value}" not found on machine "${machine.name}"`);

        // Validate contract type
        if (!contractTypeId) return abort(400, `Contract type is required for variant "${attrDoc.name}: ${value}"`);
        const contractTypeDoc = contractTypeMap[contractTypeId.toString()];
        if (!contractTypeDoc) return abort(404, `Contract type "${contractTypeId}" not found`);
        if (contractTypeDoc.status === "Inactive") return abort(400, `Contract type "${contractTypeDoc.name}" is inactive`);

        // Validate dates
        if (!validFrom || !validTo) return abort(400, `Valid from and valid to dates are required for variant "${attrDoc.name}: ${value}"`);
        const fromDate = new Date(validFrom);
        const toDate = new Date(validTo);
        if (isNaN(fromDate.getTime())) return abort(400, `Invalid valid from date for variant "${attrDoc.name}: ${value}"`);
        if (isNaN(toDate.getTime())) return abort(400, `Invalid valid to date for variant "${attrDoc.name}: ${value}"`);
        if (toDate <= fromDate) return abort(400, `Valid to date must be after valid from date for variant "${attrDoc.name}: ${value}"`);

        const effectivePrice = discountedPrice !== null && discountedPrice !== undefined ? discountedPrice : price;
        const total          = Math.round(effectivePrice * quantity * 100) / 100;

        saleVariants.push({
          attribute:             attrDoc._id,
          name:                  attrDoc.name,
          value:                 value.trim(),
          quantity,
          price,
          discountedPrice:       discountedPrice ?? null,
          total,
          contractType: {
            contractTypeId: contractTypeDoc._id,
            name:           contractTypeDoc.name,
            code:           contractTypeDoc.code,
            freeService:    contractTypeDoc.freeService,
            freeParts:      contractTypeDoc.freeParts,
            validFrom:      fromDate,
            validTo:        toDate,
          },
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
        // keep refs for stock update below
        _machineDoc:      machine,
      });
    }

    const [sale] = await SoldMachine.create(
      [{ customerInfo, machines: saleMachineEntries.map(({ _machineDoc, ...rest }) => rest), grandTotal }],
      { session }
    );

    // Update stock and build inventory log
    const logMachineEntries = [];

    for (const entry of saleMachineEntries) {
      const { _machineDoc: machine, variants: saleVariants } = entry;
      const machineVariants = machine.variants;
      const logVariants     = [];

      for (const sv of saleVariants) {
        const machineVariant = machineVariants.find(
          (mv) => mv.attribute.toString() === sv.attribute.toString() && mv.value.trim().toLowerCase() === sv.value.trim().toLowerCase()
        );

        // Atomic operation: check stock availability and decrement in one query
        const updated = await Machine.findOneAndUpdate(
          { 
            _id: machine._id, 
            "variants.attribute": sv.attribute, 
            "variants.value": machineVariant.value,
            "variants.currentStock": { $gte: sv.quantity }  // Atomic stock check
          },
          { $inc: { "variants.$.currentStock": -sv.quantity } },
          { new: true, session }
        );

        if (!updated) {
          return abort(400, `Insufficient stock for "${machine.name}" - "${sv.name}: ${sv.value}". Stock changed during transaction or insufficient quantity available.`);
        }

        const updatedVariant = updated.variants.find(
          (mv) => mv.attribute.toString() === sv.attribute.toString() && mv.value.trim().toLowerCase() === sv.value.trim().toLowerCase()
        );
        const newStatus = resolveStockStatus(updatedVariant.currentStock, updatedVariant.lowStockThreshold);

        await Machine.updateOne(
          { _id: machine._id, "variants.attribute": sv.attribute, "variants.value": machineVariant.value },
          { $set: { "variants.$.stockStatus": newStatus } },
          { session }
        );

        logVariants.push({ name: sv.name, value: sv.value, qtyChange: `-${sv.quantity}` });
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

    // Mark deductedFromInventory = true
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

    // Update customer totalPurchases
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

    const obj          = sale.toObject();
    obj.machinesCount  = sale.machines.length;
    obj.totalVariants  = sale.machines.reduce((sum, m) => sum + m.variants.length, 0);

    res.status(200).json({ success: true, data: obj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const exportToExcel = async (req, res) => {
  try {
    const { search, customerId, category, division, machineId, fromDate, toDate } = req.query;

    const query = {};

    // Search
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

    // Filter by customer
    if (customerId) {
      if (!mongoose.isValidObjectId(customerId)) {
        return res.status(400).json({ success: false, message: "Invalid customerId format" });
      }
      const customer = await Customer.findById(customerId);
      if (!customer) {
        query._id = new mongoose.Types.ObjectId();
      } else {
        query["customerInfo.customerId"] = customerId;
      }
    }

    // Filter by category
    if (category) {
      if (!mongoose.isValidObjectId(category)) {
        return res.status(400).json({ success: false, message: "Invalid category format" });
      }
      query["machines.categoryId"] = category;
    }

    // Filter by division
    if (division) {
      if (!mongoose.isValidObjectId(division)) {
        return res.status(400).json({ success: false, message: "Invalid division format" });
      }
      query["machines.divisionId"] = division;
    }

    // Filter by machine
    if (machineId) {
      if (!mongoose.isValidObjectId(machineId)) {
        return res.status(400).json({ success: false, message: "Invalid machineId format" });
      }
      query["machines.machineId"] = machineId;
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
          rows.push({
            "Customer Name": sale.customerInfo.name || "",
            "Customer Phone": sale.customerInfo.phone || "",
            "Customer GST": sale.customerInfo.gstNumber || "",
            "Machine Name": machine.machineName || "",
            "Model Number": machine.modelNumber || "",
            "Category": machine.category || "",
            "Division": machine.division || "",
            "Variant Name": variant.name || "",
            "Variant Value": variant.value || "",
            "Quantity": variant.quantity || 0,
            "Price": variant.price || 0,
            "Discounted Price": variant.discountedPrice !== null && variant.discountedPrice !== undefined ? variant.discountedPrice : "",
            "Total": variant.total || 0,
            "Contract Type": variant.contractType?.name || "",
            "Contract Code": variant.contractType?.code || "",
            "Free Service": variant.contractType?.freeService ? "Yes" : "No",
            "Free Parts": variant.contractType?.freeParts ? "Yes" : "No",
            "Valid From": variant.contractType?.validFrom ? new Date(variant.contractType.validFrom).toLocaleDateString("en-IN") : "",
            "Valid To": variant.contractType?.validTo ? new Date(variant.contractType.validTo).toLocaleDateString("en-IN") : "",
            "Stock Deducted": variant.deductedFromInventory ? "Yes" : "No",
            "Sale Date": saleDate,
            "Sale Time": saleTime,
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

module.exports = { getAll, getById, createSale, exportToExcel };
