const mongoose = require("mongoose");
const SoldMachine = require("./admin.soldMachine.model");
const PurchasedMachine = require("../purchasedMachines/admin.purchasedMachine.model");
const Machine = require("../inventoryManagement/admin.machine.model");
const Customer = require("../customerManagement/admin.customer.model");
const ContractType = require("../contractTypesManagement/admin.contractType.model");
const PagesCategory = require("../pagesCategoryManagement/admin.pagesCategory.model");
const InventoryLog = require("../inventoryLogs/admin.inventoryLog.model");
const Company = require("../companyManagement/admin.company.model");
const ServiceCall = require("../../customer/calls/customer.serviceCall.model");
const GstConfig = require("../gstConfig/admin.gstConfig.model");
const InvoiceAuditLog = require("./admin.invoiceAuditLog.model");
const { validateEditInvoice } = require("./admin.editInvoice.validator");
const { sendSaleUpdatedEmail } = require("../../../utils/emailService");

const PRODUCT_CATEGORY_ID = process.env.PRODUCT_CATEGORY_ID;
const TSS_CONTRACT_TYPE_ID = process.env.TSS_CONTRACT_TYPE_ID;

/**
 * Execute Edit Invoice with 100% unit-level inventory tracking and audit logging.
 */
const executeEditInvoice = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const abort = async (status, message) => {
      await session.abortTransaction();
      session.endSession();
      return res.status(status).json({ success: false, message });
    };

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return abort(400, "Invalid invoice / sale ID");
    }

    const sale = await SoldMachine.findById(id).session(session);
    if (!sale) {
      return abort(404, "Sale / Invoice not found");
    }

    if (sale.status === "cancelled") {
      return abort(400, "Cannot edit a cancelled sale / invoice");
    }

    const validationError = validateEditInvoice(req.body);
    if (validationError) {
      return abort(400, validationError);
    }

    // ── 1. Resolve Customer Information ──
    let customerInfo = sale.customerInfo;
    let customerDoc = null;
    const targetCustomerId = req.body.customerId || sale.customerInfo?.customerId;

    if (targetCustomerId) {
      customerDoc = await Customer.findById(targetCustomerId).populate("zone", "name").session(session);
      if (!customerDoc) return abort(404, "Customer not found");
      if (customerDoc.status === "Inactive") return abort(400, "Customer is inactive");

      customerInfo = {
        customerId: customerDoc._id,
        customerUniqueId: customerDoc.customerId || "",
        name: customerDoc.name,
        phone: customerDoc.phone,
        email: customerDoc.email,
        address: customerDoc.userLocation?.address || sale.customerInfo?.address || "",
        zone: customerDoc.zone?.name || sale.customerInfo?.zone || "",
        department: customerDoc.department || sale.customerInfo?.department || "",
        gstNumber: customerDoc.gstNumber || sale.customerInfo?.gstNumber || "",
        customerPORef: req.body.customerPORef !== undefined ? req.body.customerPORef.trim() : (sale.customerInfo?.customerPORef || ""),
      };
    }

    // ── 2. Collect Old vs New Serial Numbers ──
    const oldMachinesMap = new Map();
    for (const m of sale.machines) {
      const mId = m.machineId.toString();
      const sns = (m.serialNumbers || []).map(s => s.serialNumber.trim());
      oldMachinesMap.set(mId, {
        machine: m,
        quantity: m.quantity,
        serials: sns,
        partCode: m.partCodes?.partCode || "",
        buyingPriceBase: m.partCodes?.buyingPriceBase || 0,
      });
    }

    const newSubmittedMachines = req.body.machines;
    const allOldSerials = sale.machines.flatMap(m => (m.serialNumbers || []).map(s => s.serialNumber.trim()));
    const allNewSerials = newSubmittedMachines.flatMap(m => (m.serialNumbers || []).map(s => (s.serialNumber || "").trim())).filter(Boolean);

    // Check duplicate serials within the new request
    for (const m of newSubmittedMachines) {
      const sns = (m.serialNumbers || []).map(s => (s.serialNumber || "").trim()).filter(Boolean);
      const set = new Set(sns.map(s => s.toUpperCase()));
      if (set.size !== sns.length) {
        return abort(400, "Duplicate serial numbers submitted for the same machine");
      }
    }

    // Check duplicate serials across machines with same model number in this request
    const modelSnMap = new Map();
    for (const m of newSubmittedMachines) {
      const mDoc = await Machine.findById(m.machineId, { modelNumber: 1 }).lean();
      if (!mDoc) continue;
      const model = (mDoc.modelNumber || "").toUpperCase();
      for (const sEntry of (m.serialNumbers || [])) {
        const sn = (sEntry.serialNumber || "").trim().toUpperCase();
        if (!sn) continue;
        const key = `${model}_${sn}`;
        if (modelSnMap.has(key)) {
          return abort(400, `Duplicate serial number "${sEntry.serialNumber}" for model "${mDoc.modelNumber}" in submitted list`);
        }
        modelSnMap.set(key, true);
      }
    }

    // Identify serials being removed (in old but not in new)
    const newSerialsSetUpper = new Set(allNewSerials.map(s => s.toUpperCase()));
    const serialsBeingReturned = allOldSerials.filter(s => !newSerialsSetUpper.has(s.toUpperCase()));

    // Safety Check: Check if any returned serial is used in an active ServiceCall
    for (const sn of serialsBeingReturned) {
      const serviceCallExists = await ServiceCall.exists({
        "machines.serialNumber": sn,
        status: { $ne: "Cancelled" }
      }).session(session);

      if (serviceCallExists) {
        return abort(400, `Cannot remove or replace serial number "${sn}" because it is currently assigned to an active service call`);
      }
    }

    // Identify newly added serials (in new but not in old)
    const oldSerialsSetUpper = new Set(allOldSerials.map(s => s.toUpperCase()));
    const newlyAddedSerials = allNewSerials.filter(s => !oldSerialsSetUpper.has(s.toUpperCase()));

    // Validate newly added serials: must exist in purchase as available, must not already be sold
    for (const m of newSubmittedMachines) {
      const sns = (m.serialNumbers || []).map(s => (s.serialNumber || "").trim()).filter(Boolean);
      const addedSnsForMachine = sns.filter(s => !oldSerialsSetUpper.has(s.toUpperCase()));
      if (addedSnsForMachine.length === 0) continue;

      const mDoc = await Machine.findById(m.machineId, { modelNumber: 1, name: 1 }).lean();
      if (!mDoc) return abort(404, `Machine "${m.machineId}" not found`);

      const purchaseDocs = await PurchasedMachine.find(
        {
          status: "active",
          "machines.modelNumber": mDoc.modelNumber,
          "machines.serialNumbers.serialNumber": { $in: addedSnsForMachine },
        },
        { "machines.serialNumbers": 1, "machines.modelNumber": 1 }
      ).session(session);

      const foundEntries = purchaseDocs
        .flatMap(p => p.machines.filter(me => me.modelNumber === mDoc.modelNumber).flatMap(me => me.serialNumbers || []));

      const notInPurchase = addedSnsForMachine.filter(sn => !foundEntries.some(e => e.serialNumber.toUpperCase() === sn.toUpperCase()));
      if (notInPurchase.length > 0) {
        return abort(400, `Serial number(s) not found in purchase for model "${mDoc.modelNumber}": ${notInPurchase.join(", ")}`);
      }

      const alreadySold = addedSnsForMachine.filter(sn => foundEntries.some(e => e.serialNumber.toUpperCase() === sn.toUpperCase() && e.status === "sold"));
      if (alreadySold.length > 0) {
        return abort(400, `Serial number(s) already sold: ${alreadySold.join(", ")}`);
      }
    }

    // ── 3. Fetch GST Config & Setup Financials ──
    const gstConfig = await GstConfig.findOne().lean();
    const totalGst = gstConfig ? (gstConfig.cgst || 0) + (gstConfig.sgst || 0) + (gstConfig.igst || 0) : 0;
    const gstDivisor = 1 + totalGst / 100;

    const newMachineEntries = [];
    let grandTotalBase = 0;
    let grandTotalWithGst = 0;
    let grandTotalGstAmount = 0;
    let cogsTotalBase = 0;
    const stockAdjustments = [];

    // Helper to get buying price base from purchaseDocs for a serial number
    const getBuyingPriceFromPurchases = (docs, machineId, code, field) => {
      for (const doc of docs) {
        for (const me of doc.machines) {
          if (me.machineId?.toString() !== machineId.toString()) continue;
          const found = (me[field] || []).find(e =>
            (field === "serialNumbers" ? e.serialNumber : e.partCode)?.toUpperCase() === code.toUpperCase()
          );
          if (found) return me.buyingPriceBase ?? 0;
        }
      }
      return 0;
    };

    // ── 4. Process Each Submitted Machine ──
    for (const m of newSubmittedMachines) {
      const machine = await Machine.findById(m.machineId)
        .populate("category", "name")
        .populate("division", "name")
        .session(session);
      if (!machine) return abort(404, `Machine "${m.machineId}" not found`);
      if (machine.status === "Inactive") return abort(400, `Machine "${machine.name}" is inactive`);

      const isParts = machine.category?._id?.toString() !== PRODUCT_CATEGORY_ID;
      const discountPct = Number(m.discountPercentage) || 0;
      const sellingPriceWithGst = Math.round(Number(m.sellingPriceWithGst) * 100) / 100;
      const sellingPriceBase = Math.round((sellingPriceWithGst / gstDivisor) * 100) / 100;
      const gstAmountPerUnit = Math.round((sellingPriceWithGst - sellingPriceBase) * 100) / 100;
      const netSellingPriceWithGst = Math.round(sellingPriceWithGst * (1 - discountPct / 100) * 100) / 100;
      const netSellingPriceBase = Math.round((netSellingPriceWithGst / gstDivisor) * 100) / 100;
      const netGstAmountPerUnit = Math.round((netSellingPriceWithGst - netSellingPriceBase) * 100) / 100;
      const sellingTotalBase = Math.round(netSellingPriceBase * m.quantity * 100) / 100;
      const sellingTotalWithGst = Math.round(netSellingPriceWithGst * m.quantity * 100) / 100;
      const gstAmountTotal = Math.round(netGstAmountPerUnit * m.quantity * 100) / 100;
      const discountAmountWithGst = Math.round((sellingPriceWithGst - netSellingPriceWithGst) * 100) / 100;

      grandTotalBase = Math.round((grandTotalBase + sellingTotalBase) * 100) / 100;
      grandTotalWithGst = Math.round((grandTotalWithGst + sellingTotalWithGst) * 100) / 100;
      grandTotalGstAmount = Math.round((grandTotalGstAmount + gstAmountTotal) * 100) / 100;

      const entryData = {
        machineId: machine._id,
        machineName: machine.name,
        modelNumber: machine.modelNumber || "",
        partCode: machine.partCode || "",
        hsnCode: machine.hsnCode || "",
        categoryId: machine.category?._id || null,
        category: machine.category?.name || "",
        divisionId: machine.division?._id || null,
        division: machine.division?.name || "",
        quantity: m.quantity,
        sellingPriceWithGst,
        sellingPriceBase,
        gstAmountPerUnit,
        discount: { percentage: discountPct, amount: discountAmountWithGst },
        netSellingPriceBase,
        netSellingPriceWithGst,
        netGstAmountPerUnit,
        sellingTotalBase,
        sellingTotalWithGst,
        gstAmountTotal,
      };

      const purchaseDocs = await PurchasedMachine.find(
        { "machines.machineId": machine._id },
        { "machines": 1, "createdAt": 1 }
      ).sort({ createdAt: 1 }).session(session).lean();

      if (isParts) {
        // Parts machine
        const oldEntry = oldMachinesMap.get(machine._id.toString());
        const oldQty = oldEntry ? oldEntry.quantity : 0;
        const diffQty = m.quantity - oldQty;

        let chosenBuyingPriceBase = oldEntry?.buyingPriceBase || 0;
        let chosenPartCode = oldEntry?.partCode || machine.partCode || "";

        if (diffQty > 0) {
          // Increased parts quantity: FIFO allocation for the delta
          let chosenPurchaseDocId = null;
          for (const doc of purchaseDocs) {
            for (const me of doc.machines) {
              if (me.machineId?.toString() !== machine._id.toString()) continue;
              if ((me.availableParts || 0) >= diffQty) {
                chosenPurchaseDocId = doc._id;
                chosenBuyingPriceBase = me.buyingPriceBase ?? chosenBuyingPriceBase;
                chosenPartCode = me.partCode || chosenPartCode;
                break;
              }
            }
            if (chosenPurchaseDocId) break;
          }

          if (!chosenPurchaseDocId) {
            return abort(400, `Machine "${machine.name}": insufficient available parts in stock for added quantity ${diffQty}`);
          }

          // Deduct available parts from chosen purchase doc
          await PurchasedMachine.updateOne(
            { _id: chosenPurchaseDocId, "machines.machineId": machine._id },
            { $inc: { "machines.$.availableParts": -diffQty, "machines.$.soldParts": diffQty } },
            { session }
          );

          // Update currentStock on Machine
          const newStock = Math.max(0, machine.currentStock - diffQty);
          const stockStatus = newStock === 0 ? "Out of Stock" : machine.lowStockThreshold === -1 ? "In Stock" : newStock <= machine.lowStockThreshold ? "Low Stock" : "In Stock";
          await Machine.updateOne({ _id: machine._id }, { $set: { currentStock: newStock, stockStatus } }, { session });

          // Record Sold InventoryLog for the added parts
          await InventoryLog.create([{
            action: "sold",
            customerInfo,
            soldId: sale._id,
            reference: sale.invoiceNumber,
            reason: `Invoice Edit: Parts quantity increased by ${diffQty} (${machine.name})`,
            machines: [{
              machineId: machine._id,
              machineName: machine.name,
              modelNumber: machine.modelNumber || "",
              categoryId: machine.category?._id || null,
              category: machine.category?.name || "",
              divisionId: machine.division?._id || null,
              division: machine.division?.name || "",
              quantity: diffQty,
              serialNumbers: [],
              partCodes: chosenPartCode ? [chosenPartCode] : [],
            }],
          }], { session });

        } else if (diffQty < 0) {
          // Decreased parts quantity: return returnedQty back to stock
          const returnedQty = Math.abs(diffQty);

          await PurchasedMachine.updateOne(
            { "machines.machineId": machine._id, "machines.soldParts": { $gt: 0 } },
            { $inc: { "machines.$.availableParts": returnedQty, "machines.$.soldParts": -returnedQty } },
            { session }
          );

          const newStock = machine.currentStock + returnedQty;
          const stockStatus = newStock === 0 ? "Out of Stock" : machine.lowStockThreshold === -1 ? "In Stock" : newStock <= machine.lowStockThreshold ? "Low Stock" : "In Stock";
          await Machine.updateOne({ _id: machine._id }, { $set: { currentStock: newStock, stockStatus } }, { session });

          // Record Restocked InventoryLog for the returned parts
          await InventoryLog.create([{
            action: "restocked",
            customerInfo,
            soldId: sale._id,
            reference: sale.invoiceNumber,
            reason: `Invoice Edit: Parts quantity decreased by ${returnedQty} (${machine.name})`,
            machines: [{
              machineId: machine._id,
              machineName: machine.name,
              modelNumber: machine.modelNumber || "",
              categoryId: machine.category?._id || null,
              category: machine.category?.name || "",
              divisionId: machine.division?._id || null,
              division: machine.division?.name || "",
              quantity: returnedQty,
              serialNumbers: [],
              partCodes: chosenPartCode ? [chosenPartCode] : [],
            }],
          }], { session });
        }

        cogsTotalBase = Math.round((cogsTotalBase + (chosenBuyingPriceBase * m.quantity)) * 100) / 100;
        entryData.partCodes = { partCode: chosenPartCode, buyingPriceBase: chosenBuyingPriceBase };

        stockAdjustments.push({
          machineId: machine._id,
          machineName: machine.name,
          modelNumber: machine.modelNumber || "",
          previousQuantity: oldQty,
          newQuantity: m.quantity,
          difference: diffQty,
          type: oldQty === 0 ? "item_added" : diffQty > 0 ? "quantity_increased" : diffQty < 0 ? "quantity_decreased" : "unchanged",
          serialNumbersReturned: [],
          serialNumbersDeducted: [],
        });

      } else {
        // Serialized Machine
        const oldEntry = oldMachinesMap.get(machine._id.toString());
        const oldSerials = oldEntry ? oldEntry.serials : [];
        const newSerials = (m.serialNumbers || []).map(s => s.serialNumber.trim());

        const oldSerialsSet = new Set(oldSerials.map(s => s.toUpperCase()));
        const newSerialsSet = new Set(newSerials.map(s => s.toUpperCase()));

        const serialsReturnedForMachine = oldSerials.filter(s => !newSerialsSet.has(s.toUpperCase()));
        const serialsDeductedForMachine = newSerials.filter(s => !oldSerialsSet.has(s.toUpperCase()));

        // Mark returned serials as "available" in PurchasedMachine
        for (const sn of serialsReturnedForMachine) {
          await PurchasedMachine.updateOne(
            { "machines.serialNumbers.serialNumber": sn },
            { $set: { "machines.$[outer].serialNumbers.$[inner].status": "available" } },
            { arrayFilters: [{ "outer.serialNumbers.serialNumber": sn }, { "inner.serialNumber": sn }], session }
          );
        }

        // Mark deducted serials as "sold" in PurchasedMachine
        for (const sn of serialsDeductedForMachine) {
          await PurchasedMachine.updateOne(
            { "machines.serialNumbers.serialNumber": sn },
            { $set: { "machines.$[outer].serialNumbers.$[inner].status": "sold" } },
            { arrayFilters: [{ "outer.serialNumbers.serialNumber": sn }, { "inner.serialNumber": sn }], session }
          );
        }

        // Adjust Machine doc currentStock by net difference
        const netQtyDiff = m.quantity - (oldEntry ? oldEntry.quantity : 0);
        if (netQtyDiff !== 0) {
          const newStock = Math.max(0, machine.currentStock - netQtyDiff);
          const stockStatus = newStock === 0 ? "Out of Stock" : machine.lowStockThreshold === -1 ? "In Stock" : newStock <= machine.lowStockThreshold ? "Low Stock" : "In Stock";
          await Machine.updateOne({ _id: machine._id }, { $set: { currentStock: newStock, stockStatus } }, { session });
        }

        // ── 100% UNIT-LEVEL INVENTORY LOGGING ──
        // If any serials were returned, write an InventoryLog with action "restocked"
        if (serialsReturnedForMachine.length > 0) {
          await InventoryLog.create([{
            action: "restocked",
            customerInfo,
            soldId: sale._id,
            reference: sale.invoiceNumber,
            reason: serialsDeductedForMachine.length > 0
              ? `Invoice Edit: Serial swap - returned [${serialsReturnedForMachine.join(", ")}] (${machine.name})`
              : `Invoice Edit: Returned serial(s) [${serialsReturnedForMachine.join(", ")}] (${machine.name})`,
            machines: [{
              machineId: machine._id,
              machineName: machine.name,
              modelNumber: machine.modelNumber || "",
              categoryId: machine.category?._id || null,
              category: machine.category?.name || "",
              divisionId: machine.division?._id || null,
              division: machine.division?.name || "",
              quantity: serialsReturnedForMachine.length,
              serialNumbers: serialsReturnedForMachine,
              partCodes: [],
            }],
          }], { session });
        }

        // If any serials were deducted/added, write an InventoryLog with action "sold"
        if (serialsDeductedForMachine.length > 0) {
          await InventoryLog.create([{
            action: "sold",
            customerInfo,
            soldId: sale._id,
            reference: sale.invoiceNumber,
            reason: serialsReturnedForMachine.length > 0
              ? `Invoice Edit: Serial swap - deducted [${serialsDeductedForMachine.join(", ")}] (${machine.name})`
              : `Invoice Edit: Added serial(s) [${serialsDeductedForMachine.join(", ")}] (${machine.name})`,
            machines: [{
              machineId: machine._id,
              machineName: machine.name,
              modelNumber: machine.modelNumber || "",
              categoryId: machine.category?._id || null,
              category: machine.category?.name || "",
              divisionId: machine.division?._id || null,
              division: machine.division?.name || "",
              quantity: serialsDeductedForMachine.length,
              serialNumbers: serialsDeductedForMachine,
              partCodes: [],
            }],
          }], { session });
        }

        // Build serialNumbers array with contract types and pages categories
        entryData.serialNumbers = await Promise.all((m.serialNumbers || []).map(async (sEntry) => {
          let contractType = null;
          let pagesCategories = [];

          if (sEntry.contractTypeId) {
            const ct = await ContractType.findById(sEntry.contractTypeId).session(session);
            if (!ct) throw new Error(`Contract type "${sEntry.contractTypeId}" not found`);
            if (ct.status === "Inactive") throw new Error(`Contract type "${ct.name}" is inactive`);
            const validFrom = new Date(sEntry.validFrom);
            const validTo = new Date(sEntry.validTo);
            if (isNaN(validFrom.getTime())) throw new Error(`Invalid validFrom for serial ${sEntry.serialNumber}`);
            if (isNaN(validTo.getTime())) throw new Error(`Invalid validTo for serial ${sEntry.serialNumber}`);
            if (validTo <= validFrom) throw new Error(`validTo must be after validFrom for serial ${sEntry.serialNumber}`);

            if (TSS_CONTRACT_TYPE_ID && ct._id.toString() === TSS_CONTRACT_TYPE_ID) {
              pagesCategories = await Promise.all((sEntry.pagesCategories || []).map(async (pc) => {
                const cat = await PagesCategory.findById(pc.pagesCategoryId).session(session);
                if (!cat) throw new Error(`Pages category "${pc.pagesCategoryId}" not found`);
                if (cat.status === "Inactive") throw new Error(`Pages category "${cat.name}" is inactive`);
                return {
                  pagesCategoryId: cat._id,
                  pagesCategory: cat.name,
                  costPerPage: Number(pc.costPerPage),
                };
              }));
            }

            contractType = {
              contractTypeId: ct._id,
              name: ct.name,
              code: ct.code,
              freeService: ct.freeService,
              freeParts: ct.freeParts,
              validFrom,
              validTo,
            };
          }

          const bp = getBuyingPriceFromPurchases(purchaseDocs, machine._id, sEntry.serialNumber, "serialNumbers");
          cogsTotalBase = Math.round((cogsTotalBase + bp) * 100) / 100;

          return {
            serialNumber: sEntry.serialNumber.trim(),
            buyingPriceBase: bp,
            minCopies: Number(sEntry.minCopies) || 0,
            department: sEntry.department ? sEntry.department.trim() : undefined,
            contractType,
            pagesCategories,
          };
        }));

        let adjType = "unchanged";
        if (!oldEntry) adjType = "item_added";
        else if (serialsReturnedForMachine.length > 0 && serialsDeductedForMachine.length > 0) adjType = "serial_swapped";
        else if (netQtyDiff > 0) adjType = "quantity_increased";
        else if (netQtyDiff < 0) adjType = "quantity_decreased";

        stockAdjustments.push({
          machineId: machine._id,
          machineName: machine.name,
          modelNumber: machine.modelNumber || "",
          previousQuantity: oldEntry ? oldEntry.quantity : 0,
          newQuantity: m.quantity,
          difference: netQtyDiff,
          type: adjType,
          serialNumbersReturned: serialsReturnedForMachine,
          serialNumbersDeducted: serialsDeductedForMachine,
        });
      }

      newMachineEntries.push(entryData);
    }

    // ── 5. Handle Completely Removed Machines ──
    const newMachineIdSet = new Set(newSubmittedMachines.map(m => m.machineId.toString()));
    for (const oldM of sale.machines) {
      const oldMId = oldM.machineId.toString();
      if (!newMachineIdSet.has(oldMId)) {
        const machine = await Machine.findById(oldM.machineId).session(session);
        if (!machine) continue;

        const isParts = !oldM.serialNumbers || oldM.serialNumbers.length === 0;

        if (isParts) {
          // Restore parts stock
          await PurchasedMachine.updateOne(
            { "machines.machineId": oldM.machineId, "machines.soldParts": { $gt: 0 } },
            { $inc: { "machines.$.availableParts": oldM.quantity, "machines.$.soldParts": -oldM.quantity } },
            { session }
          );

          const newStock = machine.currentStock + oldM.quantity;
          const stockStatus = newStock === 0 ? "Out of Stock" : machine.lowStockThreshold === -1 ? "In Stock" : newStock <= machine.lowStockThreshold ? "Low Stock" : "In Stock";
          await Machine.updateOne({ _id: oldM.machineId }, { $set: { currentStock: newStock, stockStatus } }, { session });

          // Inventory log: restocked
          await InventoryLog.create([{
            action: "restocked",
            customerInfo,
            soldId: sale._id,
            reference: sale.invoiceNumber,
            reason: `Invoice Edit: Item removed from invoice (${oldM.machineName})`,
            machines: [{
              machineId: oldM.machineId,
              machineName: oldM.machineName,
              modelNumber: oldM.modelNumber || "",
              categoryId: oldM.categoryId || null,
              category: oldM.category || "",
              divisionId: oldM.divisionId || null,
              division: oldM.division || "",
              quantity: oldM.quantity,
              serialNumbers: [],
              partCodes: oldM.partCodes?.partCode ? [oldM.partCodes.partCode] : [],
            }],
          }], { session });

          stockAdjustments.push({
            machineId: oldM.machineId,
            machineName: oldM.machineName,
            modelNumber: oldM.modelNumber || "",
            previousQuantity: oldM.quantity,
            newQuantity: 0,
            difference: -oldM.quantity,
            type: "item_removed",
            serialNumbersReturned: [],
            serialNumbersDeducted: [],
          });

        } else {
          // Serialized machine removed
          const removedSerials = (oldM.serialNumbers || []).map(s => s.serialNumber.trim());

          for (const sn of removedSerials) {
            await PurchasedMachine.updateOne(
              { "machines.serialNumbers.serialNumber": sn },
              { $set: { "machines.$[outer].serialNumbers.$[inner].status": "available" } },
              { arrayFilters: [{ "outer.serialNumbers.serialNumber": sn }, { "inner.serialNumber": sn }], session }
            );
          }

          const newStock = machine.currentStock + oldM.quantity;
          const stockStatus = newStock === 0 ? "Out of Stock" : machine.lowStockThreshold === -1 ? "In Stock" : newStock <= machine.lowStockThreshold ? "Low Stock" : "In Stock";
          await Machine.updateOne({ _id: oldM.machineId }, { $set: { currentStock: newStock, stockStatus } }, { session });

          // Inventory log: restocked
          await InventoryLog.create([{
            action: "restocked",
            customerInfo,
            soldId: sale._id,
            reference: sale.invoiceNumber,
            reason: `Invoice Edit: Item removed from invoice (${oldM.machineName})`,
            machines: [{
              machineId: oldM.machineId,
              machineName: oldM.machineName,
              modelNumber: oldM.modelNumber || "",
              categoryId: oldM.categoryId || null,
              category: oldM.category || "",
              divisionId: oldM.divisionId || null,
              division: oldM.division || "",
              quantity: oldM.quantity,
              serialNumbers: removedSerials,
              partCodes: [],
            }],
          }], { session });

          stockAdjustments.push({
            machineId: oldM.machineId,
            machineName: oldM.machineName,
            modelNumber: oldM.modelNumber || "",
            previousQuantity: oldM.quantity,
            newQuantity: 0,
            difference: -oldM.quantity,
            type: "item_removed",
            serialNumbersReturned: removedSerials,
            serialNumbersDeducted: [],
          });
        }
      }
    }

    // ── 6. Other Charges & GST Breakup ──
    const otherCharges = Number(req.body.otherCharges) || 0;
    if (otherCharges > 0) {
      grandTotalWithGst = Math.round((grandTotalWithGst + otherCharges) * 100) / 100;
    }

    let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
    if (gstConfig) {
      cgstAmount = Math.round((grandTotalBase * (gstConfig.cgst || 0) / 100) * 100) / 100;
      sgstAmount = Math.round((grandTotalBase * (gstConfig.sgst || 0) / 100) * 100) / 100;
      igstAmount = Math.round((grandTotalBase * (gstConfig.igst || 0) / 100) * 100) / 100;
    }

    // ── 7. Payment Recalculation ──
    let newPaidAmount = sale.paidAmount || 0;
    let newRemainingAmount = 0;
    let newPaymentStatus = sale.currentPaymentStatus || "Unpaid";
    let excessPaymentAmount = 0;

    if (req.body.currentPaymentStatus) {
      if (req.body.currentPaymentStatus === "Paid") {
        newPaidAmount = grandTotalWithGst;
        newRemainingAmount = 0;
        newPaymentStatus = "Paid";
      } else if (req.body.currentPaymentStatus === "Partial-Paid") {
        const inputPaid = Number(req.body.paidAmount !== undefined ? req.body.paidAmount : sale.paidAmount);
        newPaidAmount = Math.round(inputPaid * 100) / 100;
        if (newPaidAmount >= grandTotalWithGst) {
          newPaidAmount = grandTotalWithGst;
          newRemainingAmount = 0;
          newPaymentStatus = "Paid";
        } else {
          newRemainingAmount = Math.round((grandTotalWithGst - newPaidAmount) * 100) / 100;
          newPaymentStatus = "Partial-Paid";
        }
      } else if (req.body.currentPaymentStatus === "Unpaid") {
        newPaidAmount = 0;
        newRemainingAmount = grandTotalWithGst;
        newPaymentStatus = "Unpaid";
      }
    } else {
      // Recalculate remaining based on existing paidAmount vs revised total
      if (newPaidAmount >= grandTotalWithGst) {
        if (newPaidAmount > grandTotalWithGst) {
          excessPaymentAmount = Math.round((newPaidAmount - grandTotalWithGst) * 100) / 100;
          newPaidAmount = grandTotalWithGst;
        }
        newRemainingAmount = 0;
        newPaymentStatus = grandTotalWithGst === 0 ? null : "Paid";
      } else {
        newRemainingAmount = Math.round((grandTotalWithGst - newPaidAmount) * 100) / 100;
        newPaymentStatus = newPaidAmount > 0 ? "Partial-Paid" : "Unpaid";
      }
    }

    // ── 8. Update SoldMachine Document ──
    const updatePayload = {
      customerInfo,
      machines: newMachineEntries,
      grandTotalBase,
      grandTotalWithGst,
      grandTotalGstAmount,
      cogsTotalBase,
      cgst: { percent: gstConfig?.cgst || 0, amount: cgstAmount },
      sgst: { percent: gstConfig?.sgst || 0, amount: sgstAmount },
      igst: { percent: gstConfig?.igst || 0, amount: igstAmount },
      paidAmount: newPaidAmount,
      remainingAmount: newRemainingAmount,
      currentPaymentStatus: newPaymentStatus,
      shippingAddress: req.body.shippingAddress !== undefined ? req.body.shippingAddress.trim() : (sale.shippingAddress || ""),
      billingAddress: req.body.billingAddress !== undefined ? req.body.billingAddress.trim() : (sale.billingAddress || ""),
      otherCharges,
      notes: req.body.notes !== undefined ? req.body.notes.trim() : (sale.notes || ""),
      termsAndConditions: req.body.termsAndConditions !== undefined ? req.body.termsAndConditions.trim() : (sale.termsAndConditions || ""),
      paymentMethod: req.body.paymentMethod || sale.paymentMethod || "",
      editReason: req.body.editReason || "Invoice Edited",
    };

    if (req.body.invoiceDate) {
      updatePayload.invoiceDate = new Date(req.body.invoiceDate);
    }

    const updatedSale = await SoldMachine.findByIdAndUpdate(
      id,
      { $set: updatePayload },
      { new: true, session }
    );

    // ── 9. Create InvoiceAuditLog Document ──
    const auditLog = await InvoiceAuditLog.create([{
      soldMachineId: sale._id,
      invoiceNumber: sale.invoiceNumber,
      editedBy: req.user?._id || null,
      editedByName: req.user?.name || "Admin",
      editDate: new Date(),
      reason: req.body.editReason || "Invoice Edited",

      previousGrandTotalBase: sale.grandTotalBase || 0,
      newGrandTotalBase: grandTotalBase,
      previousGrandTotalWithGst: sale.grandTotalWithGst || 0,
      newGrandTotalWithGst: grandTotalWithGst,
      totalDifference: Math.round((grandTotalWithGst - (sale.grandTotalWithGst || 0)) * 100) / 100,

      previousPaidAmount: sale.paidAmount || 0,
      newPaidAmount: newPaidAmount,
      previousRemainingAmount: sale.remainingAmount || 0,
      newRemainingAmount: newRemainingAmount,
      previousPaymentStatus: sale.currentPaymentStatus,
      newPaymentStatus: newPaymentStatus,
      excessPaymentAmount,

      previousCustomerId: sale.customerInfo?.customerId,
      newCustomerId: customerInfo?.customerId,
      previousCustomerName: sale.customerInfo?.name || "",
      newCustomerName: customerInfo?.name || "",

      stockAdjustments,
      previousItemsSnapshot: sale.machines,
      newItemsSnapshot: newMachineEntries,
    }], { session });

    await session.commitTransaction();
    session.endSession();

    // ── 10. Send Sale Updated Email Notification (Async, outside transaction) ──
    try {
      const customerEmail = customerInfo?.email;
      if (customerEmail) {
        const company = await Company.findOne().lean();
        const updateDate = new Date().toLocaleDateString("en-IN", {
          day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata"
        });

        await sendSaleUpdatedEmail({
          customerName: customerInfo.name,
          customerEmail,
          invoiceNumber: sale.invoiceNumber || "N/A",
          updateDate,
          grandTotal: grandTotalWithGst,
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          reason: req.body.editReason || "Invoice Edited",
          companyName: company?.name || "",
          companyEmail: company?.email || "",
          companyPhone: company?.phone || "",
        });
      }
    } catch (emailErr) {
      console.error("Sale update email failed (non-blocking):", emailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: "Invoice updated successfully",
      data: updatedSale,
      auditLogId: auditLog[0]?._id,
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Fetch Audit History for a specific invoice.
 */
const getInvoiceAuditLogsService = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid sale ID" });
    }

    const logs = await InvoiceAuditLog.find({ soldMachineId: id })
      .sort({ createdAt: -1 })
      .populate("editedBy", "name email")
      .lean();

    return res.status(200).json({ success: true, data: logs });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Fetch all data required to initialize the Edit Invoice dialog
 * including current invoice details, available serial numbers, and GST configuration.
 */
const getEditSaleDataService = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid sale ID" });
    }

    const sale = await SoldMachine.findById(id).lean();
    if (!sale) {
      return res.status(404).json({ success: false, message: "Sale / Invoice not found" });
    }

    // For each machine in the sale, get available serial numbers + the currently assigned serials
    const machinesWithCodes = await Promise.all(
      sale.machines.map(async (m) => {
        const currentSerials = (m.serialNumbers || []).map(s => s.serialNumber);

        // Fetch available serial numbers from purchase
        const purchaseDocs = await PurchasedMachine.find(
          {
            status: "active",
            "machines.machineId": m.machineId,
          },
          { "machines.serialNumbers": 1, "machines.machineId": 1 }
        ).lean();

        const availableFromStock = purchaseDocs.flatMap(p =>
          p.machines
            .filter(me => me.machineId?.toString() === m.machineId.toString())
            .flatMap(me => (me.serialNumbers || []).filter(sn => sn.status === "available").map(sn => sn.serialNumber))
        );

        // Union of available and current serial numbers on this invoice
        const selectableSerials = [...new Set([...currentSerials, ...availableFromStock])];

        return {
          ...m,
          selectableSerials,
        };
      })
    );

    const gstConfig = await GstConfig.findOne().lean();

    return res.status(200).json({
      success: true,
      data: {
        sale: {
          ...sale,
          machines: machinesWithCodes,
        },
        gstConfig,
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  executeEditInvoice,
  getInvoiceAuditLogsService,
  getEditSaleDataService,
};
