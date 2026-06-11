const ServiceCall = require("../../customer/calls/customer.serviceCall.model");
const SoldMachine = require("../soldMachines/admin.soldMachine.model");
const Machine = require("../inventoryManagement/admin.machine.model");
const Customer = require("../customerManagement/admin.customer.model");
const ProblemType = require("../problemTypeManagement/admin.problemType.model");
const mongoose = require("mongoose");
const AdminUser = require("../auth/admin.user.model");
const path = require("path");
const fs   = require("fs/promises");
const sharp = require("sharp");

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getCalls = async (req, res) => {
  try {
    const { status, search, problemTypeId, machineName, customerName, engineerName, category, division, fromDate, toDate, contractTypeId, contractTypeStatus, page = 1, limit = 10 } = req.query;

    const query = {};

    if (status) query.status = status;
    if (req.query.callType) query.callType = req.query.callType;

    if (search) {
      const s = escapeRegex(search.trim().slice(0, 100));
      query.$or = [
        { callId:               { $regex: s, $options: "i" } },
        { "customerInfo.name":  { $regex: s, $options: "i" } },
        { "customerInfo.phone": { $regex: s, $options: "i" } },
        { "engineerInfo.name":  { $regex: s, $options: "i" } },
      ];
    }

    if (problemTypeId && mongoose.isValidObjectId(problemTypeId)) query["machines.problemTypeIds"] = new mongoose.Types.ObjectId(problemTypeId);
    if (machineName)  query["machines.machineName"]   = { $regex: escapeRegex(machineName), $options: "i" };
    if (req.query.serialNumber) query["machines.serialNumber"] = { $regex: escapeRegex(req.query.serialNumber.trim()), $options: "i" };
    if (customerName) query["customerInfo.name"]       = { $regex: escapeRegex(customerName), $options: "i" };
    if (engineerName) query["engineerInfo.name"]       = { $regex: escapeRegex(engineerName), $options: "i" };
    if (category && mongoose.isValidObjectId(category)) query["machines.categoryId"] = new mongoose.Types.ObjectId(category);
    if (division && mongoose.isValidObjectId(division)) query["machines.divisionId"] = new mongoose.Types.ObjectId(division);

    if (contractTypeId && mongoose.isValidObjectId(contractTypeId))
      query["machines.contractType.contractTypeId"] = new mongoose.Types.ObjectId(contractTypeId);

    if (contractTypeStatus === "Active") {
      query["machines"] = { $not: { $elemMatch: { "contractType.validTo": { $lt: new Date() } } } };
    } else if (contractTypeStatus === "Expired") {
      query["machines"] = { $elemMatch: { "contractType.validTo": { $lt: new Date() } } };
    }

    if (fromDate || toDate) {
      const parseIST = (ddmmyy, endOfDay = false) => {
        const [dd, mm, yy] = ddmmyy.split("/");
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const base = Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
        return new Date(base - istOffsetMs);
      };
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = parseIST(fromDate, false);
      if (toDate)   query.createdAt.$lte = parseIST(toDate, true);
    }

    const sortKey = status === "Assigned"    ? "dates.assigned"
      : status === "In Progress" ? "dates.inProgress"
      : status === "On Hold"     ? "dates.onHold"
      : status === "Completed"   ? "dates.completed"
      : status === "Cancelled"   ? "dates.cancelled"
      : "createdAt";

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [calls, total] = await Promise.all([
      ServiceCall.find(query)
        .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt callType createdBy")
        .sort({ [sortKey]: -1 })
        .skip(skip)
        .limit(limitNum),
      ServiceCall.countDocuments(query),
    ]);

    const response = {
      success: true,
      data: calls,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    };

    if (!status && !search && !problemTypeId && !machineName && !customerName && !engineerName && !category && !division && !fromDate && !toDate && !contractTypeId && !contractTypeStatus) {
      const statusCounts = await ServiceCall.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
      const stats = { total: 0, open: 0, assigned: 0, inProgress: 0, onHold: 0, completed: 0, cancelled: 0 };
      let grandTotal = 0;
      for (const { _id, count } of statusCounts) {
        grandTotal += count;
        if (_id === "Open")           stats.open       = count;
        else if (_id === "Assigned")    stats.assigned   = count;
        else if (_id === "In Progress") stats.inProgress = count;
        else if (_id === "On Hold")     stats.onHold     = count;
        else if (_id === "Completed")   stats.completed  = count;
        else if (_id === "Cancelled")   stats.cancelled  = count;
      }
      stats.total = grandTotal;
      response.stats = stats;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching calls:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch calls" });
  }
};

const getCallDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const serviceCall = await ServiceCall.findById(id);
    if (!serviceCall)
      return res.status(404).json({ success: false, message: "Service call not found" });
    return res.status(200).json({ success: true, data: serviceCall });
  } catch (error) {
    console.error("Error fetching call detail:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch call detail" });
  }
};

const assignEngineer = async (req, res) => {
  try {
    const { id } = req.params;
    const { engineerId, companyId, cgst, sgst, igst } = req.body;

    if (!mongoose.isValidObjectId(engineerId))
      return res.status(400).json({ success: false, message: "Invalid engineerId" });

    const engineer = await AdminUser.findOne({ _id: engineerId, role: "Engineer", status: "Active" })
      .select("_id engineerId name email phone");
    if (!engineer)
      return res.status(404).json({ success: false, message: "Active engineer not found" });

    const call = await ServiceCall.findOne({ _id: id, status: { $in: ["Open", "Assigned"] } });
    if (!call)
      return res.status(400).json({ success: false, message: "Call not found or cannot be assigned in current status" });

    // Resolve company
    let companyInfo = call.companyInfo ?? null;
    if (companyId !== undefined) {
      if (companyId === null) {
        companyInfo = null;
      } else {
        if (!mongoose.isValidObjectId(companyId))
          return res.status(400).json({ success: false, message: "Invalid companyId" });
        const Company = require("../companyManagement/admin.company.model");
        const company = await Company.findById(companyId);
        if (!company)
          return res.status(404).json({ success: false, message: "Company not found" });
        companyInfo = {
          companyId: company._id,
          name:      company.name,
          address:   company.address,
          phone:     company.phone,
          email:     company.email,
          gstNumber: company.gstNumber || "",
        };
      }
    }

    // Resolve GST
    const cgstPercent = cgst !== undefined ? Number(cgst) : (call.cgst?.percent ?? 0);
    const sgstPercent = sgst !== undefined ? Number(sgst) : (call.sgst?.percent ?? 0);
    const igstPercent = igst !== undefined ? Number(igst) : (call.igst?.percent ?? 0);

    const basicTotal     = call.totalCharges ?? call.totalServiceCharges ?? 0;
    const cgstAmount     = Math.round(basicTotal * cgstPercent / 100 * 100) / 100;
    const sgstAmount     = Math.round(basicTotal * sgstPercent / 100 * 100) / 100;
    const igstAmount     = Math.round(basicTotal * igstPercent / 100 * 100) / 100;
    const invoiceGrandTotal = Math.round((basicTotal + cgstAmount + sgstAmount + igstAmount) * 100) / 100;

    await call.updateOne({
      engineerInfo: {
        _id:        engineer._id,
        identityId: engineer.engineerId,
        name:       engineer.name,
        email:      engineer.email,
        phone:      engineer.phone,
      },
      status: "Assigned",
      "dates.assigned": new Date(),
      companyInfo,
      cgst: { percent: cgstPercent, amount: cgstAmount },
      sgst: { percent: sgstPercent, amount: sgstAmount },
      igst: { percent: igstPercent, amount: igstAmount },
      invoiceGrandTotal,
    });

    return res.status(200).json({ success: true, data: await ServiceCall.findById(id) });
  } catch (error) {
    console.error("Error assigning engineer:", error);
    return res.status(500).json({ success: false, message: "Failed to assign engineer" });
  }
};

const VALID_PRIORITIES = ["Low", "Medium", "High", "Critical"];

const STATUS_TRANSITIONS = {
  "Open":             ["Assigned", "Cancelled"],
  "Assigned":         ["Travel Started", "Cancelled"],
  "Travel Started":   ["Reached Location", "Cancelled"],
  "Reached Location": ["In Progress", "Cancelled"],
  "In Progress":      ["On Hold", "Completed", "Cancelled"],
  "On Hold":          ["In Progress", "Cancelled"],
};

const STATUS_DATE_MAP = {
  "Assigned":         "dates.assigned",
  "Travel Started":   "dates.travelStarted",
  "Reached Location": "dates.reachedLocation",
  "In Progress":      "dates.inProgress",
  "On Hold":          "dates.onHold",
  "Completed":        "dates.completed",
  "Cancelled":        "dates.cancelled",
};

const updateCall = async (req, res) => {
  try {
    const { id } = req.params;
    const { note, priority, status, companyId } = req.body;

    const call = await ServiceCall.findById(id);
    if (!call)
      return res.status(404).json({ success: false, message: "Service call not found" });

    const update = {};

    if (note !== undefined) {
      if (typeof note !== "string" || !note.trim())
        return res.status(400).json({ success: false, message: "Note cannot be empty" });
      update.note = note.trim();
    }

    if (priority !== undefined) {
      if (!VALID_PRIORITIES.includes(priority))
        return res.status(400).json({ success: false, message: "Invalid priority" });
      update.priority = priority;
    }

    if (status !== undefined) {
      const allowed = STATUS_TRANSITIONS[call.status] ?? [];
      if (!allowed.includes(status))
        return res.status(400).json({ success: false, message: `Cannot transition from ${call.status} to ${status}` });
      update.status = status;
      const dateField = STATUS_DATE_MAP[status];
      if (dateField) update[dateField] = new Date();
    }

    if (companyId !== undefined) {
      if (companyId === null) {
        update.companyInfo = null;
      } else {
        if (!mongoose.isValidObjectId(companyId))
          return res.status(400).json({ success: false, message: "Invalid companyId" });
        const Company = require("../companyManagement/admin.company.model");
        const company = await Company.findById(companyId);
        if (!company)
          return res.status(404).json({ success: false, message: "Company not found" });
        update.companyInfo = {
          companyId: company._id,
          name:      company.name,
          address:   company.address,
          phone:     company.phone,
          email:     company.email,
          gstNumber: company.gstNumber || "",
        };
      }
    }

    if (!Object.keys(update).length)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    const updated = await ServiceCall.findByIdAndUpdate(id, update, { new: true });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error("Error updating call:", err);
    return res.status(500).json({ success: false, message: "Failed to update call" });
  }
};

const getCustomerMachines = async (req, res) => {
  try {
    const { customerId, serialNumber, category, division, page = 1, limit = 10 } = req.query;

    if (customerId && !mongoose.isValidObjectId(customerId))
      return res.status(400).json({ success: false, message: "Invalid customerId" });

    const soldRecords = await SoldMachine.find(customerId ? { "customerInfo.customerId": customerId } : {}).sort({ createdAt: -1 });
    if (soldRecords.length === 0)
      return res.status(200).json({ success: true, data: [], pagination: { total: 0, page: 1, limit: parseInt(limit), totalPages: 0 } });

    const machineIds = [...new Set(soldRecords.flatMap(r => r.machines.map(m => m.machineId).filter(Boolean)))];
    const machineList = await Machine.find({ _id: { $in: machineIds } }).select("_id images");
    const machineImagesMap = new Map(machineList.map(m => [m._id.toString(), m.images]));

    let allData = soldRecords.flatMap(record =>
      record.machines.flatMap(machine =>
        (machine.serialNumbers || []).map(entry => ({
          customerInfo: record.customerInfo,
          machineId:    machine.machineId,
          machineName:  machine.machineName,
          modelNumber:  machine.modelNumber,
          categoryId:   machine.categoryId,
          category:     machine.category,
          divisionId:   machine.divisionId,
          division:     machine.division,
          images:       machine.machineId ? machineImagesMap.get(machine.machineId.toString()) || [] : [],
          serialNumber: entry.serialNumber,
          contractType: entry.contractType,
          createdAt:    record.createdAt,
          updatedAt:    record.updatedAt,
        }))
      )
    );

    if (serialNumber) {
      const sn = serialNumber.toString().toLowerCase();
      allData = allData.filter(m => m.serialNumber?.toLowerCase().includes(sn));
    }
    if (category && mongoose.isValidObjectId(category))
      allData = allData.filter(m => m.categoryId?.toString() === category);
    if (division && mongoose.isValidObjectId(division))
      allData = allData.filter(m => m.divisionId?.toString() === division);

    const total    = allData.length;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;
    const data     = allData.slice(skip, skip + limitNum);

    return res.status(200).json({ success: true, data, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getCustomerMachineDetail = async (req, res) => {
  try {
    const { serialNumber } = req.query;

    if (!serialNumber?.trim())
      return res.status(400).json({ success: false, message: "serialNumber is required" });

    const soldRecord = await SoldMachine.findOne({ "machines.serialNumbers.serialNumber": serialNumber.trim() });
    if (!soldRecord)
      return res.status(404).json({ success: false, message: "Machine not found for this serial number" });

    let resultMachine = null;
    for (const machine of soldRecord.machines) {
      const entry = (machine.serialNumbers || []).find(e => e.serialNumber === serialNumber.trim());
      if (entry) {
        let images = [];
        if (machine.machineId) {
          const machineDoc = await Machine.findById(machine.machineId).select("images");
          images = machineDoc?.images || [];
        }
        resultMachine = {
          machineId:       machine.machineId,
          machineName:     machine.machineName,
          modelNumber:     machine.modelNumber,
          categoryId:      machine.categoryId,
          category:        machine.category,
          divisionId:      machine.divisionId,
          division:        machine.division,
          serialNumber:    entry.serialNumber,
          contractType:    entry.contractType,
          pagesCategories: entry.pagesCategories ?? [],
          images,
        };
        break;
      }
    }

    // Fetch last counter readings for this serial number from the most recent completed service call
    const lastCall = await ServiceCall.findOne({
      "machines.serialNumber": serialNumber.trim(),
      "machines.counterReadings.serialNumber": serialNumber.trim(),
    })
      .sort({ "dates.completed": -1, createdAt: -1 })
      .select("machines.serialNumber machines.counterReadings");

    let lastReadings = [];
    if (lastCall) {
      const machine = lastCall.machines.find(m => m.serialNumber === serialNumber.trim());
      const counterReading = machine?.counterReadings?.find(cr => cr.serialNumber === serialNumber.trim());
      if (counterReading?.categories?.length) {
        lastReadings = counterReading.categories.map(c => ({
          pagesCategoryId: c.pagesCategoryId,
          pagesCategory:   c.pagesCategory,
          lastReading:     c.currentReading,
        }));
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        customerInfo: soldRecord.customerInfo,
        machine:      resultMachine,
        lastReadings,
        createdAt:    soldRecord.createdAt,
        updatedAt:    soldRecord.updatedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const IMAGES_DIR = process.env.NODE_ENV === "production"
  ? "/app/cloud/images/service-calls"
  : path.join(__dirname, "../../../cloud/images/service-calls");

const _createdDirs = new Set();
const _uploadImage = async (buffer, filename) => {
  if (!_createdDirs.has(IMAGES_DIR)) {
    await fs.mkdir(IMAGES_DIR, { recursive: true });
    _createdDirs.add(IMAGES_DIR);
  }
  await sharp(buffer)
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 70, effort: 1, smartSubsample: true })
    .toFile(path.join(IMAGES_DIR, filename));
  return `${process.env.BACKEND_URL}/app/cloud/images/service-calls/${filename}`;
};

const raiseServiceCall = async (req, res) => {
  try {
    const { customerId, callType = "Service-Call", machines: machinesRaw, customerLocation: customerLocationRaw } = req.body;

    const validCallTypes = ["Service-Call", "Installation", "Deinstallation", "Counter-Reading", "Others"];
    if (!validCallTypes.includes(callType))
      return res.status(400).json({ success: false, message: "Invalid callType" });
    if (!mongoose.isValidObjectId(customerId))
      return res.status(400).json({ success: false, message: "Invalid customerId" });

    let parsedCustomerLocation;
    if (customerLocationRaw) {
      try {
        parsedCustomerLocation = typeof customerLocationRaw === "string" ? JSON.parse(customerLocationRaw) : customerLocationRaw;
      } catch (_) {
        return res.status(400).json({ success: false, message: "Invalid customerLocation format" });
      }
      const { address: locAddr, latitude: lat, longitude: lng } = parsedCustomerLocation;
      if (!locAddr || typeof locAddr !== "string" || !locAddr.trim())
        return res.status(400).json({ success: false, message: "customerLocation.address must be a non-empty string" });
      if (!Number.isFinite(lat) || lat < -90 || lat > 90)
        return res.status(400).json({ success: false, message: "customerLocation.latitude must be between -90 and 90" });
      if (!Number.isFinite(lng) || lng < -180 || lng > 180)
        return res.status(400).json({ success: false, message: "customerLocation.longitude must be between -180 and 180" });
    }

    let parsedMachines;
    try {
      parsedMachines = typeof machinesRaw === "string" ? JSON.parse(machinesRaw) : machinesRaw;
    } catch (_) {
      return res.status(400).json({ success: false, message: "Invalid machines format" });
    }

    if (!Array.isArray(parsedMachines) || parsedMachines.length === 0)
      return res.status(400).json({ success: false, message: "machines must be a non-empty array" });

    for (let i = 0; i < parsedMachines.length; i++) {
      const m = parsedMachines[i];
      if (!m.serialNumber?.trim())
        return res.status(400).json({ success: false, message: `serialNumber is required at index ${i}` });
      if (!m.issueDescription?.trim())
        return res.status(400).json({ success: false, message: `issueDescription is required at index ${i}` });
    }

    const customer = await Customer.findOne({ _id: customerId, status: "Active" }).populate("zone");
    if (!customer)
      return res.status(404).json({ success: false, message: "Customer not found or inactive" });

    const serialNumbers = parsedMachines.map(m => m.serialNumber.trim());
    const soldRecords = await SoldMachine.find({
      "customerInfo.customerId": customerId,
      "machines.serialNumbers.serialNumber": { $in: serialNumbers },
    });
    if (soldRecords.length === 0)
      return res.status(404).json({ success: false, message: "No machines found for this customer" });

    const allPtIds = [...new Set(parsedMachines.flatMap(m => Array.isArray(m.problemTypeIds) ? m.problemTypeIds : []).filter(Boolean))];
    const ptDocs   = allPtIds.length > 0 ? await ProblemType.find({ _id: { $in: allPtIds } }) : [];
    const ptMap    = new Map(ptDocs.map(p => [p._id.toString(), p.name]));

    const filesByIndex = {};
    for (const file of (req.files || [])) {
      const match = file.fieldname.match(/^images_(\d+)$/);
      if (match) {
        const idx = parseInt(match[1]);
        (filesByIndex[idx] = filesByIndex[idx] || []).push(file);
      }
    }

    const machineEntries = [];
    for (let i = 0; i < parsedMachines.length; i++) {
      const { serialNumber, issueDescription, problemTypeIds = [], serviceCharge } = parsedMachines[i];
      const sn = serialNumber.trim();

      let foundMachine = null;
      let foundEntry = null;
      outer: for (const record of soldRecords) {
        for (const machine of record.machines) {
          const entry = (machine.serialNumbers || []).find(e => e.serialNumber === sn);
          if (entry) {
            foundMachine = machine;
            foundEntry = entry;
            break outer;
          }
        }
      }

      if (!foundMachine)
        return res.status(404).json({ success: false, message: `Serial number "${sn}" not found for this customer` });

      if (callType !== "Counter-Reading" && foundEntry.contractType?.contractTypeId?.toString() === process.env.TSS_CONTRACT_TYPE_ID)
        return res.status(400).json({ success: false, message: `Serial number "${sn}" has a TSS contract and can only be used for Counter-Reading calls` });

      if (callType === "Counter-Reading" && foundEntry.contractType?.contractTypeId?.toString() !== process.env.TSS_CONTRACT_TYPE_ID)
        return res.status(400).json({ success: false, message: `Serial number "${sn}" is not eligible for Counter-Reading calls` });

      const isExpired     = foundEntry.contractType?.validTo && new Date(foundEntry.contractType.validTo) < new Date();
      const notFreeService = !foundEntry.contractType?.freeService;
      const requiresCharge = isExpired || notFreeService;

      if (requiresCharge && (serviceCharge === undefined || serviceCharge === null))
        return res.status(400).json({ success: false, message: `serviceCharge is required for serial number "${sn}" (${isExpired ? "expired contract" : "non-free service"})` });
      if (serviceCharge !== undefined && serviceCharge !== null && (typeof serviceCharge !== "number" || serviceCharge < 0))
        return res.status(400).json({ success: false, message: `serviceCharge must be a non-negative number at index ${i}` });

      const ptIds = Array.isArray(problemTypeIds) ? problemTypeIds : [];
      for (const ptId of ptIds) {
        if (!ptMap.has(ptId))
          return res.status(404).json({ success: false, message: `Problem type not found: ${ptId}` });
      }

      const images = [];
      for (const file of (filesByIndex[i] || [])) {
        const filename = `servicecall_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`;
        images.push(await _uploadImage(file.buffer, filename));
      }

      machineEntries.push({
        machineId:        foundMachine.machineId,
        machineName:      foundMachine.machineName,
        modelNumber:      foundMachine.modelNumber,
        serialNumber:     sn,
        divisionId:       foundMachine.divisionId,
        division:         foundMachine.division,
        categoryId:       foundMachine.categoryId,
        category:         foundMachine.category,
        contractType:     foundEntry.contractType,
        issueDescription: issueDescription.trim(),
        problemTypeIds:   ptIds,
        problemTypes:     ptIds.map(id => ptMap.get(id)),
        images,
        serviceCharge:    requiresCharge ? serviceCharge : 0,
      });
    }

    if (machineEntries.length === 0)
      return res.status(404).json({ success: false, message: "No valid machines found" });

    const lastCall = await ServiceCall.findOne().sort({ createdAt: -1 }).select("callId");
    let callNumber = 1;
    if (lastCall?.callId) {
      const match = lastCall.callId.match(/^SC-(\d+)$/);
      if (match) callNumber = parseInt(match[1]) + 1;
    }

    const customerAddress = parsedCustomerLocation?.address || customer.userLocation?.address || customer.address || "";
    if (!customerAddress)
      return res.status(400).json({ success: false, message: "Customer address is not set" });

    const totalServiceCharges = machineEntries.reduce((sum, m) => sum + (m.serviceCharge || 0), 0);

    const serviceCallDoc = new ServiceCall({
      callId: `SC-${callNumber}`,
      callType,
      customerInfo: {
        customerId:      customer._id,
        customerUniqueId: customer.customerId || "",
        name:       customer.name,
        phone:      customer.phone,
        email:      customer.email,
        address:    customerAddress,
        zone:       customer.zone?.name || "",
        gstNumber:  customer.gstNumber || "",
        ...(parsedCustomerLocation && {
          location: {
            address:   parsedCustomerLocation.address,
            latitude:  parsedCustomerLocation.latitude,
            longitude: parsedCustomerLocation.longitude,
          }
        }),
      },
      machines: machineEntries,
      totalServiceCharges,
      createdBy: "Admin",
    });

    await serviceCallDoc.save();
    return res.status(201).json({ success: true, data: serviceCallDoc });
  } catch (err) {
    console.error("Error raising service call (admin):", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const DOCS_DIR = process.env.NODE_ENV === "production"
  ? "/app/cloud/Documents"
  : path.join(__dirname, "../../../cloud/Documents");

const getServiceCallInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const call = await ServiceCall.findById(id);
    if (!call)
      return res.status(404).json({ success: false, message: "Service call not found" });

    if (call.callType !== "Service-Call" || call.status !== "Completed")
      return res.status(400).json({ success: false, message: "Invoice only available for completed Service-Call type calls" });

    const Company = require("../companyManagement/admin.company.model");
    const companyId = call.companyInfo?.companyId;
    const company = companyId ? await Company.findById(companyId) : null;

    const Counter = require("../auth/counter.model");
    const counter = await Counter.findByIdAndUpdate(
      "serviceCallInvoice",
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const invoiceNumber = `SVC-INV-${counter.seq}`;

    const fmt = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Recalculate GST fresh on totalCharges (the real base)
    const basicTotal  = call.totalCharges ?? 0;
    const cgstPercent = call.cgst?.percent ?? 0;
    const sgstPercent = call.sgst?.percent ?? 0;
    const igstPercent = call.igst?.percent ?? 0;
    const cgstAmount  = parseFloat(((basicTotal * cgstPercent) / 100).toFixed(2));
    const sgstAmount  = parseFloat(((basicTotal * sgstPercent) / 100).toFixed(2));
    const igstAmount  = parseFloat(((basicTotal * igstPercent) / 100).toFixed(2));
    const grandTotal  = parseFloat((basicTotal + cgstAmount + sgstAmount + igstAmount).toFixed(2));

    // Persist updated invoiceGrandTotal
    await ServiceCall.findByIdAndUpdate(id, { invoiceGrandTotal: grandTotal });

    const invoiceDate = call.dates?.completed
      ? new Date(call.dates.completed).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    const invoiceLogoUrl  = process.env.INVOICE_LOGO_URL  || "";
    const invoiceLogoText = process.env.INVOICE_LOGO_TEXT || "";

    const templatePath = path.join(__dirname, "../../../invoicesExamples/sales-invoice.html");
    let html = await fs.readFile(templatePath, "utf-8");

    // Patch template: add Machine S/N column after Description
    html = html
      .replace(
        `<th>Description</th>`,
        `<th>Description</th>\n          <th style="width:120px;">Machine S/N</th>`
      )
      .replace(
        `<td>\n            <div class="item-name">{{machineName}}</div>\n            {{#if modelNumber}}<div class="item-model">Model: {{modelNumber}}</div>{{/if}}\n            {{#if serials}}<div class="item-serials">{{serialLabel}}: {{serials}}</div>{{/if}}\n          </td>`,
        `<td><div class="item-name">{{machineName}}</div>{{#if modelNumber}}<div class="item-model">Model: {{modelNumber}}</div>{{/if}}{{#if partCode}}<div class="item-serials">P/C: {{partCode}}</div>{{/if}}</td>\n          <td style="font-size:11px;">{{machineSN}}</td>`
      );

    // Substitutions
    html = html
      .replace(/{{invoiceNumber}}/g, invoiceNumber)
      .replace(/{{invoiceDate}}/g, invoiceDate)
      .replace(/{{companyName}}/g, company?.name       || call.companyInfo?.name    || "")
      .replace(/{{companyTagline}}/g, company?.tagline  || "")
      .replace(/{{companyAddress}}/g, company?.address  || call.companyInfo?.address || "")
      .replace(/{{companyPhone}}/g,   company?.phone    || call.companyInfo?.phone   || "")
      .replace(/{{companyEmail}}/g,   company?.email    || call.companyInfo?.email   || "")
      .replace(/{{companyGst}}/g,     company?.gstNumber || call.companyInfo?.gstNumber || "")
      .replace(/{{bankAccountNumber}}/g, company?.bankAccountNumber || "")
      .replace(/{{bankName}}/g,       company?.bankName   || "")
      .replace(/{{ifscCode}}/g,       company?.ifscCode   || "")
      .replace(/{{bankBranch}}/g,     company?.bankBranch || "")
      .replace(/{{qrCode}}/g,         company?.qrCode     || "")
      .replace(/{{invoiceLogoUrl}}/g,  invoiceLogoUrl)
      .replace(/{{invoiceLogoText}}/g, invoiceLogoText)
      .replace(/{{customerName}}/g,    call.customerInfo?.name    || "")
      .replace(/{{customerAddress}}/g, call.customerInfo?.address || "")
      .replace(/{{customerUniqueId}}/g, call.customerInfo?.customerUniqueId || "")
      .replace(/{{customerGst}}/g,     call.customerInfo?.gstNumber || "")
      .replace(/{{basicTotal}}/g,  fmt(basicTotal))
      .replace(/{{cgstPercent}}/g, cgstPercent)
      .replace(/{{cgstAmount}}/g,  fmt(cgstAmount))
      .replace(/{{sgstPercent}}/g, sgstPercent)
      .replace(/{{sgstAmount}}/g,  fmt(sgstAmount))
      .replace(/{{igstPercent}}/g, igstPercent)
      .replace(/{{igstAmount}}/g,  fmt(igstAmount))
      .replace(/{{grandTotal}}/g,  fmt(grandTotal));

    // Conditional blocks
    html = cgstPercent > 0 ? html.replace(/{{#if cgst}}([\.\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if cgst}}[\.\s\S]*?{{\/if}}/g, "");
    html = sgstPercent > 0 ? html.replace(/{{#if sgst}}([\.\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if sgst}}[\.\s\S]*?{{\/if}}/g, "");
    html = igstPercent > 0 ? html.replace(/{{#if igst}}([\.\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if igst}}[\.\s\S]*?{{\/if}}/g, "");
    html = company?.tagline  ? html.replace(/{{#if companyTagline}}([\.\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if companyTagline}}[\.\s\S]*?{{\/if}}/g, "");
    html = company?.qrCode   ? html.replace(/{{#if qrCode}}([\.\s\S]*?){{\/if}}/g, "$1")        : html.replace(/{{#if qrCode}}[\.\s\S]*?{{\/if}}/g, "");
    html = invoiceLogoUrl    ? html.replace(/{{#if invoiceLogoUrl}}([\.\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if invoiceLogoUrl}}[\.\s\S]*?{{\/if}}/g, "");
    html = invoiceLogoText   ? html.replace(/{{#if invoiceLogoText}}([\.\s\S]*?){{\/if}}/g, "$1"): html.replace(/{{#if invoiceLogoText}}[\.\s\S]*?{{\/if}}/g, "");

    // Build machine rows — service charges row first, then one row per used part
    const machineRowsMatch = html.match(/{{#each machines}}([\.\s\S]*?){{\/each}}/);
    if (machineRowsMatch) {
      const rowTemplate = machineRowsMatch[1];
      const rows = [];
      let srNo = 1;

      // Row 1: Service Charges
      const totalSC = call.totalServiceCharges ?? 0;
      if (totalSC > 0) {
        let row = rowTemplate
          .replace(/{{srNo}}/g,        srNo++)
          .replace(/{{machineName}}/g, "Service Charges")
          .replace(/{{hsnCode}}/g,     "-")
          .replace(/{{quantity}}/g,    "-")
          .replace(/{{rate}}/g,        fmt(totalSC))
          .replace(/{{amount}}/g,      fmt(totalSC))
          .replace(/{{machineSN}}/g,   "-");
        row = row.replace(/{{#if modelNumber}}[\s\S]*?{{\/if}}/g, "");
        row = row.replace(/{{#if partCode}}[\s\S]*?{{\/if}}/g, "");
        row = row.replace(/{{#if serials}}[\s\S]*?{{\/if}}/g, "");
        rows.push(row);
      }

      // Rows: one per used part across all machines
      for (const machine of call.machines) {
        for (const part of (machine.usedParts || [])) {
          const qty    = part.quantity ?? 1;
          const rate   = part.sellingPrice ?? part.discountedSellingPrice ?? 0;
          const amount = part.total ?? (qty * rate);
          let row = rowTemplate
            .replace(/{{srNo}}/g,        srNo++)
            .replace(/{{machineName}}/g, part.machineName || "")
            .replace(/{{hsnCode}}/g,     part.hsnCode || "")
            .replace(/{{quantity}}/g,    qty)
            .replace(/{{rate}}/g,        fmt(rate))
            .replace(/{{amount}}/g,      fmt(amount))
            .replace(/{{machineSN}}/g,   machine.serialNumber || "");
          // Model number
          row = part.modelNumber
            ? row.replace(/{{#if modelNumber}}([\s\S]*?){{\/if}}/g, "$1").replace(/{{modelNumber}}/g, part.modelNumber)
            : row.replace(/{{#if modelNumber}}[\s\S]*?{{\/if}}/g, "");
          // Part code (P/C)
          row = part.partCode
            ? row.replace(/{{#if partCode}}([\s\S]*?){{\/if}}/g, "$1").replace(/{{partCode}}/g, part.partCode)
            : row.replace(/{{#if partCode}}[\s\S]*?{{\/if}}/g, "");
          row = row.replace(/{{#if serials}}[\s\S]*?{{\/if}}/g, "");
          rows.push(row);
        }
      }

      html = html.replace(/{{#each machines}}[\.\s\S]*?{{\/each}}/, rows.join(""));
    }

    const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
      import("puppeteer"),
      import("@sparticuz/chromium"),
    ]);
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || await chromium.executablePath();
    await fs.mkdir(DOCS_DIR, { recursive: true });
    const filename = `service_invoice_${invoiceNumber}_${Date.now()}.pdf`;
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

    const invoiceUrl = `${process.env.BACKEND_URL}/app/cloud/Documents/${filename}`;
    await ServiceCall.findByIdAndUpdate(id, { invoiceUrl, invoiceNumber });

    return res.status(200).json({ success: true, invoiceUrl, invoiceNumber });
  } catch (error) {
    console.error("Error generating service call invoice:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getCalls, getCallDetail, assignEngineer, updateCall, getCustomerMachines, getCustomerMachineDetail, raiseServiceCall, getServiceCallInvoice };
