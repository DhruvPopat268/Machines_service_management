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
    const { search, vendorId, category, willAddToInventory, fromDate, toDate, page = 1, limit = 10 } = req.query;

    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { machineName:       { $regex: escaped, $options: "i" } },
          { "vendorInfo.name": { $regex: escaped, $options: "i" } },
        ];
      }
    }

    if (vendorId && mongoose.isValidObjectId(vendorId))                    query["vendorInfo.vendorId"] = vendorId;
    if (category && typeof category === "string" && category.trim())       query.category = { $regex: `^${category.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
    if (willAddToInventory !== undefined)                                   query.willAddToInventory = willAddToInventory === "true";

    if (fromDate || toDate) {
      const parseIST = (ddmmyy, endOfDay = false) => {
        const [dd, mm, yy] = ddmmyy.split("/");
        const istOffsetMs  = 5.5 * 60 * 60 * 1000;
        const base = Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
        return new Date(base - istOffsetMs);
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

    res.status(200).json({
      success: true,
      data: purchases,
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
    const { vendorId, machineId, variants, willAddToInventory } = req.body;

    const abort = async (status, message) => {
      await session.abortTransaction();
      session.endSession();
      return res.status(status).json({ success: false, message });
    };

    const validationError = validateCreatePurchase(req.body);
    if (validationError) return abort(400, validationError);

    const machine = await Machine.findById(machineId)
      .populate("category", "name")
      .populate("division", "name")
      .session(session);
    if (!machine)                    return abort(404, "Machine not found");
    if (machine.status === "Inactive") return abort(400, "Machine is inactive");

    const vendor = await Vendor.findById(vendorId).session(session);
    if (!vendor)                    return abort(404, "Vendor not found");
    if (vendor.status === "Inactive") return abort(400, "Vendor is inactive");

    const vendorInfo = {
      vendorId:    vendor._id,
      name:        vendor.name,
      phone:       vendor.phone,
      email:       vendor.email,
      companyName: vendor.companyName,
      gstNumber:   vendor.gstNumber || "",
    };

    const attributeIds = variants.map((v) => v.attribute).filter(Boolean);
    const attributes   = await Attribute.find({ _id: { $in: attributeIds } }).session(session);
    const attrMap      = Object.fromEntries(attributes.map((a) => [a._id.toString(), a]));

    const machineAttrIds = new Set(machine.variants.map((mv) => mv.attribute.toString()));
    const machineVariants  = machine.variants;
    const purchaseVariants = [];

    for (const v of variants) {
      const { attribute, value, quantity, price, discountedPrice } = v;

      const attrDoc = attrMap[attribute.toString()];
      if (!attrDoc)                      return abort(404, `Attribute "${attribute}" not found`);
      if (attrDoc.status === "Inactive")  return abort(400, `Attribute "${attrDoc.name}" is inactive`);
      if (!machineAttrIds.has(attribute.toString())) return abort(400, `Attribute "${attrDoc.name}" does not belong to this machine`);

      const machineVariantIdx = machineVariants.findIndex(
        (mv) => mv.attribute.toString() === attribute.toString() && mv.value.trim().toLowerCase() === value.trim().toLowerCase()
      );
      if (machineVariantIdx === -1) return abort(404, `Variant "${attrDoc.name}: ${value}" not found on machine`);

      purchaseVariants.push({
        attribute:       attrDoc._id,
        name:            attrDoc.name,
        value:           value.trim(),
        quantity,
        price,
        discountedPrice: discountedPrice ?? null,
        total:           Math.round((discountedPrice !== null && discountedPrice !== undefined ? discountedPrice : price) * quantity * 100) / 100,
      });
    }

    const totalPurchased = Math.round(purchaseVariants.reduce((sum, v) => sum + v.total, 0) * 100) / 100;

    const [purchase] = await PurchasedMachine.create(
      [
        {
          vendorInfo,
          category:           machine.category?.name || "",
          machineId:          machine._id,
          machineName:        machine.name,
          variants:           purchaseVariants,
          willAddToInventory: willAddToInventory !== false,
          totalPurchased,
        },
      ],
      { session }
    );

    if (purchase.willAddToInventory) {
      const logVariants = [];

      for (const v of variants) {
        const { attribute, value, quantity } = v;

        const machineVariantIdx = machineVariants.findIndex(
          (mv) => mv.attribute.toString() === attribute.toString() && mv.value.trim().toLowerCase() === value.trim().toLowerCase()
        );

        const variant   = machineVariants[machineVariantIdx];
        const newStock  = variant.currentStock + quantity;
        const newStatus = resolveStockStatus(newStock, variant.lowStockThreshold);

        await Machine.updateOne(
          { _id: machineId, "variants.attribute": attribute, "variants.value": variant.value },
          {
            $set: {
              "variants.$.currentStock": newStock,
              "variants.$.stockStatus":  newStatus,
            },
          },
          { session }
        );

        const attrDoc = attrMap[attribute.toString()];
        logVariants.push({
          name:      attrDoc.name,
          value:     variant.value,
          qtyChange: `+${quantity}`,
        });
      }

      await InventoryLog.create(
        [
          {
            action:      "purchased",
            vendorInfo,
            machineName: machine.name,
            modelNumber: machine.modelNumber || "",
            category:    machine.category?.name || "",
            division:    machine.division?.name || "",
            variants:    logVariants,
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ success: true, data: purchase });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: err.message });
  }
};

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
    if (!purchase)              return abort(404, "Purchase record not found");
    if (purchase.willAddToInventory) return abort(400, "Already added to inventory");

    const machine = await Machine.findById(purchase.machineId)
      .populate("category", "name")
      .populate("division", "name")
      .session(session);
    if (!machine)                    return abort(404, "Machine not found");
    if (machine.status === "Inactive") return abort(400, "Machine is inactive");

    const machineVariants = machine.variants;
    const logVariants     = [];

    for (const pv of purchase.variants) {
      const machineVariant = machineVariants.find(
        (mv) => mv.attribute.toString() === pv.attribute.toString() && mv.value.trim().toLowerCase() === pv.value.trim().toLowerCase()
      );
      if (!machineVariant) return abort(404, `Variant "${pv.name}: ${pv.value}" not found on machine`);

      const newStock  = machineVariant.currentStock + pv.quantity;
      const newStatus = resolveStockStatus(newStock, machineVariant.lowStockThreshold);

      await Machine.updateOne(
        { _id: machine._id, "variants.attribute": machineVariant.attribute, "variants.value": machineVariant.value },
        {
          $set: {
            "variants.$.currentStock": newStock,
            "variants.$.stockStatus":  newStatus,
          },
        },
        { session }
      );

      logVariants.push({
        name:      pv.name,
        value:     pv.value,
        qtyChange: `+${pv.quantity}`,
      });
    }

    await InventoryLog.create(
      [
        {
          action:      "purchased",
          vendorInfo:  purchase.vendorInfo,
          machineName: machine.name,
          modelNumber: machine.modelNumber || "",
          category:    machine.category?.name || "",
          division:    machine.division?.name || "",
          variants:    logVariants,
        },
      ],
      { session }
    );

    await PurchasedMachine.findByIdAndUpdate(id, { willAddToInventory: true }, { session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, message: "Inventory updated successfully" });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, createPurchase, addToInventory };
