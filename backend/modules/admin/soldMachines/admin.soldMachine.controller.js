const mongoose = require("mongoose");
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs/promises");
const SoldMachine = require("./admin.soldMachine.model");
const PurchasedMachine = require("../purchasedMachines/admin.purchasedMachine.model");
const Machine = require("../inventoryManagement/admin.machine.model");
const Customer = require("../customerManagement/admin.customer.model");
const ContractType = require("../contractTypesManagement/admin.contractType.model");
const PagesCategory = require("../pagesCategoryManagement/admin.pagesCategory.model");
const InventoryLog = require("../inventoryLogs/admin.inventoryLog.model");
const Company = require("../companyManagement/admin.company.model");
const Zone = require("../zoneManagement/admin.zone.model");
const Counter = require("../auth/counter.model");
const ServiceCall = require("../../customer/calls/customer.serviceCall.model");
const { validateCreateSale } = require("./admin.soldMachine.validator");
const { sendContractExpiryAlert, sendSaleConfirmationEmail, sendPaymentReceivedEmail, sendSaleCancellationEmail } = require("../../../utils/emailService");

const GstConfig = require("../gstConfig/admin.gstConfig.model");
const PaymentTransaction = require("../paymentTransactions/admin.paymentTransaction.model");
const PRODUCT_CATEGORY_ID = process.env.PRODUCT_CATEGORY_ID;
const TSS_CONTRACT_TYPE_ID = process.env.TSS_CONTRACT_TYPE_ID;

const DOCS_DIR = process.env.NODE_ENV === "production"
  ? "/app/cloud/documents"
  : path.join(__dirname, "../../../cloud/documents");

const numberToWords = (amount) => {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const convert = (n) => {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "") + " ";
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred " + convert(n % 100);
    if (n < 100000) return convert(Math.floor(n / 1000)) + "Thousand " + convert(n % 1000);
    if (n < 10000000) return convert(Math.floor(n / 100000)) + "Lakh " + convert(n % 100000);
    return convert(Math.floor(n / 10000000)) + "Crore " + convert(n % 10000000);
  };
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let words = convert(rupees).trim();
  if (!words) words = "Zero";
  words += " Rupees";
  if (paise > 0) words += " and " + convert(paise).trim() + " Paise";
  words += " Only";
  return words;
};

const buildMachineFilter = (category, division, machineId) => {
  const f = {};
  if (category) f.categoryId = category;
  if (division) f.divisionId = division;
  if (machineId) f.machineId = machineId;
  return Object.keys(f).length > 0 ? { $elemMatch: f } : null;
};

const computeCanCancelSale = async (sale) => {
  // Already cancelled, cannot cancel again
  if (sale.status === "cancelled") return false;

  // Check each machine in the sale
  for (const machine of sale.machines) {
    const serialNumbers = machine.serialNumbers || [];
    
    // If no serial numbers (parts machine), can always cancel
    if (serialNumbers.length === 0) continue;

    // For machines with serial numbers, check if any are used in non-cancelled service calls
    for (const snObj of serialNumbers) {
      const serialNumber = snObj.serialNumber;
      
      // ServiceCall stores serial at machines.serialNumber (not machines.serialNumbers.serialNumber)
      const serviceCallExists = await ServiceCall.exists({
        "machines.serialNumber": serialNumber,
        status: { $ne: "Cancelled" }
      });

      if (serviceCallExists) {
        return false; // Cannot cancel if serial is used in active service call
      }
    }
  }

  return true; // All checks passed, can cancel
};

const getAvailableMachines = async (req, res) => {
  try {
    const { search } = req.query;
    const query = { status: "Active", stockStatus: { $in: ["In Stock", "Low Stock"] } };

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { name:        { $regex: escaped, $options: "i" } },
          { modelNumber: { $regex: escaped, $options: "i" } },
          { partCode:    { $regex: escaped, $options: "i" } },
        ];
      }
    }

    const machines = await Machine.find(query)
      .populate("category", "_id name")
      .populate("division", "_id name")
      .select("_id name modelNumber partCode category division stockStatus currentStock")
      .lean();

    res.status(200).json({ success: true, data: machines });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getAvailableCodes = async (req, res) => {
  try {
    const { machineId } = req.query;

    if (!mongoose.isValidObjectId(machineId))
      return res.status(400).json({ success: false, message: "Invalid machineId" });

    const machine = await Machine.findById(machineId).populate("category", "_id").lean();
    if (!machine)
      return res.status(404).json({ success: false, message: "Machine not found" });

    const isParts = machine.category?._id?.toString() !== PRODUCT_CATEGORY_ID;

    const allRecords = await PurchasedMachine.find(
      { "machines.machineId": new mongoose.Types.ObjectId(machineId), status: "active" },
      { "machines": 1 }
    ).lean();

    const matchingMachines = allRecords.flatMap(r =>
      r.machines.filter(m => m.machineId?.toString() === machineId)
    );

    if (isParts) {
      // For parts machines: return aggregated availability info
      const totalAvailable = matchingMachines.reduce((sum, m) => sum + (m.availableParts || 0), 0);
      const partCode = matchingMachines[0]?.partCode || "";

      return res.status(200).json({
        success: true,
        type: "partCode",
        data: {
          partCode: partCode,
          availableQuantity: totalAvailable,
        },
      });
    } else {
      // For non-parts machines: return available serial numbers
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
    const { search, customerId, zoneId, category, division, machineId, paymentStatus, processedBy, fromDate, toDate, status, page = 1, limit = 10 } = req.query;
    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { "machines.machineName": { $regex: escaped, $options: "i" } },
          { "machines.modelNumber": { $regex: escaped, $options: "i" } },
          { "machines.serialNumbers.serialNumber": { $regex: escaped, $options: "i" } },
          { "machines.partCode": { $regex: escaped, $options: "i" } },
          { "machines.partCodes.partCode": { $regex: escaped, $options: "i" } },
          { invoiceNumber: { $regex: escaped, $options: "i" } },
          { "customerInfo.name": { $regex: escaped, $options: "i" } },
          { "customerInfo.phone": { $regex: escaped, $options: "i" } },
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

    if (paymentStatus && ["Paid", "Unpaid", "Partial-Paid"].includes(paymentStatus))
      query.currentPaymentStatus = paymentStatus;

    if (status && ["active", "cancelled"].includes(status))
      query.status = status;

    if (processedBy) {
      const ids = String(processedBy).split(",").filter(id => mongoose.isValidObjectId(id.trim())).map(id => new mongoose.Types.ObjectId(id.trim()));
      if (ids.length > 0) query.processedBy = { $in: ids };
    }

    if (fromDate || toDate) {
      const parseIST = (ddmmyy, endOfDay = false) => {
        const [dd, mm, yy] = ddmmyy.split("/");
        const base = Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
        return new Date(base - 5.5 * 60 * 60 * 1000);
      };
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = parseIST(fromDate, false);
      if (toDate) query.createdAt.$lte = parseIST(toDate, true);
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [sales, total] = await Promise.all([
      SoldMachine.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).populate("processedBy", "name"),
      SoldMachine.countDocuments(query),
    ]);

    // Compute canCancel for each sale
    const salesWithCanCancel = await Promise.all(
      sales.map(async (s) => ({
        ...s.toObject(),
        machinesCount: s.machines.length,
        canCancel: await computeCanCancelSale(s)
      }))
    );

    const allSales = await SoldMachine.find({ ...query, status: "active" }).lean();
    const totalSales = allSales.reduce((s, sale) => s + (sale.grandTotalBase || 0), 0);
    const totalMachines = allSales.reduce((s, sale) => s + sale.machines.reduce((ms, m) => ms + m.quantity, 0), 0);
    const avgValue = allSales.length > 0 ? Math.round((totalSales / allSales.length) * 100) / 100 : 0;

    res.status(200).json({
      success: true,
      data: salesWithCanCancel,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
      stats: {
        totalSales: Math.round(totalSales * 100) / 100,
        totalMachinesSold: totalMachines,
        avgSaleValue: avgValue,
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

    const sale = await SoldMachine.findById(id).populate("processedBy", "name");
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

    const { customerId, machines } = req.body;

    const customer = await Customer.findById(customerId).populate("zone", "name").session(session);
    if (!customer) return abort(404, "Customer not found");
    if (customer.status === "Inactive") return abort(400, "Customer is inactive");

    const validationError = validateCreateSale(req.body);
    if (validationError) return abort(400, validationError);

    const invoiceNumber = req.body.invoiceNumber.trim();

    // ── Case-insensitive duplicate invoice number check ──
    const existingInvoice = await SoldMachine.findOne({
      invoiceNumber: { $regex: `^${invoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    }).session(session);
    if (existingInvoice)
      return abort(400, `Invoice number "${invoiceNumber}" already exists in another sale record`);

    const customerInfo = {
      customerId: customer._id,
      customerUniqueId: customer.customerId || "",
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.userLocation?.address || "",
      zone: customer.zone?.name || "",
      gstNumber: customer.gstNumber || "",
      customerPORef: req.body.customerPORef?.trim() || "",
    };

    // ── Collect all serial numbers for bulk verification ──
    // Part codes are auto-fetched per machine via FIFO in the loop below
    const allSerialNumbers = machines.flatMap((m) => (m.serialNumbers || []).map(e => e.serialNumber.trim()));

    // Check serial numbers: must exist in purchase as available, must not already be sold
    if (allSerialNumbers.length > 0) {
      // Check duplicates within each machine's own serial list
      for (const m of machines) {
        const sns = (m.serialNumbers || []).map(e => e.serialNumber.trim());
        const uniqueSet = new Set(sns.map(s => s.toUpperCase()));
        if (uniqueSet.size !== sns.length)
          return abort(400, "Duplicate serial numbers in submitted list for the same machine");
      }

      // Check duplicates across machines with same modelNumber within this request
      const modelSnMap = new Map(); // modelNumber -> Set of serial numbers
      for (const m of machines) {
        const machineDoc = await Machine.findById(m.machineId, { modelNumber: 1 }).lean();
        if (!machineDoc) continue;
        const modelNo = machineDoc.modelNumber?.toUpperCase();
        if (!modelSnMap.has(modelNo)) modelSnMap.set(modelNo, new Set());
        for (const sEntry of (m.serialNumbers || [])) {
          const sn = sEntry.serialNumber.trim().toUpperCase();
          if (modelSnMap.get(modelNo).has(sn))
            return abort(400, `Duplicate serial number "${sEntry.serialNumber.trim()}" for model "${machineDoc.modelNumber}" in submitted list`);
          modelSnMap.get(modelNo).add(sn);
        }
      }

      for (const m of machines) {
        const sns = (m.serialNumbers || []).map(e => e.serialNumber.trim()).filter(Boolean);
        if (!sns.length) continue;

        const machine = await Machine.findById(m.machineId, { modelNumber: 1 }).lean();
        if (!machine) return abort(404, `Machine "${m.machineId}" not found`);

        const purchaseDocs = await PurchasedMachine.find(
          {
            status: "active",
            "machines.modelNumber": machine.modelNumber,
            "machines.serialNumbers.serialNumber": { $in: sns },
          },
          { "machines.serialNumbers": 1, "machines.modelNumber": 1 }
        ).session(session);

        const foundEntries = purchaseDocs
          .flatMap(p => p.machines.filter(me => me.modelNumber === machine.modelNumber).flatMap(me => me.serialNumbers || []));

        const notInPurchase = sns.filter(sn => !foundEntries.some(e => e.serialNumber.toUpperCase() === sn.toUpperCase()));
        if (notInPurchase.length > 0)
          return abort(400, `Serial numbers not found in any purchase for model "${machine.modelNumber}": ${notInPurchase.join(", ")}`);

        const alreadySold = sns.filter(sn => foundEntries.some(e => e.serialNumber.toUpperCase() === sn.toUpperCase() && e.status === "sold"));
        if (alreadySold.length > 0)
          return abort(400, `Serial numbers already sold: ${alreadySold.join(", ")}`);
      }
    }

    // ── Fetch GST config ──
    const gstConfig = await GstConfig.findOne().lean();
    const totalGst = gstConfig ? (gstConfig.cgst || 0) + (gstConfig.sgst || 0) + (gstConfig.igst || 0) : 0;
    const gstDivisor = 1 + totalGst / 100;

    // ── Build machine entries ──
    const machineEntries = [];
    let grandTotalBase = 0;
    let grandTotalWithGst = 0;
    let grandTotalGstAmount = 0;
    let cogsTotalBase = 0;

    for (const m of machines) {
      const machine = await Machine.findById(m.machineId)
        .populate("category", "name")
        .populate("division", "name")
        .session(session);
      if (!machine) return abort(404, `Machine "${m.machineId}" not found`);
      if (machine.status === "Inactive") return abort(400, `Machine "${machine.name}" is inactive`);

      const isParts = machine.category?._id?.toString() !== PRODUCT_CATEGORY_ID;
      const discountPct = Number(m.discountPercentage) || 0;
      const sellingPriceWithGst = Math.round(m.sellingPriceWithGst * 100) / 100;
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

      const getMachineEntry = (code, field) => {
        for (const doc of purchaseDocs) {
          for (const me of doc.machines) {
            if (me.machineId?.toString() !== machine._id.toString()) continue;
            const found = (me[field] || []).find(e =>
              (field === "serialNumbers" ? e.serialNumber : e.partCode)?.toUpperCase() === code.toUpperCase()
            );
            if (found) return me.buyingPriceBase ?? 0;
          }
        }
        return 0;
      };

      if (isParts) {
        // FIFO: find the first purchase doc (oldest) where availableParts >= quantity
        let chosenPurchaseDocId = null;
        let chosenBuyingPriceBase = 0;
        let chosenPartCode = "";

        for (const doc of purchaseDocs) {
          for (const me of doc.machines) {
            if (me.machineId?.toString() !== machine._id.toString()) continue;
            if ((me.availableParts || 0) >= m.quantity) {
              chosenPurchaseDocId = doc._id;
              chosenBuyingPriceBase = me.buyingPriceBase ?? 0;
              chosenPartCode = me.partCode || "";
              break;
            }
          }
          if (chosenPurchaseDocId) break;
        }

        if (!chosenPurchaseDocId) {
          return abort(400, `Machine "${machine.name}": insufficient available parts in stock for quantity ${m.quantity}`);
        }

        cogsTotalBase = Math.round((cogsTotalBase + (chosenBuyingPriceBase * m.quantity)) * 100) / 100;
        entryData.partCodes = { partCode: chosenPartCode, buyingPriceBase: chosenBuyingPriceBase };

        // Store chosen purchase doc info for stock deduction after sale is created
        entryData._chosenPurchaseDocId = chosenPurchaseDocId.toString();
      } else {
        entryData.serialNumbers = await Promise.all((m.serialNumbers || []).map(async (sEntry) => {
          let contractType = null;
          let pagesCategories = [];

          // Contract type is optional now
          if (sEntry.contractTypeId) {
            const ct = await ContractType.findById(sEntry.contractTypeId).session(session);
            if (!ct) throw new Error(`Contract type \"${sEntry.contractTypeId}\" not found`);
            if (ct.status === "Inactive") throw new Error(`Contract type \"${ct.name}\" is inactive`);
            const validFrom = new Date(sEntry.validFrom);
            const validTo = new Date(sEntry.validTo);
            if (isNaN(validFrom.getTime())) throw new Error(`Invalid validFrom for serial ${sEntry.serialNumber}`);
            if (isNaN(validTo.getTime())) throw new Error(`Invalid validTo for serial ${sEntry.serialNumber}`);
            if (validTo <= validFrom) throw new Error(`validTo must be after validFrom for serial ${sEntry.serialNumber}`);

            if (TSS_CONTRACT_TYPE_ID && ct._id.toString() === TSS_CONTRACT_TYPE_ID) {
              pagesCategories = await Promise.all((sEntry.pagesCategories || []).map(async (pc) => {
                const cat = await PagesCategory.findById(pc.pagesCategoryId).session(session);
                if (!cat) throw new Error(`Pages category \"${pc.pagesCategoryId}\" not found`);
                if (cat.status === "Inactive") throw new Error(`Pages category \"${cat.name}\" is inactive`);
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

          const bp = getMachineEntry(sEntry.serialNumber, "serialNumbers");
          cogsTotalBase = Math.round((cogsTotalBase + bp) * 100) / 100;

          return {
            serialNumber: sEntry.serialNumber.trim(),
            buyingPriceBase: bp,
            minCopies: Number(sEntry.minCopies) || 0,
            contractType,
            pagesCategories,
          };
        }));
      }

      machineEntries.push(entryData);
    }

    const { currentPaymentStatus, paidAmount: rawPaidAmount, paymentDate, paymentMethod, companyId, processedBy } = req.body;
    let paidAmount = 0;
    let remainingAmount = grandTotalWithGst;
    let finalPaymentStatus = currentPaymentStatus || "Unpaid";

    // If grandTotalWithGst is 0, don't store payment fields at all
    if (grandTotalWithGst === 0) {
      paidAmount = 0;
      remainingAmount = 0;
      finalPaymentStatus = null; // Don't store payment status if total is 0
    } else {
      // Normal payment logic when grandTotalWithGst > 0
      if (finalPaymentStatus === "Paid") {
        paidAmount = grandTotalWithGst;
        remainingAmount = 0;
      } else if (finalPaymentStatus === "Partial-Paid") {
        paidAmount = Math.round(Number(rawPaidAmount) * 100) / 100;
        if (paidAmount >= grandTotalWithGst) return abort(400, "paidAmount must be less than grandTotalWithGst for Partial-Paid");
        remainingAmount = Math.round((grandTotalWithGst - paidAmount) * 100) / 100;
      }
    }

    const [sale] = await SoldMachine.create([{ invoiceNumber, customerInfo, machines: machineEntries, grandTotalBase, grandTotalWithGst, grandTotalGstAmount, cogsTotalBase, currentPaymentStatus: finalPaymentStatus, paidAmount, remainingAmount, processedBy: Array.isArray(processedBy) ? processedBy.filter(id => mongoose.isValidObjectId(id)) : [] }], { session });

    let transactionId = null;
    if (finalPaymentStatus && (finalPaymentStatus === "Paid" || finalPaymentStatus === "Partial-Paid")) {
      const [transaction] = await PaymentTransaction.create([{ soldMachineId: sale._id, amount: paidAmount, paymentDate: new Date(paymentDate), paymentMethod }], { session });
      transactionId = transaction._id;
    }

    // ── Deduct currentStock from Machine ──
    for (const e of machineEntries) {
      const machine = await Machine.findById(e.machineId).session(session);
      const newStock = Math.max(0, machine.currentStock - e.quantity);
      const stockStatus = newStock === 0 ? "Out of Stock" : machine.lowStockThreshold === -1 ? "In Stock" : newStock <= machine.lowStockThreshold ? "Low Stock" : "In Stock";
      await Machine.updateOne({ _id: e.machineId }, { $set: { currentStock: newStock, stockStatus } }, { session });
    }

    // ── Mark serial numbers as sold in PurchasedMachine ──
    for (const sn of allSerialNumbers) {
      await PurchasedMachine.updateOne(
        { "machines.serialNumbers.serialNumber": sn },
        { $set: { "machines.$[outer].serialNumbers.$[inner].status": "sold" } },
        { arrayFilters: [{ "outer.serialNumbers.serialNumber": sn }, { "inner.serialNumber": sn }], session }
      );
    }

    // ── Deduct availableParts / increment soldParts on chosen purchase doc for parts machines ──
    for (const e of machineEntries) {
      if (!e._chosenPurchaseDocId) continue;
      await PurchasedMachine.updateOne(
        { _id: e._chosenPurchaseDocId, "machines.machineId": e.machineId },
        {
          $inc: {
            "machines.$.availableParts": -e.quantity,
            "machines.$.soldParts": e.quantity,
          },
        },
        { session }
      );
      // remove internal field before saving
      delete e._chosenPurchaseDocId;
    }

    // ── Inventory log ──
    await InventoryLog.create(
      [{
        action: "sold",
        customerInfo,
        soldId: sale._id,
        machines: machineEntries.map((e) => ({
          machineId: e.machineId,
          machineName: e.machineName,
          modelNumber: e.modelNumber,
          categoryId: e.categoryId,
          category: e.category,
          divisionId: e.divisionId,
          division: e.division,
          quantity: e.quantity,
          serialNumbers: (e.serialNumbers || []).map(s => s.serialNumber),
          partCodes: e.partCodes ? [e.partCodes.partCode] : [],
        })),
      }],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    let receiptUrl = null;
    let invoiceFilePath = null;
    let invoiceFileName = null;
    let receiptFilePath = null;
    let receiptFileName = null;
    let receiptNumber = null;

    // ── Generate sales invoice PDF first (so invoiceNumber is available for receipt) ──
    // Skip invoice/receipt if grandTotalWithGst is 0
    let saleInvoiceNumber = invoiceNumber;
    if (companyId && grandTotalWithGst > 0) {
      try {
        const company = await Company.findById(companyId).lean();
        if (company) {
          const cgstNum = gstConfig?.cgst || 0;
          const sgstNum = gstConfig?.sgst || 0;
          const igstNum = gstConfig?.igst || 0;

          const companyInfo = {
            companyId: company._id,
            name: company.name,
            tagline: company.tagline || "",
            address: company.address,
            phone: company.phone,
            email: company.email,
            gstNumber: company.gstNumber,
            bankAccountNumber: company.bankAccountNumber || "",
            bankName: company.bankName || "",
            ifscCode: company.ifscCode || "",
            bankBranch: company.bankBranch || "",
            qrCode: company.qrCode || "",
          };

          const cgstAmount = parseFloat(((grandTotalBase * cgstNum) / 100).toFixed(2));
          const sgstAmount = parseFloat(((grandTotalBase * sgstNum) / 100).toFixed(2));
          const igstAmount = parseFloat(((grandTotalBase * igstNum) / 100).toFixed(2));
          // Use the already-stored grandTotalWithGst (accumulated per machine line via Math.round)
          // instead of recalculating from grandTotalBase to avoid rounding discrepancy
          const invoiceGrandTotalWithGst = grandTotalWithGst;

          const invoiceLogoUrl = process.env.INVOICE_LOGO_URL || "";
          const invoiceLogoText = process.env.INVOICE_LOGO_TEXT || "";
          const formatNum = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          const d = new Date(sale.createdAt);
          const invoiceDate = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

          const invoiceTemplatePath = path.join(__dirname, "../../../invoicesExamples/sales-invoice.html");
          let invoiceHtml = await fs.readFile(invoiceTemplatePath, "utf-8");

          invoiceHtml = invoiceHtml
            .replace(/{{invoiceNumber}}/g, saleInvoiceNumber)
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
            .replace(/{{customerName}}/g, customerInfo.name)
            .replace(/{{customerAddress}}/g, customerInfo.address || "")
            .replace(/{{customerUniqueId}}/g, customerInfo.customerUniqueId || "")
            .replace(/{{customerZone}}/g, customerInfo.zone || "")
            .replace(/{{customerGst}}/g, customerInfo.gstNumber || "")
            .replace(/{{customerPORef}}/g, customerInfo.customerPORef || "")
            .replace(/{{grandTotalBase}}/g, formatNum(grandTotalBase))
            .replace(/{{cgstPercent}}/g, cgstNum)
            .replace(/{{cgstAmount}}/g, formatNum(cgstAmount))
            .replace(/{{sgstPercent}}/g, sgstNum)
            .replace(/{{sgstAmount}}/g, formatNum(sgstAmount))
            .replace(/{{igstPercent}}/g, igstNum)
            .replace(/{{igstAmount}}/g, formatNum(igstAmount))
            .replace(/{{grandTotalWithGst}}/g, formatNum(invoiceGrandTotalWithGst));

          invoiceHtml = cgstNum > 0 ? invoiceHtml.replace(/{{#if cgst}}([\.\s\S]*?){{\/if}}/g, "$1") : invoiceHtml.replace(/{{#if cgst}}[\.\s\S]*?{{\/if}}/g, "");
          invoiceHtml = sgstNum > 0 ? invoiceHtml.replace(/{{#if sgst}}([\.\s\S]*?){{\/if}}/g, "$1") : invoiceHtml.replace(/{{#if sgst}}[\.\s\S]*?{{\/if}}/g, "");
          invoiceHtml = igstNum > 0 ? invoiceHtml.replace(/{{#if igst}}([\.\s\S]*?){{\/if}}/g, "$1") : invoiceHtml.replace(/{{#if igst}}[\.\s\S]*?{{\/if}}/g, "");
          invoiceHtml = company.tagline ? invoiceHtml.replace(/{{#if companyTagline}}([\.\s\S]*?){{\/if}}/g, "$1") : invoiceHtml.replace(/{{#if companyTagline}}[\.\s\S]*?{{\/if}}/g, "");
          invoiceHtml = company.qrCode ? invoiceHtml.replace(/{{#if qrCode}}([\.\s\S]*?){{\/if}}/g, "$1") : invoiceHtml.replace(/{{#if qrCode}}[\.\s\S]*?{{\/if}}/g, "");
          invoiceHtml = invoiceLogoUrl ? invoiceHtml.replace(/{{#if invoiceLogoUrl}}([\.\s\S]*?){{\/if}}/g, "$1") : invoiceHtml.replace(/{{#if invoiceLogoUrl}}[\.\s\S]*?{{\/if}}/g, "");
          invoiceHtml = invoiceLogoText ? invoiceHtml.replace(/{{#if invoiceLogoText}}([\.\s\S]*?){{\/if}}/g, "$1") : invoiceHtml.replace(/{{#if invoiceLogoText}}[\.\s\S]*?{{\/if}}/g, "");

          const machineRowsMatch = invoiceHtml.match(/{{#each machines}}([\.\s\S]*?){{\/each}}/);
          if (machineRowsMatch) {
            const rowTemplate = machineRowsMatch[1];
            const machineRows = machineEntries.map((m, idx) => {
              const isParts = m.categoryId?.toString() !== PRODUCT_CATEGORY_ID;
              const serials = isParts
                ? (m.partCodes ? [m.partCodes.partCode] : [])
                : (m.serialNumbers || []).map(s => s.serialNumber);
              const serialLabel = isParts ? "P/C" : "S/N";
              let row = rowTemplate
                .replace(/{{srNo}}/g, idx + 1)
                .replace(/{{machineName}}/g, m.machineName)
                .replace(/{{hsnCode}}/g, m.hsnCode || "")
                .replace(/{{serialLabel}}/g, serialLabel)
                .replace(/{{quantity}}/g, m.quantity)
                .replace(/{{sellingPriceBase}}/g, formatNum(m.sellingPriceBase))
                .replace(/{{discountPercentage}}/g, m.discount.percentage)
                .replace(/{{discountAmount}}/g, formatNum(m.discount.amount))
                .replace(/{{netSellingPriceBase}}/g, formatNum(m.netSellingPriceBase))
                .replace(/{{sellingTotalBase}}/g, formatNum(m.sellingTotalBase));
              row = m.modelNumber
                ? row.replace(/{{#if modelNumber}}([\.\s\S]*?){{\/if}}/g, "$1").replace(/{{modelNumber}}/g, m.modelNumber)
                : row.replace(/{{#if modelNumber}}[\.\s\S]*?{{\/if}}/g, "");
              const serialsStr = serials.join(", ");
              row = serialsStr
                ? row.replace(/{{#if serials}}([\.\s\S]*?){{\/if}}/g, "$1").replace(/{{serials}}/g, serialsStr)
                : row.replace(/{{#if serials}}[\.\s\S]*?{{\/if}}/g, "");
              return row;
            }).join("");
            invoiceHtml = invoiceHtml.replace(/{{#each machines}}[\.\s\S]*?{{\/each}}/, machineRows);
          }

          const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
            import("puppeteer"),
            import("@sparticuz/chromium"),
          ]);
          const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || await chromium.executablePath();
          await fs.mkdir(DOCS_DIR, { recursive: true });
          invoiceFileName = `sales_invoice_${saleInvoiceNumber}_${Date.now()}.pdf`;
          invoiceFilePath = path.join(DOCS_DIR, invoiceFileName);
          const invoiceFilename = invoiceFileName;
          const invoiceFilepath = invoiceFilePath;

          const browser = await puppeteer.launch({
            executablePath,
            headless: true,
            args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
          });
          const invoicePage = await browser.newPage();
          await invoicePage.setContent(invoiceHtml, { waitUntil: "networkidle0" });
          await invoicePage.pdf({ path: invoiceFilepath, format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
          await browser.close();

          const invoiceUrl = `${process.env.BACKEND_URL}/app/cloud/documents/${invoiceFilename}`;
          await SoldMachine.findByIdAndUpdate(sale._id, {
            invoiceNumber: saleInvoiceNumber,
            companyInfo,
            invoiceUrl,
            cgst: { percent: cgstNum, amount: cgstAmount },
            sgst: { percent: sgstNum, amount: sgstAmount },
            igst: { percent: igstNum, amount: igstAmount },
          });
        }
      } catch (invoiceErr) {
        console.error("Invoice generation failed (non-fatal):", invoiceErr.message);
      }
    }

    // ── Generate payment receipt PDF (after invoice so invoiceNumber is available) ──
    if (transactionId && companyId) {
      try {
        const company = await Company.findById(companyId).lean();
        if (company) {
          const receiptCounter = await Counter.findByIdAndUpdate(
            "paymentReceipt",
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
          );
          receiptNumber = `REC-${receiptCounter.seq}`;

          const d = new Date(paymentDate);
          const receiptDate = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

          const formatNum = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const invoiceLogoUrl = process.env.INVOICE_LOGO_URL || "";
          const invoiceLogoText = process.env.INVOICE_LOGO_TEXT || "";

          const templatePath = path.join(__dirname, "../../../invoicesExamples/payment-receipt.html");
          let html = await fs.readFile(templatePath, "utf-8");

          html = html
            .replace(/{{receiptNumber}}/g, receiptNumber)
            .replace(/{{receiptDate}}/g, receiptDate)
            .replace(/{{customerName}}/g, customerInfo.name || "")
            .replace(/{{customerAddress}}/g, customerInfo.address || "")
            .replace(/{{amountInWords}}/g, numberToWords(paidAmount))
            .replace(/{{amountReceived}}/g, formatNum(paidAmount))
            .replace(/{{paymentMethod}}/g, paymentMethod || "")
            .replace(/{{invoiceNumber}}/g, saleInvoiceNumber)
            .replace(/{{companyName}}/g, company.name || "")
            .replace(/{{companyTagline}}/g, company.tagline || "")
            .replace(/{{companyAddress}}/g, company.address || "")
            .replace(/{{companyPhone}}/g, company.phone || "")
            .replace(/{{companyEmail}}/g, company.email || "")
            .replace(/{{invoiceLogoUrl}}/g, invoiceLogoUrl)
            .replace(/{{invoiceLogoText}}/g, invoiceLogoText);

          html = company.tagline
            ? html.replace(/{{#if companyTagline}}([\.\s\S]*?){{\/if}}/g, "$1")
            : html.replace(/{{#if companyTagline}}[\.\s\S]*?{{\/if}}/g, "");
          html = invoiceLogoUrl
            ? html.replace(/{{#if invoiceLogoUrl}}([\.\s\S]*?){{\/if}}/g, "$1")
            : html.replace(/{{#if invoiceLogoUrl}}[\.\s\S]*?{{\/if}}/g, "");
          html = invoiceLogoText
            ? html.replace(/{{#if invoiceLogoText}}([\.\s\S]*?){{\/if}}/g, "$1")
            : html.replace(/{{#if invoiceLogoText}}[\.\s\S]*?{{\/if}}/g, "");
          html = currentPaymentStatus === "Paid"
            ? html.replace(/{{#if isPaid}}([\.\s\S]*?){{\/if}}/g, "$1")
            : html.replace(/{{#if isPaid}}[\.\s\S]*?{{\/if}}/g, "");
          html = currentPaymentStatus === "Partial-Paid"
            ? html.replace(/{{#if isPartialPaid}}([\.\s\S]*?){{\/if}}/g, "$1")
            : html.replace(/{{#if isPartialPaid}}[\.\s\S]*?{{\/if}}/g, "");

          const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
            import("puppeteer"),
            import("@sparticuz/chromium"),
          ]);
          const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || await chromium.executablePath();
          await fs.mkdir(DOCS_DIR, { recursive: true });
          receiptFileName = `payment_receipt_${receiptNumber}_${Date.now()}.pdf`;
          receiptFilePath = path.join(DOCS_DIR, receiptFileName);

          const browser = await puppeteer.launch({
            executablePath,
            headless: true,
            args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
          });
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: "networkidle0" });
          await page.pdf({ path: receiptFilePath, format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
          await browser.close();

          receiptUrl = `${process.env.BACKEND_URL}/app/cloud/documents/${receiptFileName}`;
          await PaymentTransaction.findByIdAndUpdate(transactionId, { receiptNumber, receiptUrl });
        }
      } catch (receiptErr) {
        console.error("Receipt generation failed (non-fatal):", receiptErr.message);
      }
    }

    // ── Send sale confirmation email ──
    if (customerInfo.email) {
      try {
        const d = new Date(sale.createdAt);
        const saleDate = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
        const company = companyId ? await Company.findById(companyId).lean() : null;
        await sendSaleConfirmationEmail({
          customerName:    customerInfo.name,
          customerEmail:   customerInfo.email,
          invoiceNumber:   saleInvoiceNumber,
          saleDate,
          grandTotal:      grandTotalWithGst,
          paidAmount,
          remainingAmount,
          paymentStatus:   currentPaymentStatus,
          paymentMethod:   req.body.paymentMethod || "",
          hasReceipt:      !!receiptUrl,
          receiptNumber:   receiptNumber || "",
          invoiceFileName,
          invoiceFilePath,
          receiptFileName,
          receiptFilePath,
          companyName:     company?.name || "",
          companyEmail:    company?.email || "",
          companyPhone:    company?.phone || "",
        });
      } catch (emailErr) {
        console.error("Sale confirmation email failed (non-fatal):", emailErr.message);
      }
    }

    res.status(201).json({ success: true, data: { _id: sale._id, currentPaymentStatus: sale.currentPaymentStatus, paidAmount: sale.paidAmount, remainingAmount: sale.remainingAmount, receiptUrl } });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: err.message });
  }
};

const renewContract = async (req, res) => {
  try {
    const { serialNumber, modelNumber, newContractTypeId, newValidFrom, newValidTo } = req.body;

    if (!serialNumber?.trim())
      return res.status(400).json({ success: false, message: "serialNumber is required" });
    if (!modelNumber?.trim())
      return res.status(400).json({ success: false, message: "modelNumber is required" });
    if (!mongoose.isValidObjectId(newContractTypeId))
      return res.status(400).json({ success: false, message: "Invalid newContractTypeId" });

    // Parse date strings as IST midnight (input is YYYY-MM-DD from date input)
    const toISTMidnight = (dateStr) => {
      const [y, m, d] = dateStr.split("-").map(Number);
      // IST is UTC+5:30, so IST midnight = UTC 18:30 previous day
      return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - (5.5 * 60 * 60 * 1000));
    };

    const validFrom = toISTMidnight(newValidFrom);
    const validTo   = toISTMidnight(newValidTo);
    if (isNaN(validFrom.getTime())) return res.status(400).json({ success: false, message: "Invalid newValidFrom" });
    if (isNaN(validTo.getTime()))   return res.status(400).json({ success: false, message: "Invalid newValidTo" });
    if (validTo <= validFrom)       return res.status(400).json({ success: false, message: "newValidTo must be after newValidFrom" });

    // Today midnight in IST
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    nowIST.setHours(0, 0, 0, 0);
    const todayISTMidnightUTC = new Date(nowIST.getTime() - (5.5 * 60 * 60 * 1000));

    if (validFrom < todayISTMidnightUTC)
      return res.status(400).json({ success: false, message: "newValidFrom cannot be a past date" });

    const ct = await ContractType.findOne({ _id: newContractTypeId, status: "Active" });
    if (!ct) return res.status(404).json({ success: false, message: "Active contract type not found" });

    const sn = serialNumber.trim();
    const mn = modelNumber.trim();

    // Check existing contract — block renewal if not expired in IST
    const soldRecord = await SoldMachine.findOne({
      "machines.serialNumbers.serialNumber": sn,
      "machines.modelNumber": mn,
    });
    if (!soldRecord) return res.status(404).json({ success: false, message: "Serial number and model number not found in any sale" });

    let existingValidTo = null;
    outer: for (const machine of soldRecord.machines) {
      if (machine.modelNumber !== mn) continue;
      for (const entry of (machine.serialNumbers || [])) {
        if (entry.serialNumber === sn) {
          existingValidTo = entry.contractType?.validTo ? new Date(entry.contractType.validTo) : null;
          break outer;
        }
      }
    }

    if (existingValidTo) {
      const existingValidToIST = new Date(new Date(existingValidTo).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      existingValidToIST.setHours(0, 0, 0, 0);
      if (nowIST <= existingValidToIST)
        return res.status(400).json({ success: false, message: "Cannot renew an active contract" });
    }

    const result = await SoldMachine.updateOne(
      { "machines.serialNumbers.serialNumber": sn, "machines.modelNumber": mn },
      {
        $set: {
          "machines.$[outer].serialNumbers.$[inner].contractType": {
            contractTypeId: ct._id,
            name: ct.name,
            code: ct.code,
            freeService: ct.freeService,
            freeParts: ct.freeParts,
            validFrom,
            validTo,
          },
        },
      },
      { arrayFilters: [{ "outer.modelNumber": mn, "outer.serialNumbers.serialNumber": sn }, { "inner.serialNumber": sn }] }
    );

    if (result.modifiedCount === 0)
      return res.status(404).json({ success: false, message: "Serial number not found in any sale" });

    res.status(200).json({ success: true, message: "Contract renewed successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const addContract = async (req, res) => {
  try {
    const { serialNumber, modelNumber, contractTypeId, validFrom, validTo } = req.body;

    if (!serialNumber?.trim())
      return res.status(400).json({ success: false, message: "serialNumber is required" });
    if (!modelNumber?.trim())
      return res.status(400).json({ success: false, message: "modelNumber is required" });
    if (!mongoose.isValidObjectId(contractTypeId))
      return res.status(400).json({ success: false, message: "Invalid contractTypeId" });

    // Parse date strings as IST midnight (input is YYYY-MM-DD from date input)
    const toISTMidnight = (dateStr) => {
      const [y, m, d] = dateStr.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - (5.5 * 60 * 60 * 1000));
    };

    const validFromDate = toISTMidnight(validFrom);
    const validToDate   = toISTMidnight(validTo);
    if (isNaN(validFromDate.getTime())) return res.status(400).json({ success: false, message: "Invalid validFrom" });
    if (isNaN(validToDate.getTime()))   return res.status(400).json({ success: false, message: "Invalid validTo" });
    if (validToDate <= validFromDate)   return res.status(400).json({ success: false, message: "validTo must be after validFrom" });

    // Today midnight in IST
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    nowIST.setHours(0, 0, 0, 0);
    const todayISTMidnightUTC = new Date(nowIST.getTime() - (5.5 * 60 * 60 * 1000));

    if (validFromDate < todayISTMidnightUTC)
      return res.status(400).json({ success: false, message: "validFrom cannot be a past date" });

    const ct = await ContractType.findOne({ _id: contractTypeId, status: "Active" });
    if (!ct) return res.status(404).json({ success: false, message: "Active contract type not found" });

    const sn = serialNumber.trim();
    const mn = modelNumber.trim();

    // Check if serial number + model number exists and doesn't already have a contract
    const soldRecord = await SoldMachine.findOne({
      "machines.serialNumbers.serialNumber": sn,
      "machines.modelNumber": mn,
    });
    if (!soldRecord) return res.status(404).json({ success: false, message: "Serial number and model number not found in any sale" });

    let existingContract = null;
    outer: for (const machine of soldRecord.machines) {
      if (machine.modelNumber !== mn) continue;
      for (const entry of (machine.serialNumbers || [])) {
        if (entry.serialNumber === sn) {
          existingContract = entry.contractType;
          break outer;
        }
      }
    }

    if (existingContract) {
      return res.status(400).json({ success: false, message: "Serial number already has a contract. Use renew contract instead." });
    }

    const result = await SoldMachine.updateOne(
      { "machines.serialNumbers.serialNumber": sn, "machines.modelNumber": mn },
      {
        $set: {
          "machines.$[outer].serialNumbers.$[inner].contractType": {
            contractTypeId: ct._id,
            name: ct.name,
            code: ct.code,
            freeService: ct.freeService,
            freeParts: ct.freeParts,
            validFrom: validFromDate,
            validTo: validToDate,
          },
        },
      },
      { arrayFilters: [{ "outer.modelNumber": mn, "outer.serialNumbers.serialNumber": sn }, { "inner.serialNumber": sn }] }
    );

    if (result.modifiedCount === 0)
      return res.status(404).json({ success: false, message: "Serial number not found in any sale" });

    res.status(200).json({ success: true, message: "Contract added successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const exportToExcel = async (req, res) => {
  try {
    const { search, customerId, zoneId, category, division, machineId, fromDate, toDate, status } = req.query;
    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { "machines.machineName": { $regex: escaped, $options: "i" } },
          { "machines.modelNumber": { $regex: escaped, $options: "i" } },
          { "machines.serialNumbers.serialNumber": { $regex: escaped, $options: "i" } },
          { "machines.partCode": { $regex: escaped, $options: "i" } },
          { "machines.partCodes.partCode": { $regex: escaped, $options: "i" } },
          { invoiceNumber: { $regex: escaped, $options: "i" } },
          { "customerInfo.name": { $regex: escaped, $options: "i" } },
          { "customerInfo.phone": { $regex: escaped, $options: "i" } },
        ];
      }
    }

    if (customerId && mongoose.isValidObjectId(customerId))
      query["customerInfo.customerId"] = customerId;

    if (status && ["active", "cancelled"].includes(status))
      query.status = status;

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
      if (toDate) query.createdAt.$lte = parseIST(toDate, true);
    }

    const sales = await SoldMachine.find(query).sort({ createdAt: -1 }).lean();

    const COLS = ["Invoice No", "Status", "Customer Name", "Customer Phone", "Machine Name", "Model Number", "Category", "Division", "Quantity", "Selling Price", "Discounted Selling Price", "Selling Total", "Serial / Part Code", "Contract Type", "Contract Code", "Free Service", "Free Parts", "Valid From", "Valid To", "Sale Date", "Sale Time"];

    const rows = [];
    const merges = [];

    sales.forEach((sale) => {
      const date = new Date(sale.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
      const time = new Date(sale.createdAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

      const saleStartRow = rows.length;

      sale.machines.forEach((m) => {
        const isParts = !!(m.partCodes && m.partCodes.partCode);
        const codes = isParts ? [m.partCodes] : (m.serialNumbers || []);
        const machineStartRow = rows.length;

        const codeList = codes.length > 0 ? codes : [null];
        codeList.forEach((entry, ci) => {
          const code = entry ? (isParts ? entry.partCode : entry.serialNumber) : "";
          const ct = entry ? entry.contractType : null;
          const isMachineFirst = ci === 0;
          const isSaleFirst = isMachineFirst && machineStartRow === saleStartRow;
          rows.push({
            "Invoice No": isSaleFirst ? sale.invoiceNumber || "" : "",
            "Status": isSaleFirst ? (sale.status === "cancelled" ? "Cancelled" : "Active") : "",
            "Customer Name": isSaleFirst ? sale.customerInfo.name || "" : "",
            "Customer Phone": isSaleFirst ? sale.customerInfo.phone || "" : "",
            "Machine Name": isMachineFirst ? m.machineName || "" : "",
            "Model Number": isMachineFirst ? m.modelNumber || "" : "",
            "Category": isMachineFirst ? m.category || "" : "",
            "Division": isMachineFirst ? m.division || "" : "",
            "Quantity": isMachineFirst ? m.quantity : "",
            "Selling Price": isMachineFirst ? m.sellingPrice : "",
            "Discounted Selling Price": isMachineFirst ? (m.discountedSellingPrice ?? "") : "",
            "Selling Total": isMachineFirst ? m.sellingTotal : "",
            "Serial / Part Code": code,
            "Contract Type": ct?.name || "",
            "Contract Code": ct?.code || "",
            "Free Service": ct ? (ct.freeService ? "Yes" : "No") : "",
            "Free Parts": ct ? (ct.freeParts ? "Yes" : "No") : "",
            "Valid From": ct?.validFrom ? new Date(ct.validFrom).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "",
            "Valid To": ct?.validTo ? new Date(ct.validTo).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "",
            "Sale Date": isSaleFirst ? date : "",
            "Sale Time": isSaleFirst ? time : "",
          });
        });
        const sheetMachineStart = machineStartRow + 1; // +1 for header row
        const sheetMachineEnd = rows.length; // rows.length - 1 + 1 for header
        if (sheetMachineStart < sheetMachineEnd) {
          ["Machine Name", "Model Number", "Category", "Division", "Quantity", "Selling Price", "Discounted Selling Price", "Selling Total"].forEach((col) => {
            const c = COLS.indexOf(col);
            merges.push({ s: { r: sheetMachineStart, c }, e: { r: sheetMachineEnd, c } });
          });
        }
      });

      const saleEndRow = rows.length - 1;
      const sheetSaleStart = saleStartRow + 1;
      const sheetSaleEnd = saleEndRow + 1;
      if (sheetSaleStart < sheetSaleEnd) {
        ["Invoice No", "Status", "Customer Name", "Customer Phone", "Sale Date", "Sale Time"].forEach((col) => {
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
    const unique = new Set(trimmed.map((s) => s.toUpperCase()));
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
    const unique = new Set(trimmed.map((c) => c.toUpperCase()));
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

const generateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid sale ID" });

    const { companyId, customerPORef } = req.body;

    if (!mongoose.isValidObjectId(companyId))
      return res.status(400).json({ success: false, message: "Invalid companyId" });

    const sale = await SoldMachine.findById(id);
    if (!sale) return res.status(404).json({ success: false, message: "Sale not found" });

    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ success: false, message: "Company not found" });

    // Auto-fetch GST config
    const gstConfig = await GstConfig.findOne().lean();
    const cgstNum = gstConfig?.cgst || 0;
    const sgstNum = gstConfig?.sgst || 0;
    const igstNum = gstConfig?.igst || 0;

    // Save customerPORef if provided
    if (customerPORef !== undefined) {
      sale.customerInfo.customerPORef = String(customerPORef).trim();
      await sale.save();
    }

    const counter = await Counter.findByIdAndUpdate(
      "salesInvoice",
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const invoiceNumber = `INV-${counter.seq}`;

    const companyInfo = {
      companyId: company._id,
      name: company.name,
      tagline: company.tagline || "",
      address: company.address,
      phone: company.phone,
      email: company.email,
      gstNumber: company.gstNumber,
      bankAccountNumber: company.bankAccountNumber || "",
      bankName: company.bankName || "",
      ifscCode: company.ifscCode || "",
      bankBranch: company.bankBranch || "",
      qrCode: company.qrCode || "",
    };

    const invoiceLogoUrl = process.env.INVOICE_LOGO_URL || "";
    const invoiceLogoText = process.env.INVOICE_LOGO_TEXT || "";

    const templatePath = path.join(__dirname, "../../../invoicesExamples/sales-invoice.html");
    let html = await fs.readFile(templatePath, "utf-8");

    const formatNum = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const basicTotal = sale.grandTotalBase;
    const cgstAmount = parseFloat(((basicTotal * cgstNum) / 100).toFixed(2));
    const sgstAmount = parseFloat(((basicTotal * sgstNum) / 100).toFixed(2));
    const igstAmount = parseFloat(((basicTotal * igstNum) / 100).toFixed(2));
    // Use the stored grandTotalWithGst from DB (accumulated per machine line via Math.round)
    // instead of recomputing from grandTotalBase to avoid rounding discrepancy
    const invoiceGrandTotal = sale.grandTotalWithGst;

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
      .replace(/{{customerPORef}}/g, sale.customerInfo.customerPORef || "")
      .replace(/{{grandTotalBase}}/g, formatNum(basicTotal))
      .replace(/{{cgstPercent}}/g, cgstNum)
      .replace(/{{cgstAmount}}/g, formatNum(cgstAmount))
      .replace(/{{sgstPercent}}/g, sgstNum)
      .replace(/{{sgstAmount}}/g, formatNum(sgstAmount))
      .replace(/{{igstPercent}}/g, igstNum)
      .replace(/{{igstAmount}}/g, formatNum(igstAmount))
      .replace(/{{grandTotalWithGst}}/g, formatNum(invoiceGrandTotal));

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
        const isParts = m.categoryId?.toString() !== PRODUCT_CATEGORY_ID;
        const serials = isParts
          ? (m.partCodes ? [m.partCodes.partCode] : [])
          : (m.serialNumbers || []).map(s => s.serialNumber);
        const serialLabel = isParts ? "P/C" : "S/N";
        const sellingPriceBase   = m.sellingPriceBase   ?? m.sellingPrice ?? 0;
        const discountPercentage = m.discount?.percentage ?? 0;
        const discountAmount     = m.discount?.amount     ?? 0;
        const netSellingPriceBase = m.netSellingPriceBase ?? m.discountedSellingPrice ?? sellingPriceBase;
        const sellingTotalBase   = m.sellingTotalBase    ?? m.sellingTotal ?? 0;
        let row = rowTemplate
          .replace(/{{srNo}}/g, idx + 1)
          .replace(/{{machineName}}/g, m.machineName)
          .replace(/{{hsnCode}}/g, m.hsnCode || "")
          .replace(/{{serialLabel}}/g, serialLabel)
          .replace(/{{quantity}}/g, m.quantity)
          .replace(/{{sellingPriceBase}}/g, formatNum(sellingPriceBase))
          .replace(/{{discountPercentage}}/g, discountPercentage)
          .replace(/{{discountAmount}}/g, formatNum(discountAmount))
          .replace(/{{netSellingPriceBase}}/g, formatNum(netSellingPriceBase))
          .replace(/{{sellingTotalBase}}/g, formatNum(sellingTotalBase));
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

    const invoiceUrl = `${process.env.BACKEND_URL}/app/cloud/documents/${filename}`;
    await SoldMachine.findByIdAndUpdate(id, {
      invoiceNumber, companyInfo, invoiceUrl,
      cgst: { percent: cgstNum, amount: cgstAmount },
      sgst: { percent: sgstNum, amount: sgstAmount },
      igst: { percent: igstNum, amount: igstAmount },
    });

    return res.status(200).json({ success: true, invoiceUrl, invoiceNumber });
  } catch (err) {
    console.error("Error generating invoice:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const customerOutstandingDue = async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!mongoose.isValidObjectId(customerId))
      return res.status(400).json({ success: false, message: "Invalid customerId" });

    const sales = await SoldMachine.find({
      "customerInfo.customerId": customerId,
      currentPaymentStatus: { $in: ["Unpaid", "Partial-Paid"] },
    })
      .select("invoiceNumber grandTotalWithGst paidAmount remainingAmount currentPaymentStatus createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const totalRemaining = sales.reduce((s, sale) => s + (sale.remainingAmount || 0), 0);

    res.status(200).json({
      success: true,
      data: sales.map((s) => ({
        _id: s._id,
        invoiceNumber: s.invoiceNumber || "",
        grandTotalWithGst: s.grandTotalWithGst,
        paidAmount: s.paidAmount,
        remainingAmount: s.remainingAmount,
        currentPaymentStatus: s.currentPaymentStatus,
        createdAt: s.createdAt,
      })),
      totalRemaining: Math.round(totalRemaining * 100) / 100,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const customerPaymentReceipts = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid sale ID" });

    const sale = await SoldMachine.findById(id).select("_id invoiceNumber").lean();
    if (!sale)
      return res.status(404).json({ success: false, message: "Sale not found" });

    const transactions = await PaymentTransaction.find({ soldMachineId: id })
      .select("amount paymentMethod paymentDate receiptNumber receiptUrl createdAt")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, data: transactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getContractExpiryStatus = async (req, res) => {
  try {
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const today = new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate());
    const days = parseInt(process.env.CONTRACT_EXPIRY_SOON_DAYS) || 30;
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
          const validToIST = new Date(new Date(ct.validTo).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
          const item = {
            machineName: machine.machineName,
            modelNumber: machine.modelNumber,
            serialNumber: sn.serialNumber,
            contractType: ct.name,
            validFrom: ct.validFrom,
            validTo: ct.validTo,
          };
          if (validToIST < today) customerMap[key].expired.push(item);
          else if (validToIST <= inNDays) customerMap[key].expiringSoon.push(item);
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

    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const today = new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate());
    const days = parseInt(process.env.CONTRACT_EXPIRY_SOON_DAYS) || 30;
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
          const validToIST = new Date(new Date(ct.validTo).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
          const item = {
            machineName: machine.machineName,
            serialNumber: sn.serialNumber,
            contractType: ct.name,
            validFrom: ct.validFrom,
            validTo: ct.validTo,
          };
          if (validToIST < today) {
            customerMap[key].expired.push(item);
          } else if (validToIST <= in30Days) {
            customerMap[key].expiringSoon.push(item);
          }
        }
      }
    }

    const results = { sent: 0, skipped: 0, failed: 0 };
    for (const entry of Object.values(customerMap)) {
      if (!entry.expired.length && !entry.expiringSoon.length) { results.skipped++; continue; }
      const result = await sendContractExpiryAlert({
        customerName: entry.name,
        customerEmail: entry.email,
        expiredItems: entry.expired,
        expiringSoonItems: entry.expiringSoon,
      });
      result.success ? results.sent++ : results.failed++;
    }

    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const addPayment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid sale ID" });

    const { paidAmount: rawPaidAmount, paymentMethod, paymentDate } = req.body;

    if (!rawPaidAmount || isNaN(Number(rawPaidAmount)) || Number(rawPaidAmount) <= 0)
      return res.status(400).json({ success: false, message: "paidAmount must be a positive number" });
    if (!["Cash", "Online"].includes(paymentMethod))
      return res.status(400).json({ success: false, message: "paymentMethod must be Cash or Online" });
    if (!paymentDate)
      return res.status(400).json({ success: false, message: "paymentDate is required" });

    const sale = await SoldMachine.findById(id);
    if (!sale) return res.status(404).json({ success: false, message: "Sale not found" });
    if (sale.currentPaymentStatus === "Paid")
      return res.status(400).json({ success: false, message: "Sale is already fully paid" });

    const incomingAmount = Math.round(Number(rawPaidAmount) * 100) / 100;
    if (incomingAmount > sale.remainingAmount)
      return res.status(400).json({ success: false, message: `paidAmount cannot exceed remaining amount of ₹${sale.remainingAmount}` });

    const newPaidAmount = Math.round((sale.paidAmount + incomingAmount) * 100) / 100;
    const newRemainingAmount = Math.round((sale.remainingAmount - incomingAmount) * 100) / 100;
    const newStatus = newRemainingAmount === 0 ? "Paid" : "Partial-Paid";

    await SoldMachine.findByIdAndUpdate(id, {
      paidAmount: newPaidAmount,
      remainingAmount: newRemainingAmount,
      currentPaymentStatus: newStatus,
    });

    const transaction = await PaymentTransaction.create({
      soldMachineId: sale._id,
      amount: incomingAmount,
      paymentDate: new Date(paymentDate),
      paymentMethod,
    });

    // ── Generate payment receipt PDF ──
    let receiptUrl = null;
    const companyId = sale.companyInfo?.companyId;
    if (companyId) {
      try {
        const company = await Company.findById(companyId).lean();
        if (company) {
          const receiptCounter = await Counter.findByIdAndUpdate(
            "paymentReceipt",
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
          );
          const receiptNumber = `REC-${receiptCounter.seq}`;

          const d = new Date(paymentDate);
          const receiptDate = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

          const formatNum = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const invoiceLogoUrl = process.env.INVOICE_LOGO_URL || "";
          const invoiceLogoText = process.env.INVOICE_LOGO_TEXT || "";

          const templatePath = path.join(__dirname, "../../../invoicesExamples/payment-receipt.html");
          let html = await fs.readFile(templatePath, "utf-8");

          html = html
            .replace(/{{receiptNumber}}/g, receiptNumber)
            .replace(/{{receiptDate}}/g, receiptDate)
            .replace(/{{customerName}}/g, sale.customerInfo.name || "")
            .replace(/{{customerAddress}}/g, sale.customerInfo.address || "")
            .replace(/{{amountInWords}}/g, numberToWords(incomingAmount))
            .replace(/{{amountReceived}}/g, formatNum(incomingAmount))
            .replace(/{{paymentMethod}}/g, paymentMethod || "")
            .replace(/{{invoiceNumber}}/g, sale.invoiceNumber || "")
            .replace(/{{companyName}}/g, company.name || "")
            .replace(/{{companyTagline}}/g, company.tagline || "")
            .replace(/{{companyAddress}}/g, company.address || "")
            .replace(/{{companyPhone}}/g, company.phone || "")
            .replace(/{{companyEmail}}/g, company.email || "")
            .replace(/{{invoiceLogoUrl}}/g, invoiceLogoUrl)
            .replace(/{{invoiceLogoText}}/g, invoiceLogoText);

          html = company.tagline
            ? html.replace(/{{#if companyTagline}}([\.\s\S]*?){{\/if}}/g, "$1")
            : html.replace(/{{#if companyTagline}}[\.\s\S]*?{{\/if}}/g, "");
          html = invoiceLogoUrl
            ? html.replace(/{{#if invoiceLogoUrl}}([\.\s\S]*?){{\/if}}/g, "$1")
            : html.replace(/{{#if invoiceLogoUrl}}[\.\s\S]*?{{\/if}}/g, "");
          html = invoiceLogoText
            ? html.replace(/{{#if invoiceLogoText}}([\.\s\S]*?){{\/if}}/g, "$1")
            : html.replace(/{{#if invoiceLogoText}}[\.\s\S]*?{{\/if}}/g, "");
          html = newStatus === "Paid"
            ? html.replace(/{{#if isPaid}}([\.\s\S]*?){{\/if}}/g, "$1")
            : html.replace(/{{#if isPaid}}[\.\s\S]*?{{\/if}}/g, "");
          html = newStatus === "Partial-Paid"
            ? html.replace(/{{#if isPartialPaid}}([\.\s\S]*?){{\/if}}/g, "$1")
            : html.replace(/{{#if isPartialPaid}}[\.\s\S]*?{{\/if}}/g, "");

          const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
            import("puppeteer"),
            import("@sparticuz/chromium"),
          ]);
          const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || await chromium.executablePath();
          await fs.mkdir(DOCS_DIR, { recursive: true });
          const filename = `payment_receipt_${receiptNumber}_${Date.now()}.pdf`;
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

          receiptUrl = `${process.env.BACKEND_URL}/app/cloud/documents/${filename}`;
          await PaymentTransaction.findByIdAndUpdate(transaction._id, { receiptNumber, receiptUrl });
        }
      } catch (receiptErr) {
        console.error("Receipt generation failed (non-fatal):", receiptErr.message);
      }
    }

    // ── Send payment received email ──
    if (sale.customerInfo?.email) {
      try {
        const d = new Date(paymentDate);
        const formattedPaymentDate = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
        const company = companyId ? await Company.findById(companyId).lean() : null;
        const receiptFilename = receiptUrl ? receiptUrl.split("/").at(-1) : null;
        await sendPaymentReceivedEmail({
          customerName:    sale.customerInfo.name,
          customerEmail:   sale.customerInfo.email,
          receiptNumber:   receiptFilename ? receiptFilename.split("_").slice(2, -1).join("_") : "",
          invoiceNumber:   sale.invoiceNumber || "",
          paymentDate:     formattedPaymentDate,
          paymentMethod,
          paidAmount:      incomingAmount,
          remainingAmount: newRemainingAmount,
          paymentStatus:   newStatus,
          receiptFileName: receiptFilename,
          receiptFilePath: receiptFilename ? path.join(DOCS_DIR, receiptFilename) : null,
          companyName:     company?.name || "",
          companyEmail:    company?.email || "",
          companyPhone:    company?.phone || "",
        });
      } catch (emailErr) {
        console.error("Payment received email failed (non-fatal):", emailErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      data: { currentPaymentStatus: newStatus, paidAmount: newPaidAmount, remainingAmount: newRemainingAmount, receiptUrl },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getSystemUsers = async (req, res) => {
  try {
    const AdminUser = require("../auth/admin.user.model");
    const { search, status, role, limit = 100 } = req.query;

    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { engineerId: { $regex: search, $options: "i" } },
      ];
    }
    
    if (status) {
      query.status = status;
    }
    
    if (role) {
      query.role = role;
    }

    const users = await AdminUser.find(query)
      .select("_id name email role engineerId status profilePhoto")
      .sort({ name: 1 })
      .limit(parseInt(limit));

    return res.status(200).json({
      success: true,
      data: users,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const cancelSale = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const abort = async (status, message) => {
      await session.abortTransaction();
      session.endSession();
      return res.status(status).json({ success: false, message });
    };

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return abort(400, "Invalid sale ID");

    const sale = await SoldMachine.findById(id).session(session);
    if (!sale)
      return abort(404, "Sale not found");

    if (sale.status === "cancelled")
      return abort(400, "Sale is already cancelled");

    const canCancel = await computeCanCancelSale(sale);
    if (!canCancel)
      return abort(400, "Cannot cancel this sale because some machines have active service calls");

    // ── Reverse stock for each machine ──
    for (const m of sale.machines) {
      const machine = await Machine.findById(m.machineId).session(session);
      if (!machine) continue;

      const newStock = machine.currentStock + m.quantity;
      const stockStatus = newStock === 0
        ? "Out of Stock"
        : machine.lowStockThreshold === -1
          ? "In Stock"
          : newStock <= machine.lowStockThreshold
            ? "Low Stock"
            : "In Stock";

      await Machine.updateOne(
        { _id: m.machineId },
        { $set: { currentStock: newStock, stockStatus } },
        { session }
      );

      const serialNumbers = m.serialNumbers || [];

      if (serialNumbers.length > 0) {
        // Product machine — reset each serial number status back to "available" in PurchasedMachine
        for (const snObj of serialNumbers) {
          await PurchasedMachine.updateOne(
            { "machines.serialNumbers.serialNumber": snObj.serialNumber },
            { $set: { "machines.$[outer].serialNumbers.$[inner].status": "available" } },
            {
              arrayFilters: [
                { "outer.serialNumbers.serialNumber": snObj.serialNumber },
                { "inner.serialNumber": snObj.serialNumber }
              ],
              session
            }
          );
        }
      } else {
        // Parts machine — increment availableParts, decrement soldParts in PurchasedMachine
        // Find the purchase doc that has this machineId with soldParts > 0
        await PurchasedMachine.updateOne(
          { "machines.machineId": m.machineId, "machines.soldParts": { $gt: 0 } },
          {
            $inc: {
              "machines.$.availableParts": m.quantity,
              "machines.$.soldParts": -m.quantity,
            },
          },
          { session }
        );
      }
    }

    // ── Mark sale as cancelled ──
    await SoldMachine.findByIdAndUpdate(
      id,
      { $set: { status: "cancelled" } },
      { session }
    );

    // ── Mark related inventory log as cancelled ──
    await InventoryLog.updateOne(
      { soldId: sale._id },
      { $set: { isCancelled: true } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    // ── Send cancellation email to customer (after transaction) ──
    try {
      const customerEmail = sale.customerInfo?.email;
      if (customerEmail) {
        const company = await Company.findOne().lean();
        const saleDate = new Date(sale.createdAt).toLocaleDateString("en-IN", {
          day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata"
        });
        const cancellationDate = new Date().toLocaleDateString("en-IN", {
          day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata"
        });
        await sendSaleCancellationEmail({
          customerName:     sale.customerInfo.name,
          customerEmail,
          invoiceNumber:    sale.invoiceNumber || "N/A",
          saleDate,
          cancellationDate,
          grandTotal:       sale.grandTotalWithGst || 0,
          paidAmount:       sale.paidAmount || 0,
          companyName:      company?.name || "",
          companyEmail:     company?.email || "",
          companyPhone:     company?.phone || "",
        });
      }
    } catch (emailErr) {
      console.error("Sale cancellation email failed:", emailErr.message);
      // Don't fail the request if email fails
    }

    return res.status(200).json({ success: true, message: "Sale cancelled successfully" });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const escapeRegex      = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ciRegex          = (val) => ({ $regex: `^${escapeRegex(String(val).trim())}$`, $options: "i" });
const resolveStockStatus = (stock, threshold) => {
  if (stock === 0) return "Out of Stock";
  if (threshold === -1) return "In Stock";
  return stock <= threshold ? "Low Stock" : "In Stock";
};

// Parse "DD/MM/YY" → UTC midnight Date
const parseImportDate  = (str) => {
  const [dd, mm, yy] = String(str).trim().split("/");
  if (!dd || !mm || !yy) return null;
  const d = new Date(Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd)));
  return isNaN(d.getTime()) ? null : d;
};

const importSales = async (req, res) => {
  // ── Step 1: File-level checks ─────────────────────────────────────────────
  if (!req.file)
    return res.status(400).json({ success: false, message: "No file uploaded" });
  if (!req.file.originalname.match(/\.xlsx$/i))
    return res.status(400).json({ success: false, message: "Only .xlsx files are allowed" });

  const wb   = xlsx.read(req.file.buffer, { type: "buffer" });
  const rawRows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

  // Strip fully blank rows
  const rows = rawRows
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), typeof v === "string" ? v.trim() : v])
      )
    )
    .filter((row) => Object.values(row).some((v) => String(v).trim() !== ""));

  if (!rows.length)
    return res.status(400).json({ success: false, message: "File is empty" });

  // Header presence check (case-insensitive prefix match)
  const headers = Object.keys(rows[0]);
  const requiredPrefixes = [
    "invoicenumber", "customerphone", "itemname", "modelnumber",
    "quantity", "sellingpricewithgst", "discountpercentage", "serialnumber",
    "contracttypecode", "validfrom", "validto",
    "mincopies", "pagescategories",
    "paymentstatus", "paidamount", "paymentmethod", "paymentdate",
  ];
  const findHeader = (prefix) => headers.find((h) => h === prefix || h.startsWith(prefix)) ?? null;
  const missing = requiredPrefixes.filter((p) => !findHeader(p));
  if (missing.length)
    return res.status(400).json({ success: false, message: `Missing required columns: ${missing.join(", ")}` });

  // Build resolved header map
  const H = {};
  for (const prefix of requiredPrefixes) H[prefix] = findHeader(prefix);

  // ── Step 2: Row-level validation (no DB) ─────────────────────────────────
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i];
    const rowNum = i + 2; // Excel row (1-indexed + header row)

    const invoiceNumber       = String(row[H.invoicenumber]       || "").trim();
    const customerPhone       = String(row[H.customerphone]       || "").trim();
    const itemName            = String(row[H.itemname]            || "").trim();
    const modelNumber         = String(row[H.modelnumber]         || "").trim();
    const quantityRaw         = row[H.quantity];
    const sellingPriceRaw     = row[H.sellingpricewithgst];
    const discountRaw         = row[H.discountpercentage];
    const serialNumber        = String(row[H.serialnumber]        || "").trim();
    const contractTypeCode    = String(row[H.contracttypecode]    || "").trim();
    const validFromRaw        = String(row[H.validfrom]           || "").trim();
    const validToRaw          = String(row[H.validto]             || "").trim();
    const minCopiesRaw        = row[H.mincopies];
    const pagesCategoriesRaw  = String(row[H.pagescategories]     || "").trim();
    const paymentStatus       = String(row[H.paymentstatus]       || "").trim();
    const paidAmountRaw       = row[H.paidamount];
    const paymentMethod       = String(row[H.paymentmethod]       || "").trim();
    const paymentDateRaw      = String(row[H.paymentdate]         || "").trim();

    if (!invoiceNumber)                    errors.push(`Row ${rowNum}: invoiceNumber is required`);
    else if (invoiceNumber.length > 100)   errors.push(`Row ${rowNum}: invoiceNumber must not exceed 100 characters`);
    if (!customerPhone)                    errors.push(`Row ${rowNum}: customerPhone is required`);
    if (!itemName)                         errors.push(`Row ${rowNum}: itemName is required`);
    if (!modelNumber)                      errors.push(`Row ${rowNum}: modelNumber is required`);

    const quantity = Number(quantityRaw);
    if (quantityRaw === "" || quantityRaw === undefined || quantityRaw === null)
      errors.push(`Row ${rowNum}: quantity is required`);
    else if (!Number.isInteger(quantity) || quantity < 1)
      errors.push(`Row ${rowNum}: quantity must be a positive integer`);

    const sellingPrice = Number(sellingPriceRaw);
    if (sellingPriceRaw === "" || sellingPriceRaw === undefined || sellingPriceRaw === null)
      errors.push(`Row ${rowNum}: sellingPriceWithGst is required`);
    else if (isNaN(sellingPrice) || sellingPrice < 0)
      errors.push(`Row ${rowNum}: sellingPriceWithGst must be a non-negative number`);

    const discount = discountRaw === "" || discountRaw === undefined ? 0 : Number(discountRaw);
    if (discountRaw !== "" && discountRaw !== undefined && (isNaN(discount) || discount < 0 || discount > 100))
      errors.push(`Row ${rowNum}: discountPercentage must be a number between 0 and 100`);

    // contractTypeCode + date consistency
    if (contractTypeCode) {
      if (!validFromRaw) errors.push(`Row ${rowNum}: validFrom is required when contractTypeCode is provided`);
      if (!validToRaw)   errors.push(`Row ${rowNum}: validTo is required when contractTypeCode is provided`);
    }
    if (validFromRaw) {
      const d = parseImportDate(validFromRaw);
      if (!d) errors.push(`Row ${rowNum}: validFrom must be in DD/MM/YY format`);
    }
    if (validToRaw) {
      const df = parseImportDate(validFromRaw);
      const dt = parseImportDate(validToRaw);
      if (!dt) errors.push(`Row ${rowNum}: validTo must be in DD/MM/YY format`);
      else if (df && dt <= df) errors.push(`Row ${rowNum}: validTo must be after validFrom`);
    }

    // minCopies format check (no DB — TSS check happens in Step 4)
    if (minCopiesRaw !== "" && minCopiesRaw !== undefined && minCopiesRaw !== null) {
      const mc = Number(minCopiesRaw);
      if (!Number.isInteger(mc) || mc < 0)
        errors.push(`Row ${rowNum}: minCopies must be a non-negative integer`);
    }

    // pagesCategories format check — validate "Name:price,Name2:price2" structure (no DB — TSS check in Step 4)
    if (pagesCategoriesRaw) {
      const entries = pagesCategoriesRaw.split(",").map((s) => s.trim()).filter(Boolean);
      for (let ei = 0; ei < entries.length; ei++) {
        const colonIdx = entries[ei].indexOf(":");
        if (colonIdx === -1) {
          errors.push(`Row ${rowNum}: pagesCategories entry ${ei + 1} must be in "CategoryName:price" format`);
          continue;
        }
        const catName = entries[ei].substring(0, colonIdx).trim();
        const price   = entries[ei].substring(colonIdx + 1).trim();
        if (!catName)
          errors.push(`Row ${rowNum}: pagesCategories entry ${ei + 1} has an empty category name`);
        const priceNum = Number(price);
        if (!price || isNaN(priceNum) || priceNum <= 0)
          errors.push(`Row ${rowNum}: pagesCategories entry ${ei + 1} price must be a positive number`);
      }
    }

    if (!["Paid", "Unpaid", "Partial-Paid"].includes(paymentStatus))
      errors.push(`Row ${rowNum}: paymentStatus must be Paid, Unpaid, or Partial-Paid`);

    if (paymentStatus === "Partial-Paid") {
      const pa = Number(paidAmountRaw);
      if (paidAmountRaw === "" || paidAmountRaw === undefined || paidAmountRaw === null || isNaN(pa) || pa <= 0)
        errors.push(`Row ${rowNum}: paidAmount must be a positive number for Partial-Paid`);
    } else {
      if (paidAmountRaw !== "" && paidAmountRaw !== undefined && paidAmountRaw !== null && String(paidAmountRaw).trim() !== "")
        errors.push(`Row ${rowNum}: paidAmount must be blank for ${paymentStatus}`);
    }

    if (paymentStatus === "Paid" || paymentStatus === "Partial-Paid") {
      if (!["Cash", "Online"].includes(paymentMethod))
        errors.push(`Row ${rowNum}: paymentMethod must be Cash or Online for ${paymentStatus}`);
      if (!paymentDateRaw)
        errors.push(`Row ${rowNum}: paymentDate is required for ${paymentStatus}`);
      else if (!parseImportDate(paymentDateRaw))
        errors.push(`Row ${rowNum}: paymentDate must be in DD/MM/YY format`);
    } else if (paymentStatus === "Unpaid") {
      if (paymentMethod)
        errors.push(`Row ${rowNum}: paymentMethod must be blank for Unpaid`);
      if (paymentDateRaw)
        errors.push(`Row ${rowNum}: paymentDate must be blank for Unpaid`);
    }
  }

  if (errors.length)
    return res.status(400).json({ success: false, message: "Import validation failed", errors });

  // ── Step 3: Group by invoiceNumber + cross-row checks ────────────────────
  const groups = new Map(); // invoiceNumber.toLowerCase() → { invoiceNumber, rows[] }
  for (const row of rows) {
    const key = String(row[H.invoicenumber]).trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, { invoiceNumber: String(row[H.invoicenumber]).trim(), rows: [] });
    groups.get(key).rows.push(row);
  }

  const globalSerials = new Map(); // serialNumber.toUpperCase() → invoiceNumber (for cross-group dedup)

  for (const [, group] of groups) {
    const { invoiceNumber, rows: gRows } = group;

    // Consistency checks — same across all rows in the group
    const checkConsistency = (field, label) => {
      const vals = [...new Set(gRows.map((r) => String(r[H[field]] || "").trim()))];
      if (vals.length > 1)
        errors.push(`Invoice "${invoiceNumber}": all rows must have the same ${label} (found: ${vals.join(", ")})`);
    };
    checkConsistency("customerphone",  "customerPhone");
    checkConsistency("paymentstatus",  "paymentStatus");
    checkConsistency("paidamount",     "paidAmount");
    checkConsistency("paymentmethod",  "paymentMethod");
    checkConsistency("paymentdate",    "paymentDate");

    // No duplicate serialNumbers within group or across groups
    for (const r of gRows) {
      const sn = String(r[H.serialnumber] || "").trim();
      if (!sn) continue;
      const snUpper = sn.toUpperCase();
      if (globalSerials.has(snUpper)) {
        const otherInvoice = globalSerials.get(snUpper);
        if (otherInvoice === invoiceNumber)
          errors.push(`Invoice "${invoiceNumber}": duplicate serialNumber "${sn}" within the same group`);
        else
          errors.push(`Invoice "${invoiceNumber}": serialNumber "${sn}" already used in invoice "${otherInvoice}"`);
      } else {
        globalSerials.set(snUpper, invoiceNumber);
      }
    }
  }

  if (errors.length)
    return res.status(400).json({ success: false, message: "Import validation failed", errors });

  // ── Step 4: DB lookups & business rule checks ─────────────────────────────
  const gstConfig  = await GstConfig.findOne().lean();
  const totalGst   = gstConfig ? (gstConfig.cgst || 0) + (gstConfig.sgst || 0) + (gstConfig.igst || 0) : 0;
  const gstDivisor = 1 + totalGst / 100;

  const validGroups = []; // groups that passed all DB checks

  for (const [, group] of groups) {
    const { invoiceNumber, rows: gRows } = group;
    const customerPhone = String(gRows[0][H.customerphone] || "").trim();
    const paymentStatus = String(gRows[0][H.paymentstatus] || "").trim();
    const paidAmountRaw = gRows[0][H.paidamount];
    const paymentMethod = String(gRows[0][H.paymentmethod] || "").trim();
    const paymentDateRaw = String(gRows[0][H.paymentdate] || "").trim();

    // Invoice uniqueness
    const existingInvoice = await SoldMachine.findOne({ invoiceNumber: ciRegex(invoiceNumber) }).lean();
    if (existingInvoice) {
      errors.push(`Invoice "${invoiceNumber}": invoice number already exists`);
      continue;
    }

    // Customer lookup by phone
    const customer = await Customer.findOne({ phone: customerPhone }).lean();
    if (!customer) {
      errors.push(`Invoice "${invoiceNumber}": customer not found for phone "${customerPhone}"`);
      continue;
    }
    if (customer.status === "Inactive") {
      errors.push(`Invoice "${invoiceNumber}": customer "${customer.name}" is inactive`);
      continue;
    }

    const machineEntries = [];
    let groupHasError    = false;
    let grandTotalBase    = 0;
    let grandTotalWithGst = 0;
    let grandTotalGstAmount = 0;
    let cogsTotalBase     = 0;

    for (let ri = 0; ri < gRows.length; ri++) {
      const row        = gRows[ri];
      const rowNum     = rows.indexOf(row) + 2;
      const itemName   = String(row[H.itemname]    || "").trim();
      const modelNum   = String(row[H.modelnumber] || "").trim();
      const quantity   = Number(row[H.quantity]);
      const sellingPriceWithGst = Number(row[H.sellingpricewithgst]);
      const discountPct = row[H.discountpercentage] === "" || row[H.discountpercentage] === undefined ? 0 : Number(row[H.discountpercentage]);
      const serialNumber       = String(row[H.serialnumber]     || "").trim();
      const contractCode       = String(row[H.contracttypecode] || "").trim();
      const validFromRaw       = String(row[H.validfrom]        || "").trim();
      const validToRaw         = String(row[H.validto]          || "").trim();
      const minCopiesRaw4      = row[H.mincopies];
      const pagesCategoriesRaw4 = String(row[H.pagescategories] || "").trim();

      // Machine lookup
      const machine = await Machine.findOne({ name: ciRegex(itemName), modelNumber: ciRegex(modelNum) })
        .populate("category", "_id name")
        .populate("division", "_id name")
        .lean();

      if (!machine) {
        errors.push(`Invoice "${invoiceNumber}" Row ${rowNum}: machine "${itemName}" (${modelNum}) not found`);
        groupHasError = true; continue;
      }
      if (machine.status === "Inactive") {
        errors.push(`Invoice "${invoiceNumber}" Row ${rowNum}: machine "${itemName}" is inactive`);
        groupHasError = true; continue;
      }

      const isProduct = machine.category?._id?.toString() === PRODUCT_CATEGORY_ID;

      // Product machine checks
      if (isProduct) {
        if (!serialNumber) {
          errors.push(`Invoice "${invoiceNumber}" Row ${rowNum}: serialNumber is required for product machine "${itemName}"`);
          groupHasError = true; continue;
        }
        if (quantity !== 1) {
          errors.push(`Invoice "${invoiceNumber}" Row ${rowNum}: quantity must be 1 for product machine "${itemName}" (serial-based)`);
          groupHasError = true; continue;
        }
        // Verify serial in purchase with status = available
        const purchaseDoc = await PurchasedMachine.findOne({
          "machines.serialNumbers.serialNumber": serialNumber,
          status: "active",
        }, { "machines.serialNumbers.$": 1 }).lean();

        let snEntry = null;
        if (purchaseDoc) {
          for (const m of purchaseDoc.machines || []) {
            const found = (m.serialNumbers || []).find(
              (s) => s.serialNumber.toUpperCase() === serialNumber.toUpperCase()
            );
            if (found) { snEntry = found; break; }
          }
        }
        // Try broader search if not found with status filter
        if (!snEntry) {
          const anyDoc = await PurchasedMachine.findOne({
            "machines.serialNumbers.serialNumber": { $regex: `^${escapeRegex(serialNumber)}$`, $options: "i" },
          }).lean();
          if (!anyDoc) {
            errors.push(`Invoice "${invoiceNumber}" Row ${rowNum}: serialNumber "${serialNumber}" not found in any purchase`);
            groupHasError = true; continue;
          }
          // It exists but find its status
          for (const m of anyDoc.machines || []) {
            const found = (m.serialNumbers || []).find(
              (s) => s.serialNumber.toUpperCase() === serialNumber.toUpperCase()
            );
            if (found) { snEntry = found; break; }
          }
        }
        if (snEntry && snEntry.status !== "available") {
          errors.push(`Invoice "${invoiceNumber}" Row ${rowNum}: serialNumber "${serialNumber}" is already sold`);
          groupHasError = true; continue;
        }
      } else {
        // Parts machine checks
        if (serialNumber) {
          errors.push(`Invoice "${invoiceNumber}" Row ${rowNum}: serialNumber must be blank for parts machine "${itemName}"`);
          groupHasError = true; continue;
        }
        // Check available parts stock (sum across active purchase docs, FIFO intent just needs total)
        const purchaseDocs = await PurchasedMachine.find(
          { "machines.machineId": machine._id, status: "active" },
          { "machines": 1 }
        ).lean();
        const totalAvailable = purchaseDocs.reduce((sum, doc) => {
          const me = (doc.machines || []).find((m) => m.machineId?.toString() === machine._id.toString());
          return sum + (me?.availableParts || 0);
        }, 0);
        // Accumulate quantity for this machine across all rows in this group
        const alreadyCounted = machineEntries
          .filter((e) => e.machineId.toString() === machine._id.toString())
          .reduce((s, e) => s + e.quantity, 0);
        if (alreadyCounted + quantity > totalAvailable) {
          errors.push(`Invoice "${invoiceNumber}" Row ${rowNum}: insufficient available parts for "${itemName}" — requested ${alreadyCounted + quantity}, available ${totalAvailable}`);
          groupHasError = true; continue;
        }
      }

      // Contract type DB check
      let contractTypeDoc = null;
      if (contractCode) {
        contractTypeDoc = await ContractType.findOne({ code: ciRegex(contractCode) }).lean();
        if (!contractTypeDoc) {
          errors.push(`Invoice "${invoiceNumber}" Row ${rowNum}: contractTypeCode "${contractCode}" not found`);
          groupHasError = true; continue;
        }
        if (contractTypeDoc.status === "Inactive") {
          errors.push(`Invoice "${invoiceNumber}" Row ${rowNum}: contract type "${contractTypeDoc.name}" is inactive`);
          groupHasError = true; continue;
        }
      }

      // TSS: validate + DB-lookup pagesCategories; non-TSS: silently ignore
      let resolvedPagesCategories = []; // array of { pagesCategoryId, pagesCategory, costPerPage }
      let resolvedMinCopies = 0;

      const isTSS = contractTypeDoc && TSS_CONTRACT_TYPE_ID &&
                    contractTypeDoc._id.toString() === TSS_CONTRACT_TYPE_ID;

      if (isTSS) {
        resolvedMinCopies = (minCopiesRaw4 !== "" && minCopiesRaw4 !== undefined && minCopiesRaw4 !== null)
          ? Number(minCopiesRaw4)
          : 0;

        if (!pagesCategoriesRaw4) {
          errors.push(`Invoice "${invoiceNumber}" Row ${rowNum}: pagesCategories is required for TSS contract type`);
          groupHasError = true; continue;
        }

        const pcEntries = pagesCategoriesRaw4.split(",").map((s) => s.trim()).filter(Boolean);
        let pcError = false;

        // Duplicate category name check
        const seenCatNames = new Set();
        for (const entry of pcEntries) {
          const colonIdx = entry.indexOf(":");
          const catName  = entry.substring(0, colonIdx).trim().toLowerCase();
          if (catName) {
            if (seenCatNames.has(catName)) {
              errors.push(`Invoice "${invoiceNumber}" Row ${rowNum}: pagesCategories contains duplicate category name "${entry.substring(0, entry.indexOf(":")).trim()}"`);
              pcError = true;
            }
            seenCatNames.add(catName);
          }
        }
        if (pcError) { groupHasError = true; continue; }

        for (let ei = 0; ei < pcEntries.length; ei++) {
          const colonIdx = pcEntries[ei].indexOf(":");
          const catName  = pcEntries[ei].substring(0, colonIdx).trim();
          const price    = Number(pcEntries[ei].substring(colonIdx + 1).trim());

          const cat = await PagesCategory.findOne({ name: ciRegex(catName) }).lean();
          if (!cat) {
            errors.push(`Invoice "${invoiceNumber}" Row ${rowNum}: pagesCategories entry ${ei + 1} — category "${catName}" not found`);
            pcError = true; continue;
          }
          if (cat.status === "Inactive") {
            errors.push(`Invoice "${invoiceNumber}" Row ${rowNum}: pagesCategories entry ${ei + 1} — category "${catName}" is inactive`);
            pcError = true; continue;
          }
          resolvedPagesCategories.push({ pagesCategoryId: cat._id, pagesCategory: cat.name, costPerPage: price });
        }
        if (pcError) { groupHasError = true; continue; }
      }
      // non-TSS: resolvedPagesCategories stays [], resolvedMinCopies stays 0

      // Price computations
      const sellingPriceBase      = Math.round((sellingPriceWithGst / gstDivisor) * 100) / 100;
      const gstAmountPerUnit      = Math.round((sellingPriceWithGst - sellingPriceBase) * 100) / 100;
      const netSellingPriceWithGst = Math.round(sellingPriceWithGst * (1 - discountPct / 100) * 100) / 100;
      const netSellingPriceBase   = Math.round((netSellingPriceWithGst / gstDivisor) * 100) / 100;
      const netGstAmountPerUnit   = Math.round((netSellingPriceWithGst - netSellingPriceBase) * 100) / 100;
      const sellingTotalBase      = Math.round(netSellingPriceBase * quantity * 100) / 100;
      const sellingTotalWithGst   = Math.round(netSellingPriceWithGst * quantity * 100) / 100;
      const gstAmountTotal        = Math.round(netGstAmountPerUnit * quantity * 100) / 100;
      const discountAmountWithGst = Math.round((sellingPriceWithGst - netSellingPriceWithGst) * 100) / 100;

      grandTotalBase        = Math.round((grandTotalBase + sellingTotalBase) * 100) / 100;
      grandTotalWithGst     = Math.round((grandTotalWithGst + sellingTotalWithGst) * 100) / 100;
      grandTotalGstAmount   = Math.round((grandTotalGstAmount + gstAmountTotal) * 100) / 100;

      machineEntries.push({
        machineId:              machine._id,
        machineName:            machine.name,
        modelNumber:            machine.modelNumber || "",
        partCode:               machine.partCode || "",
        hsnCode:                machine.hsnCode || "",
        categoryId:             machine.category?._id || null,
        category:               machine.category?.name || "",
        divisionId:             machine.division?._id || null,
        division:               machine.division?.name || "",
        quantity,
        sellingPriceWithGst,
        sellingPriceBase,
        gstAmountPerUnit,
        discount:               { percentage: discountPct, amount: discountAmountWithGst },
        netSellingPriceBase,
        netSellingPriceWithGst,
        netGstAmountPerUnit,
        sellingTotalBase,
        sellingTotalWithGst,
        gstAmountTotal,
        isProduct,
        serialNumber:           isProduct ? serialNumber : null,
        contractTypeDoc:        contractTypeDoc || null,
        validFrom:              validFromRaw ? parseImportDate(validFromRaw) : null,
        validTo:                validToRaw   ? parseImportDate(validToRaw)   : null,
        resolvedMinCopies,
        resolvedPagesCategories,
        lowStockThreshold:      machine.lowStockThreshold ?? -1,
      });
    }

    if (groupHasError) continue;

    // paidAmount < grandTotalWithGst for Partial-Paid
    if (paymentStatus === "Partial-Paid") {
      const pa = Number(paidAmountRaw);
      if (pa >= grandTotalWithGst) {
        errors.push(`Invoice "${invoiceNumber}": paidAmount (${pa}) must be less than grandTotalWithGst (${grandTotalWithGst})`);
        continue;
      }
    }

    validGroups.push({
      invoiceNumber,
      customer,
      machineEntries,
      grandTotalBase,
      grandTotalWithGst,
      grandTotalGstAmount,
      cogsTotalBase,
      paymentStatus,
      paidAmount:    paymentStatus === "Paid"          ? grandTotalWithGst
                   : paymentStatus === "Partial-Paid"  ? Math.round(Number(paidAmountRaw) * 100) / 100
                   : 0,
      paymentMethod: paymentMethod || null,
      paymentDate:   paymentDateRaw ? parseImportDate(paymentDateRaw) : null,
    });
  }

  if (errors.length)
    return res.status(400).json({ success: false, message: "Import validation failed", errors });

  // ── Step 5: Create all records in a Mongoose session transaction ──────────
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    for (const group of validGroups) {
      const {
        invoiceNumber, customer, machineEntries,
        grandTotalBase, grandTotalWithGst, grandTotalGstAmount,
        paymentStatus, paidAmount, paymentMethod, paymentDate,
      } = group;

      const remainingAmount = Math.round((grandTotalWithGst - paidAmount) * 100) / 100;

      const customerInfo = {
        customerId:       customer._id,
        customerUniqueId: customer.customerId || "",
        name:             customer.name,
        phone:            customer.phone,
        email:            customer.email || "",
        address:          customer.userLocation?.address || "",
        zone:             customer.zone?.name || customer.zone || "",
        gstNumber:        customer.gstNumber || "",
        customerPORef:    "",
      };

      // Build final machineEntries for the SoldMachine document
      // Need buying price from PurchasedMachine for cogsTotalBase
      let cogsTotalBase = 0;
      const finalMachineEntries = [];

      for (const entry of machineEntries) {
        const entryData = {
          machineId:              entry.machineId,
          machineName:            entry.machineName,
          modelNumber:            entry.modelNumber,
          partCode:               entry.partCode,
          hsnCode:                entry.hsnCode,
          categoryId:             entry.categoryId,
          category:               entry.category,
          divisionId:             entry.divisionId,
          division:               entry.division,
          quantity:               entry.quantity,
          sellingPriceWithGst:    entry.sellingPriceWithGst,
          sellingPriceBase:       entry.sellingPriceBase,
          gstAmountPerUnit:       entry.gstAmountPerUnit,
          discount:               entry.discount,
          netSellingPriceBase:    entry.netSellingPriceBase,
          netSellingPriceWithGst: entry.netSellingPriceWithGst,
          netGstAmountPerUnit:    entry.netGstAmountPerUnit,
          sellingTotalBase:       entry.sellingTotalBase,
          sellingTotalWithGst:    entry.sellingTotalWithGst,
          gstAmountTotal:         entry.gstAmountTotal,
        };

        if (entry.isProduct) {
          // Find buying price for this serial
          const purchaseDoc = await PurchasedMachine.findOne(
            { "machines.serialNumbers.serialNumber": { $regex: `^${escapeRegex(entry.serialNumber)}$`, $options: "i" } },
            { "machines": 1 }
          ).session(session).lean();

          let buyingPriceBase = 0;
          if (purchaseDoc) {
            for (const m of purchaseDoc.machines || []) {
              const found = (m.serialNumbers || []).find(
                (s) => s.serialNumber.toUpperCase() === entry.serialNumber.toUpperCase()
              );
              if (found) { buyingPriceBase = m.buyingPriceBase ?? 0; break; }
            }
          }
          cogsTotalBase = Math.round((cogsTotalBase + buyingPriceBase) * 100) / 100;

          let contractType = null;
          if (entry.contractTypeDoc) {
            contractType = {
              contractTypeId: entry.contractTypeDoc._id,
              name:           entry.contractTypeDoc.name,
              code:           entry.contractTypeDoc.code,
              freeService:    entry.contractTypeDoc.freeService,
              freeParts:      entry.contractTypeDoc.freeParts,
              validFrom:      entry.validFrom,
              validTo:        entry.validTo,
            };
          }

          entryData.serialNumbers = [{
            serialNumber:    entry.serialNumber,
            buyingPriceBase,
            minCopies:       entry.resolvedMinCopies || 0,
            contractType,
            pagesCategories: entry.resolvedPagesCategories || [],
          }];
        } else {
          // Parts machine — FIFO: find oldest purchase doc with enough availableParts
          const purchaseDocs = await PurchasedMachine.find(
            { "machines.machineId": entry.machineId, status: "active" },
            { "machines": 1, "createdAt": 1 }
          ).sort({ createdAt: 1 }).session(session).lean();

          let chosenPurchaseDocId  = null;
          let chosenBuyingPriceBase = 0;
          let chosenPartCode       = "";

          for (const doc of purchaseDocs) {
            const me = (doc.machines || []).find((m) => m.machineId?.toString() === entry.machineId.toString());
            if (me && (me.availableParts || 0) >= entry.quantity) {
              chosenPurchaseDocId   = doc._id;
              chosenBuyingPriceBase = me.buyingPriceBase ?? 0;
              chosenPartCode        = me.partCode || "";
              break;
            }
          }

          if (!chosenPurchaseDocId) {
            throw new Error(`Insufficient available parts for "${entry.machineName}" during import creation`);
          }

          cogsTotalBase = Math.round((cogsTotalBase + chosenBuyingPriceBase * entry.quantity) * 100) / 100;
          entryData.partCodes = { partCode: chosenPartCode, buyingPriceBase: chosenBuyingPriceBase };
          entryData._chosenPurchaseDocId = chosenPurchaseDocId.toString();
        }

        finalMachineEntries.push(entryData);
      }

      // Create SoldMachine document
      const [sale] = await SoldMachine.create(
        [{
          invoiceNumber,
          customerInfo,
          machines:             finalMachineEntries,
          grandTotalBase,
          grandTotalWithGst,
          grandTotalGstAmount,
          cogsTotalBase,
          currentPaymentStatus: paymentStatus,
          paidAmount,
          remainingAmount,
          processedBy:          [],
        }],
        { session }
      );

      // Create PaymentTransaction if paid
      if (paymentStatus === "Paid" || paymentStatus === "Partial-Paid") {
        await PaymentTransaction.create(
          [{ soldMachineId: sale._id, amount: paidAmount, paymentDate, paymentMethod }],
          { session }
        );
      }

      // Deduct stock on Machine + mark serials sold / deduct parts
      for (const entry of finalMachineEntries) {
        const machine = await Machine.findById(entry.machineId).session(session);
        if (!machine) continue;

        const newStock = Math.max(0, machine.currentStock - entry.quantity);
        const stockStatus = resolveStockStatus(newStock, machine.lowStockThreshold ?? -1);
        await Machine.updateOne({ _id: entry.machineId }, { $set: { currentStock: newStock, stockStatus } }, { session });

        if (entry.serialNumbers && entry.serialNumbers.length > 0) {
          // Product: mark serial as sold in PurchasedMachine
          const sn = entry.serialNumbers[0].serialNumber;
          await PurchasedMachine.updateOne(
            { "machines.serialNumbers.serialNumber": sn },
            { $set: { "machines.$[outer].serialNumbers.$[inner].status": "sold" } },
            { arrayFilters: [{ "outer.serialNumbers.serialNumber": sn }, { "inner.serialNumber": sn }], session }
          );
        } else if (entry._chosenPurchaseDocId) {
          // Parts: FIFO deduct availableParts / increment soldParts
          await PurchasedMachine.updateOne(
            { _id: entry._chosenPurchaseDocId, "machines.machineId": entry.machineId },
            { $inc: { "machines.$.availableParts": -entry.quantity, "machines.$.soldParts": entry.quantity } },
            { session }
          );
        }
      }

      // Clean up internal fields before inventory log
      const logMachines = finalMachineEntries.map((e) => {
        const { _chosenPurchaseDocId, ...rest } = e;
        return {
          machineId:     rest.machineId,
          machineName:   rest.machineName,
          modelNumber:   rest.modelNumber,
          categoryId:    rest.categoryId,
          category:      rest.category,
          divisionId:    rest.divisionId,
          division:      rest.division,
          quantity:      rest.quantity,
          serialNumbers: (rest.serialNumbers || []).map((s) => s.serialNumber),
          partCodes:     rest.partCodes ? [rest.partCodes.partCode] : [],
        };
      });

      // Create InventoryLog
      await InventoryLog.create(
        [{ action: "sold", customerInfo, soldId: sale._id, machines: logMachines }],
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: `Imported ${validGroups.length} sale${validGroups.length !== 1 ? "s" : ""} successfully`,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: err.message });
  }
};

const downloadSample = (req, res) => {
  const ws = xlsx.utils.aoa_to_sheet([
    [
      "invoiceNumber",
      "customerPhone",
      "itemName",
      "modelNumber",
      "quantity (max 1 for machines with serial numbers)",
      "sellingPriceWithGst",
      "discountPercentage",
      "serialNumber (single, blank for parts)",
      "contractTypeCode (blank if none)",
      "validFrom (DD/MM/YY, blank if none)",
      "validTo (DD/MM/YY, blank if none)",
      "minCopies (TSS only, blank otherwise)",
      "pagesCategories (TSS only: Name1:price1,Name2:price2)",
      "paymentStatus (Paid/Unpaid/Partial-Paid)",
      "paidAmount (only for Partial-Paid)",
      "paymentMethod (Cash/Online)",
      "paymentDate (DD/MM/YY)",
    ],
    [
      "INV-2024-001",
      "9800000000",
      "Photocopier X200",
      "X200",
      1,
      15000,
      0,
      "SN-001",
      "TSS",
      "01/04/24",
      "31/03/25",
      100,
      "Color:2.50,Black & White:1.00",
      "Paid",
      "",
      "Cash",
      "01/04/24",
    ],
    [
      "INV-2024-001",
      "9800000000",
      "Photocopier X200",
      "X200",
      1,
      15000,
      0,
      "SN-002",
      "AMC",
      "01/04/24",
      "31/03/26",
      "",
      "",
      "Paid",
      "",
      "Cash",
      "01/04/24",
    ],
    [
      "INV-2024-001",
      "9800000000",
      "Toner Cartridge",
      "TC-100",
      5,
      500,
      0,
      "",
      "",
      "",
      "",
      "",
      "",
      "Paid",
      "",
      "Cash",
      "01/04/24",
    ],
  ]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Sales");
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=sales_sample.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
};

module.exports = { getAll, getById, createSale, cancelSale, renewContract, addContract, exportToExcel, verifySerialNumbers, verifyPartCodes, getAvailableCodes, getAvailableMachines, generateInvoice, sendContractExpiryAlerts, getContractExpiryStatus, addPayment, customerOutstandingDue, customerPaymentReceipts, getSystemUsers, downloadSample, importSales };