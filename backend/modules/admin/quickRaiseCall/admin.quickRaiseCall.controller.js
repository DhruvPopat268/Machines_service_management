/**
 * quickRaiseCall / admin.quickRaiseCall.controller.js
 *
 * Supports TWO modes via request body field  `mode`:
 *
 *  ┌─────────────────────────────────────────────────────────────────────┐
 *  │ mode: "dummy"  (default)                                            │
 *  │                                                                     │
 *  │  START → External Customer Raises Call                              │
 *  │        → [Check] Dummy Vendor exists? → NO → Create Dummy Vendor    │
 *  │        → Create / find Customer                                     │
 *  │        → [Check] Machine exists? → NO → Create Item                 │
 *  │        → [Check] ₹0 Purchase available? → NO → Create ₹0 Purchase  │
 *  │        → Sell Machine to Customer at ₹0                             │
 *  │        → Generate / Raise Call                                      │
 *  │        → END                                                        │
 *  ├─────────────────────────────────────────────────────────────────────┤
 *  │ mode: "existing"                                                    │
 *  │                                                                     │
 *  │  START → External Customer Raises Call                              │
 *  │        → Use provided real vendorId + machineId + serialNumber      │
 *  │        → Create / find Customer                                     │
 *  │        → Verify machine has available serial in purchases           │
 *  │        → Sell Machine to Customer (at real or ₹0 price)            │
 *  │        → Generate / Raise Call                                      │
 *  │        → END                                                        │
 *  └─────────────────────────────────────────────────────────────────────┘
 *
 * NOTE: This file does NOT modify any other existing file.
 */

const mongoose = require("mongoose");

// ── Existing models (read-only imports) ───────────────────────────────────────
const Vendor           = require("../vendorManagement/admin.vendor.model");
const Customer         = require("../customerManagement/admin.customer.model");
const Machine          = require("../inventoryManagement/admin.machine.model");
const MachineCategory  = require("../machineCategoryManagement/admin.machineCategory.model");
const MachineDivision  = require("../machineDivisionManagement/admin.machineDivision.model");
const PurchasedMachine = require("../purchasedMachines/admin.purchasedMachine.model");
const SoldMachine      = require("../soldMachines/admin.soldMachine.model");
const ServiceCall      = require("../../customer/calls/customer.serviceCall.model");
const Company          = require("../companyManagement/admin.company.model");
const ContractType     = require("../contractTypesManagement/admin.contractType.model");
const PagesCategory    = require("../pagesCategoryManagement/admin.pagesCategory.model");
const Zone             = require("../zoneManagement/admin.zone.model");
const Counter          = require("../auth/counter.model");
// ─────────────────────────────────────────────────────────────────────────────

const escapeRegex = (string) => (string || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const DUMMY_VENDOR_PHONE   = "9999900000";
const DUMMY_VENDOR_NAME    = "Quick Raise Dummy Vendor";
const DUMMY_VENDOR_COMPANY = "Quick Raise System";
const DUMMY_VENDOR_EMAIL   = "dummy-vendor@quickraise.local";

const generateCallId = () => `SC-${Date.now()}`;

// ═════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/** Find or create the system dummy vendor */
const ensureDummyVendor = async () => {
  let vendor = await Vendor.findOne({
    $or: [{ name: DUMMY_VENDOR_NAME }, { phone: DUMMY_VENDOR_PHONE }],
  });
  if (!vendor) {
    vendor = await Vendor.create({
      name:        DUMMY_VENDOR_NAME,
      companyName: DUMMY_VENDOR_COMPANY,
      phone:       DUMMY_VENDOR_PHONE,
      email:       DUMMY_VENDOR_EMAIL,
      address:     "Auto-created by Quick Raise Call",
      status:      "Active",
      source:      "manual",
    });
  }
  return vendor;
};

/** Find or create a customer by phone */
const ensureCustomer = async (customerData) => {
  const { name, phone, email, address, userLocation, zone, department } = customerData;
  let customer = await Customer.findOne({ phone });
  if (!customer) {
    // Auto-generate a system Customer ID (CUS-xxx)
    const counter = await Counter.findOneAndUpdate(
      { _id: "customerId" },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    const generatedCustomerId = `CUS-${counter.seq}`;

    const payload = { name, phone, customerId: generatedCustomerId, status: "Active", source: "manual" };
    if (email) payload.email = email;
    if (department) payload.department = department;
    if (zone && mongoose.isValidObjectId(zone)) payload.zone = zone;
    if (userLocation && typeof userLocation === "object") {
      payload.userLocation = {
        address:   userLocation.address || address || "",
        latitude:  userLocation.latitude,
        longitude: userLocation.longitude,
      };
    } else if (address) {
      payload.userLocation = { address };
    }
    customer = await Customer.create(payload);
  } else {
    let shouldSave = false;
    if (zone && mongoose.isValidObjectId(zone) && String(customer.zone || "") !== String(zone)) {
      customer.zone = zone;
      shouldSave = true;
    }
    if (department && customer.department !== department) {
      customer.department = department;
      shouldSave = true;
    }
    if (userLocation && typeof userLocation === "object") {
      customer.userLocation = {
        address:   userLocation.address || address || customer.userLocation?.address || "",
        latitude:  userLocation.latitude ?? customer.userLocation?.latitude,
        longitude: userLocation.longitude ?? customer.userLocation?.longitude,
      };
      shouldSave = true;
    } else if (address && !customer.userLocation?.address) {
      customer.userLocation = { address };
      shouldSave = true;
    }
    if (shouldSave) {
      await customer.save();
    }
  }
  return customer;
};

/** Raise a service call document */
const raiseServiceCall = async (customer, machine, category, division, callInput) => {
  const {
    serialNumber,
    issueDescription,
    priority = "Medium",
    callType = "Service-Call",
    note     = "",
  } = callInput;

  let zoneName = "";
  if (customer.zone) {
    const zDoc = await Zone.findById(customer.zone).lean();
    if (zDoc) zoneName = zDoc.code ? `${zDoc.name} (${zDoc.code})` : zDoc.name;
  }

  return ServiceCall.create({
    callId: generateCallId(),
    customerInfo: {
      customerId:       customer._id,
      customerUniqueId: customer.customerId || "",
      name:             customer.name,
      phone:            customer.phone,
      email:            customer.email || "",
      address:          customer.userLocation?.address || "",
      zone:             zoneName,
      gstNumber:        customer.gstNumber || "",
    },
    machines: [
      {
        machineId:        machine._id,
        machineName:      machine.name,
        modelNumber:      machine.modelNumber || "",
        hsnCode:          machine.hsnCode || "",
        serialNumber:     serialNumber || "",
        divisionId:       division._id,
        division:         division.name,
        categoryId:       category._id,
        category:         category.name,
        issueDescription,
        problemTypeIds:   [],
        problemTypes:     [],
        images:           [],
        usedParts:        [],
        counterReadings:  [],
      },
    ],
    status:    "Open",
    priority,
    callType,
    note,
    createdBy: "Admin",
    dates:     { created: new Date() },
  });
};

/** Mark a purchase serial as sold and update machine stock */
const markSerialSoldAndUpdateStock = async (purchaseId, machineId, serialNumber) => {
  await PurchasedMachine.updateOne(
    {
      _id: purchaseId,
      "machines.machineId": machineId,
      "machines.serialNumbers.serialNumber": serialNumber,
    },
    {
      $set: { "machines.$[m].serialNumbers.$[s].status": "sold" },
      $inc: { "machines.$[m].soldParts": 1, "machines.$[m].availableParts": -1 },
    },
    {
      arrayFilters: [
        { "m.machineId": machineId },
        { "s.serialNumber": serialNumber },
      ],
    }
  );

  await Machine.findByIdAndUpdate(machineId, { $inc: { currentStock: -1 } });

  const updated = await Machine.findById(machineId);
  if (updated) {
    const stockStatus =
      updated.currentStock <= 0
        ? "Out of Stock"
        : updated.lowStockThreshold >= 0 && updated.currentStock <= updated.lowStockThreshold
        ? "Low Stock"
        : "In Stock";
    await Machine.findByIdAndUpdate(machineId, { stockStatus });
  }
};

/** Create a SoldMachine document */
const createSoldMachineDoc = async ({
  machine, category, division, customer, serialNumber, sellingPrice = 0, companyId = null, contractData = null,
}) => {
  let companyInfo = null;
  if (companyId) {
    const company = await Company.findById(companyId).lean();
    if (company) {
      companyInfo = {
        companyId:         company._id,
        name:              company.name,
        tagline:           company.tagline || "",
        address:           company.address,
        phone:             company.phone,
        email:             company.email,
        gstNumber:         company.gstNumber || "",
        bankAccountNumber: company.bankAccountNumber || "",
        bankName:          company.bankName || "",
        ifscCode:          company.ifscCode || "",
        bankBranch:        company.bankBranch || "",
        qrCode:            company.qrCode || "",
      };
    }
  }

  // Contract snapshot if contract provided
  let contractTypeSnapshot = null;
  let resolvedPagesCategories = [];
  let minCopies = 0;

  if (contractData?.contractTypeId) {
    const ct = await ContractType.findById(contractData.contractTypeId).lean();
    if (ct) {
      contractTypeSnapshot = {
        contractTypeId: ct._id,
        name:           ct.name,
        code:           ct.code,
        freeService:    Boolean(ct.freeService),
        freeParts:      Boolean(ct.freeParts),
        validFrom:      contractData.validFrom ? new Date(contractData.validFrom) : new Date(),
        validTo:        contractData.validTo ? new Date(contractData.validTo) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      };

      const isTss =
        (process.env.TSS_CONTRACT_TYPE_ID && ct._id.toString() === process.env.TSS_CONTRACT_TYPE_ID.toString()) ||
        ct.code === "TSS" ||
        (ct.name && ct.name.toLowerCase().includes("total service support"));

      if (isTss) {
        minCopies = Number(contractData.minCopies) || 0;
        const inputCategories = Array.isArray(contractData.pagesCategories) ? contractData.pagesCategories : [];
        if (inputCategories.length === 0) {
          throw new Error("Pages categories are required (at least 1) for Total Service Support (TSS) contract");
        }

        const seenCatIds = new Set();
        for (const pc of inputCategories) {
          if (!pc.pagesCategoryId) {
            throw new Error("Pages category selection is required for each entry");
          }
          if (seenCatIds.has(pc.pagesCategoryId.toString())) {
            throw new Error("Duplicate pages category is not allowed in Total Service Support");
          }
          seenCatIds.add(pc.pagesCategoryId.toString());

          const cost = Number(pc.costPerPage);
          if (isNaN(cost) || cost < 0) {
            throw new Error("Cost per page must be a valid non-negative number");
          }

          let catName = pc.pagesCategory;
          if (!catName) {
            const pcDoc = await PagesCategory.findById(pc.pagesCategoryId).lean();
            catName = pcDoc?.name || "Page Category";
          }

          resolvedPagesCategories.push({
            pagesCategoryId: pc.pagesCategoryId,
            pagesCategory:   catName,
            costPerPage:     cost,
          });
        }
      }
    }
  }

  // Find buying price from purchase if available
  let buyingPriceBase = 0;
  const pur = await PurchasedMachine.findOne({
    "machines.serialNumbers.serialNumber": serialNumber,
    status: "active",
  }).lean();
  if (pur) {
    for (const pm of pur.machines || []) {
      if ((pm.serialNumbers || []).some((s) => s.serialNumber === serialNumber)) {
        buyingPriceBase = pm.buyingPriceBase ?? pm.buyingPriceWithGst ?? 0;
        break;
      }
    }
  }

  let zoneName = "";
  if (customer.zone) {
    const zDoc = await Zone.findById(customer.zone).lean();
    if (zDoc) zoneName = zDoc.code ? `${zDoc.name} (${zDoc.code})` : zDoc.name;
  }

  return SoldMachine.create({
    invoiceNumber: `QRC-SAL-${Date.now()}`,
    customerInfo: {
      customerId:       customer._id,
      customerUniqueId: customer.customerId || "",
      name:             customer.name,
      phone:            customer.phone,
      email:            customer.email || "",
      address:          customer.userLocation?.address || "",
      zone:             zoneName,
      department:       customer.department || "",
      gstNumber:        customer.gstNumber || "",
    },
    companyInfo,
    machines: [
      {
        machineId:              machine._id,
        machineName:            machine.name,
        modelNumber:            machine.modelNumber || "",
        partCode:               machine.partCode || "",
        hsnCode:                machine.hsnCode || "",
        categoryId:             category._id,
        category:               category.name,
        divisionId:             division._id,
        division:               division.name,
        quantity:               1,
        sellingPriceWithGst:    sellingPrice,
        sellingPriceBase:       sellingPrice,
        gstAmountPerUnit:       0,
        discount:               { percentage: 0, amount: 0 },
        netSellingPriceBase:    sellingPrice,
        netSellingPriceWithGst: sellingPrice,
        netGstAmountPerUnit:    0,
        sellingTotalBase:       sellingPrice,
        sellingTotalWithGst:    sellingPrice,
        gstAmountTotal:         0,
        serialNumbers: [
          {
            serialNumber,
            buyingPriceBase,
            minCopies,
            contractType:    contractTypeSnapshot,
            pagesCategories: resolvedPagesCategories,
            disInstalled:    false,
          },
        ],
        partCodes: null,
      },
    ],
    grandTotalBase:       sellingPrice,
    grandTotalWithGst:    sellingPrice,
    grandTotalGstAmount:  0,
    cogsTotalBase:        buyingPriceBase,
    cgst:                 { percent: 0, amount: 0 },
    sgst:                 { percent: 0, amount: 0 },
    igst:                 { percent: 0, amount: 0 },
    currentPaymentStatus: sellingPrice === 0 ? "Paid" : "Unpaid",
    paidAmount:           0,
    remainingAmount:      sellingPrice,
    status:               "active",
  });
};

// ═════════════════════════════════════════════════════════════════════════════
// MODE: "dummy"
// Auto-create dummy vendor → machine → ₹0 purchase → ₹0 sale → raise call
// ═════════════════════════════════════════════════════════════════════════════

const runDummyFlow = async (customerData, machineData, callInput, contractData = null) => {
  const { name, modelNumber = "", partCode, categoryId, divisionId, serialNumber } = machineData;

  // Step 0 — Validate Model Number + Serial Number uniqueness in Sold Machines
  if (serialNumber && modelNumber) {
    const existingSold = await SoldMachine.findOne({
      status: "active",
      machines: {
        $elemMatch: {
          modelNumber: { $regex: `^${escapeRegex(modelNumber.trim())}$`, $options: "i" },
          "serialNumbers.serialNumber": { $regex: `^${escapeRegex(serialNumber.trim())}$`, $options: "i" },
        },
      },
    }).lean();

    if (existingSold) {
      throw new Error(`Serial Number "${serialNumber.trim()}" already exists for Model Number "${modelNumber.trim()}". Duplicate serial numbers for the same model are not allowed.`);
    }
  }

  // Validate category & division
  const [category, division] = await Promise.all([
    MachineCategory.findById(categoryId),
    MachineDivision.findById(divisionId),
  ]);
  if (!category) throw new Error(`MachineCategory not found: ${categoryId}`);
  if (!division) throw new Error(`MachineDivision not found: ${divisionId}`);

  // Step 1 — dummy vendor
  const vendor = await ensureDummyVendor();

  // Step 2 — customer
  const customer = await ensureCustomer(customerData);

  // Step 3 — machine item
  let machine = await Machine.findOne({ name, category: categoryId, modelNumber });
  if (!machine) {
    machine = await Machine.create({
      name,
      modelNumber,
      partCode: partCode || `PC-${Date.now()}`,
      category: categoryId,
      division: divisionId,
      currentStock: 0,
      stockStatus:  "Out of Stock",
      status:       "Active",
      source:       "manual",
    });
  }

  // Step 4 — ₹0 purchase (check if available serial already exists)
  let purchase = await PurchasedMachine.findOne({
    "vendorInfo.vendorId": vendor._id,
    "machines.machineId":  machine._id,
    "machines.serialNumbers": { $elemMatch: { serialNumber, status: "available" } },
    status: "active",
  });

  if (!purchase) {
    purchase = await PurchasedMachine.create({
      invoiceNumber: `QRC-PUR-${Date.now()}`,
      vendorInfo: {
        vendorId:    vendor._id,
        name:        vendor.name,
        phone:       vendor.phone,
        email:       vendor.email || "",
        companyName: vendor.companyName,
        gstNumber:   vendor.gstNumber || "",
      },
      gstConfig: { cgst: 0, sgst: 0, igst: 0, totalGst: 0 },
      machines: [
        {
          machineId:          machine._id,
          machineName:        machine.name,
          modelNumber:        machine.modelNumber || "",
          partCode:           machine.partCode || "",
          categoryId:         category._id,
          category:           category.name,
          divisionId:         division._id,
          division:           division.name,
          quantity:           1,
          buyingPriceWithGst: 0,
          buyingPriceBase:    0,
          gstAmountPerUnit:   0,
          buyingTotalWithGst: 0,
          buyingTotalBase:    0,
          gstAmountTotal:     0,
          availableParts:     1,
          soldParts:          0,
          serialNumbers:      [{ serialNumber, status: "available" }],
        },
      ],
      grandTotalWithGst:   0,
      grandTotalBase:      0,
      grandTotalGstAmount: 0,
      status:              "active",
    });

    // Update stock after creating purchase
    await Machine.findByIdAndUpdate(machine._id, {
      $inc: { currentStock: 1 },
      stockStatus: "In Stock",
    });
  }

  // Step 5 — ₹0 sale
  await markSerialSoldAndUpdateStock(purchase._id, machine._id, serialNumber);
  const sale = await createSoldMachineDoc({ machine, category, division, customer, serialNumber, sellingPrice: 0, contractData });

  // Step 6 — raise call (optional)
  let serviceCall = null;
  if (callInput?.issueDescription) {
    serviceCall = await raiseServiceCall(customer, machine, category, division, { ...callInput, serialNumber });
  }

  return { vendor, customer, machine, purchase, sale, serviceCall };
};

// ═════════════════════════════════════════════════════════════════════════════
// MODE: "existing"
// Use a real vendor + existing machine with available stock → sell → raise call
// ═════════════════════════════════════════════════════════════════════════════

const runExistingFlow = async (customerData, existingData, callInput, contractData = null) => {
  const { vendorId, machineId, serialNumber, sellingPrice = 0, companyId = null } = existingData;

  if (!vendorId)     throw new Error("existing.vendorId is required for mode 'existing'");
  if (!machineId)    throw new Error("existing.machineId is required for mode 'existing'");
  if (!serialNumber) throw new Error("existing.serialNumber is required for mode 'existing'");

  // Validate vendor exists
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) throw new Error(`Vendor not found: ${vendorId}`);

  // Validate machine exists
  const machine = await Machine.findById(machineId).populate("category").populate("division");
  if (!machine) throw new Error(`Machine not found: ${machineId}`);

  // Step 0 — Validate Model Number + Serial Number uniqueness in Sold Machines
  if (serialNumber && machine.modelNumber) {
    const existingSold = await SoldMachine.findOne({
      status: "active",
      machines: {
        $elemMatch: {
          modelNumber: { $regex: `^${escapeRegex(machine.modelNumber.trim())}$`, $options: "i" },
          "serialNumbers.serialNumber": { $regex: `^${escapeRegex(serialNumber.trim())}$`, $options: "i" },
        },
      },
    }).lean();

    if (existingSold) {
      throw new Error(`Serial Number "${serialNumber.trim()}" already exists for Model Number "${machine.modelNumber.trim()}". Duplicate serial numbers for the same model are not allowed.`);
    }
  }

  const category = await MachineCategory.findById(machine.category);
  const division = await MachineDivision.findById(machine.division);
  if (!category) throw new Error("Machine's category not found");
  if (!division) throw new Error("Machine's division not found");

  // Find an existing purchase from this vendor with this machine + serial available
  const purchase = await PurchasedMachine.findOne({
    "vendorInfo.vendorId":    vendor._id,
    "machines.machineId":     machine._id,
    "machines.serialNumbers": { $elemMatch: { serialNumber, status: "available" } },
    status: "active",
  });

  if (!purchase) {
    throw new Error(
      `No available purchase found for vendor "${vendor.name}", machine "${machine.name}", serial "${serialNumber}". ` +
      `Please use mode "dummy" to auto-create, or create a purchase manually first.`
    );
  }

  // Step 1 — customer (find or create)
  const customer = await ensureCustomer(customerData);

  // Step 2 — sell the machine (mark serial sold + create sale document)
  await markSerialSoldAndUpdateStock(purchase._id, machine._id, serialNumber);
  const sale = await createSoldMachineDoc({ machine, category, division, customer, serialNumber, sellingPrice, companyId, contractData });

  // Step 3 — raise call (optional)
  let serviceCall = null;
  if (callInput?.issueDescription) {
    serviceCall = await raiseServiceCall(customer, machine, category, division, { ...callInput, serialNumber });
  }

  return { vendor, customer, machine, purchase, sale, serviceCall };
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN CONTROLLER — POST /api/admin/quick-raise-call
// ═════════════════════════════════════════════════════════════════════════════

/**
 * quickRaiseCall
 *
 * Request body (mode = "dummy" — default):
 * {
 *   "mode": "dummy",
 *   "customer": { "name", "phone", "email"?, "address"? },
 *   "machine":  { "name", "modelNumber"?, "partCode"?, "categoryId", "divisionId", "serialNumber" },
 *   "call":     { "issueDescription", "priority"?, "callType"?, "note"? }
 * }
 *
 * Request body (mode = "existing"):
 * {
 *   "mode": "existing",
 *   "customer":  { "name", "phone", "email"?, "address"? },
 *   "existing":  { "vendorId", "machineId", "serialNumber", "sellingPrice"? },
 *   "call":      { "issueDescription", "priority"?, "callType"?, "note"? }
 * }
 */
const quickRaiseCall = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      mode = "dummy",
      customer: customerData,
      machine: machineData,
      existing: existingData,
      call: callInput,
      contract: contractData,
    } = req.body;

    // ── Common validations ────────────────────────────────────────────────────
    if (!customerData?.name || !customerData?.phone)
      return res.status(400).json({ success: false, message: "customer.name and customer.phone are required" });

    const phoneDigits = (customerData.phone || "").replace(/\D/g, "");
    if (phoneDigits.length !== 10)
      return res.status(400).json({ success: false, message: "customer.phone must be exactly 10 digits" });

    if (!customerData?.zone || customerData.zone === "none" || !mongoose.isValidObjectId(customerData.zone))
      return res.status(400).json({ success: false, message: "customer.zone is required. Please select a valid Service Zone." });

    if (!["dummy", "existing"].includes(mode))
      return res.status(400).json({ success: false, message: 'mode must be "dummy" or "existing"' });

    // ── Mode-specific validations ─────────────────────────────────────────────
    if (mode === "dummy") {
      if (!machineData?.name || !machineData?.categoryId || !machineData?.divisionId || !machineData?.serialNumber)
        return res.status(400).json({
          success: false,
          message: "For mode 'dummy': machine.name, machine.categoryId, machine.divisionId, machine.serialNumber are required",
        });
    }

    if (mode === "existing") {
      if (!existingData?.vendorId || !existingData?.machineId || !existingData?.serialNumber)
        return res.status(400).json({
          success: false,
          message: "For mode 'existing': existing.vendorId, existing.machineId, existing.serialNumber are required",
        });
    }

    // ── Run the correct flow ──────────────────────────────────────────────────
    let result;
    if (mode === "dummy") {
      result = await runDummyFlow(customerData, machineData, callInput, contractData);
    } else {
      result = await runExistingFlow(customerData, existingData, callInput, contractData);
    }

    const { vendor, customer, machine, purchase, sale, serviceCall } = result;

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: `Quick Raise Call (mode: ${mode}) completed successfully`,
      data: {
        mode,
        vendor:      { _id: vendor._id,      name: vendor.name,      phone: vendor.phone },
        customer:    { _id: customer._id,     name: customer.name,    phone: customer.phone },
        machine:     { _id: machine._id,      name: machine.name,     modelNumber: machine.modelNumber || "", partCode: machine.partCode, serialNumber: result.machine?.serialNumber || machineData?.serialNumber || existingData?.serialNumber },
        purchase:    { _id: purchase._id,     invoiceNumber: purchase.invoiceNumber },
        sale:        { _id: sale._id,         invoiceNumber: sale.invoiceNumber },
        serviceCall: serviceCall ? { _id: serviceCall._id,  callId: serviceCall.callId, status: serviceCall.status } : null,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("[quickRaiseCall] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message || "Internal server error" });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// STATUS endpoint — GET /api/admin/quick-raise-call/status?serialNumber=<sn>
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns a summary of what already exists for a serial number.
 * Frontend can use this to decide which mode to show.
 */
const getQuickRaiseStatus = async (req, res) => {
  try {
    const { serialNumber } = req.query;
    if (!serialNumber)
      return res.status(400).json({ success: false, message: "serialNumber query param required" });

    const [dummyVendor, availablePurchases, sale, call] = await Promise.all([
      // Is a dummy vendor set up?
      Vendor.findOne({
        $or: [{ name: DUMMY_VENDOR_NAME }, { phone: DUMMY_VENDOR_PHONE }],
      }).select("name phone status").lean(),

      // All purchases that have this serial as "available" (with vendor info)
      PurchasedMachine.find({
        "machines.serialNumbers": { $elemMatch: { serialNumber, status: "available" } },
        status: "active",
      }).select("invoiceNumber vendorInfo machines.$").lean(),

      // Has this serial been sold?
      SoldMachine.findOne({ "machines.serialNumbers.serialNumber": serialNumber })
        .select("invoiceNumber customerInfo status")
        .lean(),

      // Latest call for this serial
      ServiceCall.findOne({ "machines.serialNumber": serialNumber })
        .sort({ createdAt: -1 })
        .select("callId status createdAt")
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        dummyVendorExists:       !!dummyVendor,
        dummyVendor,
        availablePurchasesCount: availablePurchases.length,
        availablePurchases,        // frontend can pick a vendorId + machineId from here for mode "existing"
        saleExists:              !!sale,
        sale,
        callExists:              !!call,
        latestCall:              call,
        recommendation:
          availablePurchases.length > 0
            ? 'Use mode "existing" — available stock found'
            : 'Use mode "dummy" — no existing stock, will auto-create',
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// VENDORS endpoint — GET /api/admin/quick-raise-call/vendors
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns all vendors with a flag showing whether each is the
 * system Dummy Vendor or a Real Vendor.
 * Also shows how many available serial numbers (stock) each vendor
 * has across all active purchases — useful for the frontend to
 * decide which vendor to pick for mode "existing".
 *
 * Response shape:
 * {
 *   success: true,
 *   data: {
 *     dummyVendorExists: boolean,
 *     vendors: [
 *       {
 *         _id, name, companyName, phone, email, status,
 *         isDummy: true | false,
 *         availableStockCount: number,   // total available serials in purchases
 *         machines: [                    // distinct machines with available stock
 *           { machineId, machineName, modelNumber, availableSerials: [...] }
 *         ]
 *       },
 *       ...
 *     ]
 *   }
 * }
 */
const getVendors = async (req, res) => {
  try {
    // 1. Fetch all active vendors
    const allVendors = await Vendor.find({ status: "Active" })
      .select("name companyName phone email address status")
      .lean();

    // 2. Fetch all active purchases grouped by vendorId
    //    Allow case-insensitive "active" status
    const activePurchases = await PurchasedMachine.find({
      $or: [
        { status: "active" },
        { status: "Active" },
        { status: { $exists: false } },
        { status: null },
      ],
    })
      .select("vendorInfo machines status")
      .lean();

    // Build a map: vendorId -> { availableStockCount, machines[] }
    const vendorStockMap = {};

    for (const purchase of activePurchases) {
      const vid = purchase.vendorInfo?.vendorId?.toString();
      if (!vid) continue;

      if (!vendorStockMap[vid]) {
        vendorStockMap[vid] = { availableStockCount: 0, machines: [] };
      }

      for (const m of purchase.machines || []) {
        // Filter by Product category
        let isProduct =
          (process.env.PRODUCT_CATEGORY_ID && m.categoryId?.toString() === process.env.PRODUCT_CATEGORY_ID.toString()) ||
          (m.category && m.category.toLowerCase().includes("product"));

        if (!isProduct && m.machineId) {
          const machDoc = await Machine.findById(m.machineId).select("category").lean();
          if (
            machDoc &&
            process.env.PRODUCT_CATEGORY_ID &&
            machDoc.category?.toString() === process.env.PRODUCT_CATEGORY_ID.toString()
          ) {
            isProduct = true;
          }
        }

        if (!isProduct) continue;

        const availableSerials = (m.serialNumbers || [])
          .filter((s) => s.status === "available")
          .map((s) => s.serialNumber);

        if (availableSerials.length === 0) continue;

        vendorStockMap[vid].availableStockCount += availableSerials.length;

        // Check if this machine is already in the list for this vendor
        const existing = vendorStockMap[vid].machines.find(
          (x) => x.machineId?.toString() === m.machineId?.toString()
        );
        if (existing) {
          existing.availableSerials.push(...availableSerials);
          existing.availableSerials = Array.from(new Set(existing.availableSerials));
        } else {
          vendorStockMap[vid].machines.push({
            machineId:          m.machineId,
            machineName:        m.machineName,
            modelNumber:        m.modelNumber || "",
            partCode:           m.partCode || "",
            categoryId:         m.categoryId,
            category:           m.category || "",
            divisionId:         m.divisionId,
            division:           m.division || "",
            buyingPriceBase:    m.buyingPriceBase ?? 0,
            buyingPriceWithGst: m.buyingPriceWithGst ?? m.buyingPriceBase ?? 0,
            availableSerials,
          });
        }
      }
    }

    // 3. Annotate each vendor with isDummy flag + stock info
    const vendors = allVendors.map((v) => {
      const vid    = v._id.toString();
      const stock  = vendorStockMap[vid] || { availableStockCount: 0, machines: [] };
      const isDummy = v.name === DUMMY_VENDOR_NAME || v.phone === DUMMY_VENDOR_PHONE;

      return {
        ...v,
        isDummy,
        vendorType:          isDummy ? "Dummy Vendor" : "Real Vendor",
        availableStockCount: stock.availableStockCount,
        machines:            stock.machines,
      };
    });

    // 4. Sort: Dummy vendor first, then real vendors alphabetically
    vendors.sort((a, b) => {
      if (a.isDummy && !b.isDummy) return -1;
      if (!a.isDummy && b.isDummy) return 1;
      return a.name.localeCompare(b.name);
    });

    const dummyVendorExists = vendors.some((v) => v.isDummy);

    return res.status(200).json({
      success: true,
      data: {
        dummyVendorExists,
        totalVendors:      vendors.length,
        realVendorCount:   vendors.filter((v) => !v.isDummy).length,
        vendors,
      },
    });
  } catch (err) {
    console.error("[getVendors] Error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/admin/quick-raise-call/check-model-serial?modelNumber=<mn>&serialNumber=<sn>
 * Verifies if a serial number already exists for a model number in sold customer machines.
 * Allows the same serial number on different models.
 */
const checkModelSerial = async (req, res) => {
  try {
    const { modelNumber = "", serialNumber = "" } = req.query;
    const trimmedSerial = serialNumber.trim();
    const trimmedModel = modelNumber.trim();

    if (!trimmedSerial) {
      return res.status(400).json({ success: false, message: "serialNumber query param required" });
    }

    const query = {
      status: "active",
      "machines.serialNumbers.serialNumber": { $regex: `^${escapeRegex(trimmedSerial)}$`, $options: "i" },
    };

    if (trimmedModel) {
      query["machines.modelNumber"] = { $regex: `^${escapeRegex(trimmedModel)}$`, $options: "i" };
    }

    const existing = await SoldMachine.findOne(query).select("invoiceNumber customerInfo machines.$").lean();

    if (existing) {
      return res.status(200).json({
        success: true,
        available: false,
        message: `Serial Number "${trimmedSerial}" already exists for Model Number "${trimmedModel || "any"}"`,
      });
    }

    return res.status(200).json({
      success: true,
      available: true,
      message: `Serial Number "${trimmedSerial}" is available for Model "${trimmedModel || "any"}"`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { quickRaiseCall, getQuickRaiseStatus, getVendors, checkModelSerial };
