const mongoose = require("mongoose");
const PurchasedMachine = require("./admin.purchasedMachine.model");
const Machine          = require("../inventoryManagement/admin.machine.model");
const Vendor           = require("../vendorManagement/admin.vendor.model");
const Attribute        = require("../attributeManagement/admin.attribute.model");
const { validateCreatePurchase } = require("./admin.purchasedMachine.validator");
const InventoryLog     = require("../inventoryLogs/admin.inventoryLog.model");

const resolveStockStatus = (currentStock, lowStockThreshold) => {
  if (currentStock === 0) return "Out of Stock";
  if (lowStockThreshold === -1) return "In Stock";
  return lowStockThreshold < currentStock ? "In Stock" : "Low Stock";
};

const getAll = async (req, res) => {
  try {
    const { search, vendorId, category, fromDate, toDate, page = 1, limit = 10 } = req.query;

    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { "machines.machineName": { $regex: escaped, $options: "i" } },
          { "vendorInfo.name":      { $regex: escaped, $options: "i" } },
        ];
      }
    }

    if (vendorId && mongoose.isValidObjectId(vendorId)) query["vendorInfo.vendorId"] = vendorId;
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

    const [purchases, total] = await Promise.all([
      PurchasedMachine.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      PurchasedMachine.countDocuments(query),
    ]);

    const data = purchases.map((p) => {
      const obj = p.toObject();
      obj.machinesCount  = p.machines.length;
      obj.totalVariants  = p.machines.reduce((sum, m) => sum + m.variants.length, 0);
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

const createPurchase = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { vendorId, machines } = req.body;

    const abort = async (status, message) => {
      await session.abortTransaction();
      session.endSession();
      return res.status(status).json({ success: false, message });
    };

    const validationError = validateCreatePurchase(req.body);
    if (validationError) return abort(400, validationError);

    const vendor = await Vendor.findById(vendorId).session(session);
    if (!vendor)                     return abort(404, "Vendor not found");
    if (vendor.status === "Inactive") return abort(400, "Vendor is inactive");

    const vendorInfo = {
      vendorId:    vendor._id,
      name:        vendor.name,
      phone:       vendor.phone,
      email:       vendor.email,
      companyName: vendor.companyName,
      gstNumber:   vendor.gstNumber || "",
    };

    // Collect all attribute IDs across all machines upfront
    const allAttributeIds = machines.flatMap((m) => m.variants.map((v) => v.attribute)).filter(Boolean);
    const attributes      = await Attribute.find({ _id: { $in: allAttributeIds } }).session(session);
    const attrMap         = Object.fromEntries(attributes.map((a) => [a._id.toString(), a]));

    const purchaseMachineEntries = [];
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
      const purchaseVariants = [];

      for (const v of variants) {
        const { attribute, value, quantity, price, discountedPrice, willAddToInventory } = v;

        const attrDoc = attrMap[attribute.toString()];
        if (!attrDoc)                     return abort(404, `Attribute "${attribute}" not found`);
        if (attrDoc.status === "Inactive") return abort(400, `Attribute "${attrDoc.name}" is inactive`);
        if (!machineAttrIds.has(attribute.toString()))
          return abort(400, `Attribute "${attrDoc.name}" does not belong to machine "${machine.name}"`);

        const machineVariant = machineVariants.find(
          (mv) => mv.attribute.toString() === attribute.toString() && mv.value.trim().toLowerCase() === value.trim().toLowerCase()
        );
        if (!machineVariant) return abort(404, `Variant "${attrDoc.name}: ${value}" not found on machine "${machine.name}"`);

        const effectivePrice = discountedPrice !== null && discountedPrice !== undefined ? discountedPrice : price;
        const total          = Math.round(effectivePrice * quantity * 100) / 100;

        purchaseVariants.push({
          attribute:          attrDoc._id,
          name:               attrDoc.name,
          value:              value.trim(),
          quantity,
          price,
          discountedPrice:    discountedPrice ?? null,
          total,
          willAddToInventory: willAddToInventory !== false,
          addedToInventory:   false,
        });
      }

      const machineTotalPurchased = Math.round(purchaseVariants.reduce((sum, v) => sum + v.total, 0) * 100) / 100;
      grandTotal = Math.round((grandTotal + machineTotalPurchased) * 100) / 100;

      purchaseMachineEntries.push({
        machineId:             machine._id,
        machineName:           machine.name,
        category:              machine.category?.name || "",
        variants:              purchaseVariants,
        machineTotalPurchased,
        // keep refs for stock update below
        _machineDoc:           machine,
      });
    }

    const [purchase] = await PurchasedMachine.create(
      [{ vendorInfo, machines: purchaseMachineEntries.map(({ _machineDoc, ...rest }) => rest), grandTotal }],
      { session }
    );

    // Update stock and build a single inventory log with all machines
    const logMachineEntries = [];

    for (const entry of purchaseMachineEntries) {
      const { _machineDoc: machine, variants: purchaseVariants } = entry;
      const machineVariants = machine.variants;
      const logVariants     = [];

      for (const pv of purchaseVariants) {
        if (!pv.willAddToInventory) continue;

        const machineVariant = machineVariants.find(
          (mv) => mv.attribute.toString() === pv.attribute.toString() && mv.value.trim().toLowerCase() === pv.value.trim().toLowerCase()
        );

        // Atomic operation: increment stock
        const updated = await Machine.findOneAndUpdate(
          { 
            _id: machine._id, 
            "variants.attribute": pv.attribute, 
            "variants.value": machineVariant.value 
          },
          { $inc: { "variants.$.currentStock": pv.quantity } },
          { new: true, session }
        );

        if (!updated) {
          return abort(404, `Failed to update stock for "${machine.name}" - "${pv.name}: ${pv.value}". Variant may have been removed.`);
        }

        const updatedVariant = updated.variants.find(
          (mv) => mv.attribute.toString() === pv.attribute.toString() && mv.value.trim().toLowerCase() === pv.value.trim().toLowerCase()
        );
        const newStatus = resolveStockStatus(updatedVariant.currentStock, updatedVariant.lowStockThreshold);

        await Machine.updateOne(
          { _id: machine._id, "variants.attribute": pv.attribute, "variants.value": machineVariant.value },
          { $set: { "variants.$.stockStatus": newStatus } },
          { session }
        );

        logVariants.push({ name: pv.name, value: pv.value, qtyChange: `+${pv.quantity}` });
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
        [{ action: "purchased", vendorInfo, machines: logMachineEntries }],
        { session }
      );
    }

    // Mark addedToInventory = true for variants that were just added
    await PurchasedMachine.updateOne(
      { _id: purchase._id },
      {
        $set: Object.fromEntries(
          purchaseMachineEntries.flatMap((entry, mi) =>
            entry.variants.flatMap((pv, vi) =>
              pv.willAddToInventory ? [[`machines.${mi}.variants.${vi}.addedToInventory`, true]] : []
            )
          )
        ),
      },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    const result = await PurchasedMachine.findById(purchase._id);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /:id/add-inventory
// Body: { machines: [{ machineIndex: 0, variantIndexes: [0, 1] }] }
// Adds specific variants (that have willAddToInventory=true but addedToInventory=false) to inventory
const addToInventory = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const abort = async (status, message) => {
      await session.abortTransaction();
      session.endSession();
      return res.status(status).json({ success: false, message });
    };

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return abort(400, "Invalid purchase ID");

    const purchase = await PurchasedMachine.findById(id).session(session);
    if (!purchase) return abort(404, "Purchase record not found");

    // machines: [{ machineIndex, variantIndexes }] — if omitted, process all pending variants
    const targets = Array.isArray(req.body.machines) ? req.body.machines : null;

    const stockSetMap = {};

    for (let mi = 0; mi < purchase.machines.length; mi++) {
      const pm = purchase.machines[mi];

      // Determine which variant indexes to process
      let variantIndexes;
      if (targets) {
        const t = targets.find((t) => t.machineIndex === mi);
        if (!t) continue;
        variantIndexes = t.variantIndexes;
        if (!Array.isArray(variantIndexes) || variantIndexes.length === 0)
          return abort(400, `machines[${mi}]: variantIndexes must be a non-empty array`);
      } else {
        variantIndexes = pm.variants.map((_, i) => i);
      }

      const machine = await Machine.findById(pm.machineId)
        .populate("category", "name")
        .populate("division", "name")
        .session(session);
      if (!machine)                     return abort(404, `Machine "${pm.machineName}" not found`);
      if (machine.status === "Inactive") return abort(400, `Machine "${machine.name}" is inactive`);

      const machineVariants = machine.variants;
      const logVariants     = [];

      for (const vi of variantIndexes) {
        const pv = pm.variants[vi];
        if (!pv) return abort(400, `machines[${mi}].variantIndexes: index ${vi} does not exist`);
        if (pv.addedToInventory) return abort(400, `Variant "${pv.name}: ${pv.value}" is already added to inventory`);

        const machineVariant = machineVariants.find(
          (mv) => mv.attribute.toString() === pv.attribute.toString() && mv.value.trim().toLowerCase() === pv.value.trim().toLowerCase()
        );
        if (!machineVariant) return abort(404, `Variant "${pv.name}: ${pv.value}" not found on machine`);

        // Atomic operation: increment stock
        const updated = await Machine.findOneAndUpdate(
          { 
            _id: machine._id, 
            "variants.attribute": machineVariant.attribute, 
            "variants.value": machineVariant.value 
          },
          { $inc: { "variants.$.currentStock": pv.quantity } },
          { new: true, session }
        );

        if (!updated) {
          return abort(404, `Failed to update stock for "${machine.name}" - "${pv.name}: ${pv.value}". Variant may have been removed.`);
        }

        const updatedVariant = updated.variants.find(
          (mv) => mv.attribute.toString() === pv.attribute.toString() && mv.value.trim().toLowerCase() === pv.value.trim().toLowerCase()
        );
        const newStatus = resolveStockStatus(updatedVariant.currentStock, updatedVariant.lowStockThreshold);

        await Machine.updateOne(
          { _id: machine._id, "variants.attribute": machineVariant.attribute, "variants.value": machineVariant.value },
          { $set: { "variants.$.stockStatus": newStatus } },
          { session }
        );

        stockSetMap[`machines.${mi}.variants.${vi}.addedToInventory`] = true;
        logVariants.push({ name: pv.name, value: pv.value, qtyChange: `+${pv.quantity}` });
      }

      if (logVariants.length) {
        await InventoryLog.create(
          [{ action: "purchased", vendorInfo: purchase.vendorInfo, machines: [{ machineName: machine.name, modelNumber: machine.modelNumber || "", category: machine.category?.name || "", division: machine.division?.name || "", variants: logVariants }] }],
          { session }
        );
      }
    }

    if (Object.keys(stockSetMap).length === 0)
      return abort(400, "No eligible variants to add to inventory");

    await PurchasedMachine.updateOne({ _id: purchase._id }, { $set: stockSetMap }, { session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, message: "Inventory updated successfully" });
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
      return res.status(400).json({ success: false, message: "Invalid purchase ID" });

    const purchase = await PurchasedMachine.findById(id);
    if (!purchase)
      return res.status(404).json({ success: false, message: "Purchase not found" });

    const obj          = purchase.toObject();
    obj.machinesCount  = purchase.machines.length;
    obj.totalVariants  = purchase.machines.reduce((sum, m) => sum + m.variants.length, 0);

    res.status(200).json({ success: true, data: obj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getById, createPurchase, addToInventory };
