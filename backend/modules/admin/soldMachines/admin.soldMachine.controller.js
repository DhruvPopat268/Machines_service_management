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
const { validateCreateSale } = require("./admin.soldMachine.validator");
const { sendContractExpiryAlert, sendSaleConfirmationEmail, sendPaymentReceivedEmail } = require("../../../utils/emailService");

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

const getAvailableMachines = async (req, res) => {
  try {
    const { search } = req.query;
    const query = { status: "Active", stockStatus: { $in: ["In Stock", "Low Stock"] } };

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { name: { $regex: escaped, $options: "i" } },
          { modelNumber: { $regex: escaped, $options: "i" } },
        ];
      }
    }

    const machines = await Machine.find(query)
      .populate("category", "_id name")
      .populate("division", "_id name")
      .select("_id name modelNumber category division stockStatus currentStock")
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
      { "machines.machineId": new mongoose.Types.ObjectId(machineId) },
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
    const { search, customerId, zoneId, category, division, machineId, paymentStatus, processedBy, fromDate, toDate, page = 1, limit = 10 } = req.query;
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

    const allSales = await SoldMachine.find(query).lean();
    const totalSales = allSales.reduce((s, sale) => s + (sale.grandTotalBase || 0), 0);
    const totalMachines = allSales.reduce((s, sale) => s + sale.machines.reduce((ms, m) => ms + m.quantity, 0), 0);
    const avgValue = allSales.length > 0 ? Math.round((totalSales / allSales.length) * 100) / 100 : 0;

    res.status(200).json({
      success: true,
      data: sales.map((s) => ({ ...s.toObject(), machinesCount: s.machines.length })),
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

    if (currentPaymentStatus === "Paid") {
      paidAmount = grandTotalWithGst;
      remainingAmount = 0;
    } else if (currentPaymentStatus === "Partial-Paid") {
      paidAmount = Math.round(Number(rawPaidAmount) * 100) / 100;
      if (paidAmount >= grandTotalWithGst) return abort(400, "paidAmount must be less than grandTotalWithGst for Partial-Paid");
      remainingAmount = Math.round((grandTotalWithGst - paidAmount) * 100) / 100;
    }

    const [sale] = await SoldMachine.create([{ customerInfo, machines: machineEntries, grandTotalBase, grandTotalWithGst, grandTotalGstAmount, cogsTotalBase, currentPaymentStatus, paidAmount, remainingAmount, processedBy: Array.isArray(processedBy) ? processedBy.filter(id => mongoose.isValidObjectId(id)) : [] }], { session });

    let transactionId = null;
    if (currentPaymentStatus === "Paid" || currentPaymentStatus === "Partial-Paid") {
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
    let saleInvoiceNumber = "";
    if (companyId) {
      try {
        const company = await Company.findById(companyId).lean();
        if (company) {
          const cgstNum = gstConfig?.cgst || 0;
          const sgstNum = gstConfig?.sgst || 0;
          const igstNum = gstConfig?.igst || 0;

          const invoiceCounter = await Counter.findByIdAndUpdate(
            "salesInvoice",
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
          );
          saleInvoiceNumber = `INV-${invoiceCounter.seq}`;

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
    const { serialNumber, newContractTypeId, newValidFrom, newValidTo } = req.body;

    if (!serialNumber?.trim())
      return res.status(400).json({ success: false, message: "serialNumber is required" });
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

    // Check existing contract — block renewal if not expired in IST
    const soldRecord = await SoldMachine.findOne({ "machines.serialNumbers.serialNumber": sn });
    if (!soldRecord) return res.status(404).json({ success: false, message: "Serial number not found in any sale" });

    let existingValidTo = null;
    outer: for (const machine of soldRecord.machines) {
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
      { "machines.serialNumbers.serialNumber": sn },
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
      { arrayFilters: [{ "outer.serialNumbers.serialNumber": sn }, { "inner.serialNumber": sn }] }
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
    const { serialNumber, contractTypeId, validFrom, validTo } = req.body;

    if (!serialNumber?.trim())
      return res.status(400).json({ success: false, message: "serialNumber is required" });
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

    // Check if serial number exists and doesn't already have a contract
    const soldRecord = await SoldMachine.findOne({ "machines.serialNumbers.serialNumber": sn });
    if (!soldRecord) return res.status(404).json({ success: false, message: "Serial number not found in any sale" });

    let existingContract = null;
    outer: for (const machine of soldRecord.machines) {
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
      { "machines.serialNumbers.serialNumber": sn },
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
      { arrayFilters: [{ "outer.serialNumbers.serialNumber": sn }, { "inner.serialNumber": sn }] }
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
    const { search, customerId, zoneId, category, division, machineId, fromDate, toDate } = req.query;
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
          { "customerInfo.name": { $regex: escaped, $options: "i" } },
          { "customerInfo.phone": { $regex: escaped, $options: "i" } },
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
      if (toDate) query.createdAt.$lte = parseIST(toDate, true);
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

    const cgstNum = Number(cgst);
    const sgstNum = Number(sgst);
    const igstNum = Number(igst);

    const invoiceLogoUrl = process.env.INVOICE_LOGO_URL || "";
    const invoiceLogoText = process.env.INVOICE_LOGO_TEXT || "";

    const templatePath = path.join(__dirname, "../../../invoicesExamples/sales-invoice.html");
    let html = await fs.readFile(templatePath, "utf-8");

    const formatNum = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const basicTotal = sale.grandTotalBase;
    const cgstAmount = parseFloat(((basicTotal * cgstNum) / 100).toFixed(2));
    const sgstAmount = parseFloat(((basicTotal * sgstNum) / 100).toFixed(2));
    const igstAmount = parseFloat(((basicTotal * igstNum) / 100).toFixed(2));
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
      .replace(/{{customerPORef}}/g, sale.customerInfo.customerPORef || "")
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
        const rate = m.discountedSellingPrice != null ? m.discountedSellingPrice : m.sellingPrice;
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

module.exports = { getAll, getById, createSale, renewContract, addContract, exportToExcel, verifySerialNumbers, verifyPartCodes, getAvailableCodes, getAvailableMachines, generateInvoice, sendContractExpiryAlerts, getContractExpiryStatus, addPayment, customerOutstandingDue, customerPaymentReceipts, getSystemUsers };
