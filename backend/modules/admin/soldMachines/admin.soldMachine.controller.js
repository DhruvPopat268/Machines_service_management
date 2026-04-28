const mongoose = require("mongoose");
const SoldMachine = require("./admin.soldMachine.model");
const Machine     = require("../inventoryManagement/admin.machine.model");
const Customer    = require("../customerManagement/admin.customer.model");
const Attribute   = require("../attributeManagement/admin.attribute.model");
const { validateCreateSale } = require("./admin.soldMachine.validator");
const InventoryLog = require("../inventoryLogs/admin.inventoryLog.model");

const resolveStockStatus = (currentStock, lowStockThreshold) => {
  if (currentStock === 0) return "Out of Stock";
  if (lowStockThreshold === -1) return "In Stock";
  return lowStockThreshold < currentStock ? "In Stock" : "Low Stock";
};

const getAll = async (req, res) => {
  try {
    const { search, customerId, category, fromDate, toDate, page = 1, limit = 10 } = req.query;

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

    if (customerId && mongoose.isValidObjectId(customerId)) query["customerInfo.customerId"] = customerId;
    if (category && typeof category === "string" && category.trim())
      query["machines.category"] = { $regex: `^${category.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };

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

    res.status(200).json({
      success: true,
      data,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
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

        // Check stock availability
        if (machineVariant.currentStock < quantity)
          return abort(400, `Insufficient stock for "${machine.name}" - "${attrDoc.name}: ${value}". Available: ${machineVariant.currentStock}, Requested: ${quantity}`);

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
          deductedFromInventory: false,
        });
      }

      const machineTotalSold = Math.round(saleVariants.reduce((sum, v) => sum + v.total, 0) * 100) / 100;
      grandTotal = Math.round((grandTotal + machineTotalSold) * 100) / 100;

      saleMachineEntries.push({
        machineId:        machine._id,
        machineName:      machine.name,
        category:         machine.category?.name || "",
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

        const updated = await Machine.findOneAndUpdate(
          { _id: machine._id, "variants.attribute": sv.attribute, "variants.value": machineVariant.value },
          { $inc: { "variants.$.currentStock": -sv.quantity } },
          { new: true, session }
        );

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
          machineName: machine.name,
          modelNumber: machine.modelNumber || "",
          category:    machine.category?.name || "",
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

module.exports = { getAll, getById, createSale };
