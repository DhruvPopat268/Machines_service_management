const path = require("path");
const fs   = require("fs/promises");
const sharp = require("sharp");
const ServiceCall = require("../../customer/calls/customer.serviceCall.model");
const TravelReimbursement = require("../reimbursement/engineer.reimbursement.model");
const AdminUser = require("../../admin/auth/admin.user.model");
const PurchasedMachine = require("../../admin/purchasedMachines/admin.purchasedMachine.model");
const Machine = require("../../admin/inventoryManagement/admin.machine.model");
const InventoryLog = require("../../admin/inventoryLogs/admin.inventoryLog.model");
const SoldMachine = require("../../admin/soldMachines/admin.soldMachine.model");
const mongoose = require("mongoose");
const axios = require("axios");
const { sendServiceCallInvoiceEmail } = require("../../../utils/emailService");

const TSS_CONTRACT_TYPE_ID = process.env.TSS_CONTRACT_TYPE_ID;

// ── Reusable: build counterReadingInfo for a list of calls ──────────────────
const buildCounterReadingInfo = async (calls) => {
  if (!TSS_CONTRACT_TYPE_ID) return calls.map(c => c.toObject ? c.toObject() : c);

  return Promise.all(calls.map(async (call) => {
    const callObj = call.toObject ? call.toObject() : call;
    if (callObj.callType !== "Counter-Reading") return callObj;

    // Build a map: serialNumber -> categories
    const snCategoriesMap = new Map();
    const snMinCopiesMap  = new Map();

    for (const machine of callObj.machines) {
      const sn = machine.serialNumber;
      if (!sn || machine.contractType?.contractTypeId?.toString() !== TSS_CONTRACT_TYPE_ID) continue;

      const soldRecord = await SoldMachine.findOne(
        { "machines.serialNumbers.serialNumber": sn },
        { "machines.serialNumbers.$": 1 }
      ).lean();

      const soldSnEntry = soldRecord?.machines
        ?.flatMap(m => m.serialNumbers)
        .find(s => s.serialNumber === sn);

      snMinCopiesMap.set(sn, soldSnEntry?.minCopies ?? 0);

      const costPerPageMap = new Map(
        (soldSnEntry?.pagesCategories ?? []).map(pc => [
          pc.pagesCategoryId.toString(),
          { pagesCategoryId: pc.pagesCategoryId, pagesCategory: pc.pagesCategory, costPerPage: pc.costPerPage, minCopies: pc.minCopies ?? 0 },
        ])
      );

      const lastCall = await ServiceCall.findOne(
        {
          "machines.serialNumber":                sn,
          "machines.counterReadings.serialNumber": sn,
          callType: "Counter-Reading",
          status:   "Completed",
          _id:      { $ne: call._id },
        },
        { "machines.counterReadings": 1 }
      ).sort({ "dates.completed": -1 }).lean();

      const lastSnReading = lastCall?.machines
        ?.flatMap(m => m.counterReadings ?? [])
        .find(cr => cr.serialNumber === sn);

      const categories = Array.from(costPerPageMap.values()).map(pc => {
        const lastCat = lastSnReading?.categories?.find(
          c => c.pagesCategoryId.toString() === pc.pagesCategoryId.toString()
        );
        return {
          pagesCategoryId: pc.pagesCategoryId,
          pagesCategory:   pc.pagesCategory,
          lastReading:     lastCat?.currentReading ?? 0,
          costPerPage:     pc.costPerPage,
        };
      });

      snCategoriesMap.set(sn, categories);
    }

    // Merge categories into each matching machine
    const machines = callObj.machines.map(m => {
      if (!snCategoriesMap.has(m.serialNumber)) return m;
      return { ...m, counterReadingCategories: snCategoriesMap.get(m.serialNumber), counterReadingMinCopies: snMinCopiesMap.get(m.serialNumber) ?? 0 };
    });

    return { ...callObj, machines };
  }));
};

const IMAGES_DIR = process.env.NODE_ENV === "production"
  ? "/app/cloud/images"
  : path.join(__dirname, "../../../cloud/images");

const createdDirs = new Set();

const uploadToServer = async (fileBuffer, filename) => {
  if (!createdDirs.has(IMAGES_DIR)) {
    await fs.mkdir(IMAGES_DIR, { recursive: true });
    createdDirs.add(IMAGES_DIR);
  }
  await sharp(fileBuffer)
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 70, effort: 1, smartSubsample: true })
    .toFile(path.join(IMAGES_DIR, filename));
  return `${process.env.BACKEND_URL}/app/cloud/images/${filename}`;
};

const processImages = async (files) => {
  const urls = [];
  for (const file of files) {
    const filename = `servicecall_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`;
    const url = await uploadToServer(file.buffer, filename);
    urls.push(url);
  }
  return urls;
};

const resolveStockStatus = (currentStock, lowStockThreshold) => {
  if (currentStock === 0) return "Out of Stock";
  if (lowStockThreshold === -1) return "In Stock";
  return lowStockThreshold < currentStock ? "In Stock" : "Low Stock";
};

const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

const reverseGeocode = async (lat, lng) => {
  const { data } = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
    params: { latlng: `${lat},${lng}`, key: MAPS_KEY },
  });
  return data.results?.[0]?.formatted_address || "";
};

const checkOnline = async (engineerId) => {
  const engineer = await AdminUser.findById(engineerId).select("isOnline");
  return engineer?.isOnline === true;
};

const getOnHoldCalls = async (req, res) => {
  try {
    const engineerId = req.engineer.id;

    const calls = await ServiceCall.find({
      "engineerInfo._id": engineerId,
      status: "On Hold",
      callType: { $ne: "Counter-Reading" },
    })
      .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt callType onHoldReason")
      .sort({ updatedAt: -1 });

    return res.status(200).json({ success: true, data: calls });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getHistoryCalls = async (req, res) => {
  try {
    const engineerId = req.engineer.id;

    const calls = await ServiceCall.find({
      "engineerInfo._id": engineerId,
      status: { $in: ["Completed", "Cancelled"] },
      callType: { $ne: "Counter-Reading" },
    })
      .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt callType totalServiceCharges totalPartsCharges totalCharges")
      .sort({ updatedAt: -1 });

    return res.status(200).json({ success: true, data: calls });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAssignedCalls = async (req, res) => {
  try {
    const engineerId = req.engineer.id;

    const calls = await ServiceCall.find({
      "engineerInfo._id": engineerId,
      status: "Assigned",
      callType: { $ne: "Counter-Reading" },
    })
      .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt callType")
      .sort({ updatedAt: -1 });

    return res.status(200).json({ success: true, data: calls });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getReimbursementPreview = async (req, res) => {
  try {
    const engineerId = req.engineer.id;
    const { callId, purpose = "Service Call", currentLocation } = req.body;

    if (!mongoose.isValidObjectId(callId))
      return res.status(400).json({ success: false, message: "Invalid callId" });

    if (!["Service Call", "Go To Office", "Go To Home"].includes(purpose))
      return res.status(400).json({ success: false, message: "Invalid purpose. Must be Service Call, Go To Office or Go To Home" });

    const call = await ServiceCall.findById(callId);
    if (!call)
      return res.status(404).json({ success: false, message: "Call not found" });

    if (call.engineerInfo?._id?.toString() !== engineerId)
      return res.status(403).json({ success: false, message: "You are not assigned to this call" });

    const customerLat = call.customerInfo?.location?.latitude;
    const customerLng = call.customerInfo?.location?.longitude;
    if (!customerLat || !customerLng)
      return res.status(400).json({ success: false, message: "Customer location not available" });

    const customerAddress = call.customerInfo?.location?.address || call.customerInfo?.address;
    const customerPoint   = { latitude: customerLat, longitude: customerLng, address: customerAddress };

    // ── Service Call: uses currentLocation (pre-travel preview) ──
    if (purpose === "Service Call") {
      if (call.status !== "Assigned" && call.status !== "On Hold")
        return res.status(400).json({ success: false, message: "Call is not in Assigned or On Hold status" });

      const { latitude: currentLatitude, longitude: currentLongitude } = currentLocation || {};
      if (!currentLatitude || !currentLongitude)
        return res.status(400).json({ success: false, message: "currentLocation.latitude and currentLocation.longitude are required" });

      const lat = parseFloat(currentLatitude);
      const lng = parseFloat(currentLongitude);

      const [engineerAddress, distanceMatrix] = await Promise.all([
        reverseGeocode(lat, lng),
        axios.get("https://maps.googleapis.com/maps/api/distancematrix/json", {
          params: { origins: `${lat},${lng}`, destinations: `${customerLat},${customerLng}`, key: MAPS_KEY },
        }),
      ]);

      const element = distanceMatrix.data.rows?.[0]?.elements?.[0];
      if (!element || element.status !== "OK")
        return res.status(400).json({ success: false, message: "Could not calculate distance" });

      const distanceKm  = Math.round((element.distance.value / 1000) * 100) / 100;
      const durationMin = Math.round(element.duration.value / 60);

      return res.status(200).json({
        success: true,
        data: {
          purpose,
          travelFrom:       { latitude: lat, longitude: lng, address: engineerAddress },
          travelTo:         customerPoint,
          distanceKm,
          estimatedTimeMin: durationMin,
        },
      });
    }

    // ── Go To Office / Go To Home: uses last saved location (post-call preview) ──
    if (call.status !== "Completed" && call.status !== "On Hold")
      return res.status(400).json({ success: false, message: "Call must be Completed or On Hold to preview this purpose" });

    const engineer = await AdminUser.findById(engineerId).select("engineerLocation");
    if (!engineer)
      return res.status(404).json({ success: false, message: "Engineer not found" });

    if (purpose === "Go To Office") {
      const adminUser = await AdminUser.findOne({ role: "Admin" }).select("officeLocation");
      if (!adminUser?.officeLocation?.latitude || !adminUser?.officeLocation?.longitude)
        return res.status(400).json({ success: false, message: "Office location not set" });

      const officePoint = { latitude: adminUser.officeLocation.latitude, longitude: adminUser.officeLocation.longitude, address: adminUser.officeLocation.address || "" };
      const distanceKm  = await getRoadDistanceKm(customerLat, customerLng, adminUser.officeLocation.latitude, adminUser.officeLocation.longitude);

      return res.status(200).json({
        success: true,
        data: {
          purpose,
          travelFrom:  customerPoint,
          travelTo:    officePoint,
          distanceKm,
        },
      });
    }

    if (purpose === "Go To Home") {
      if (!engineer.engineerLocation?.latitude || !engineer.engineerLocation?.longitude)
        return res.status(400).json({ success: false, message: "Home location not set on your profile" });

      const homePoint  = { latitude: engineer.engineerLocation.latitude, longitude: engineer.engineerLocation.longitude, address: engineer.engineerLocation.address || "" };
      const distanceKm = await getRoadDistanceKm(customerLat, customerLng, engineer.engineerLocation.latitude, engineer.engineerLocation.longitude);

      return res.status(200).json({
        success: true,
        data: {
          purpose,
          travelFrom:  customerPoint,
          travelTo:    homePoint,
          distanceKm,
        },
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const startTravel = async (req, res) => {
  try {
    const engineerId = req.engineer.id;
    const { callId, currentLocation } = req.body;
    const { latitude, longitude } = currentLocation || {};

    if (!mongoose.isValidObjectId(callId))
      return res.status(400).json({ success: false, message: "Invalid callId" });

    if (!await checkOnline(engineerId))
      return res.status(403).json({ success: false, message: "You must be online to perform this action" });

    if (!latitude || !longitude)
      return res.status(400).json({ success: false, message: "currentLocation.latitude and currentLocation.longitude are required" });

    const activeCall = await ServiceCall.findOne({
      "engineerInfo._id": engineerId,
      _id: { $ne: callId },
      status: { $in: ["Travel Started", "Reached Location", "In Progress"] },
    });
    if (activeCall)
      return res.status(400).json({ success: false, message: `You already have an active call (${activeCall.callId}) in progress. Complete it before starting travel for another.` });

    const call = await ServiceCall.findById(callId);
    if (!call)
      return res.status(404).json({ success: false, message: "Call not found" });

    if (call.status !== "Assigned" && call.status !== "On Hold")
      return res.status(400).json({ success: false, message: "Call is not in Assigned or On Hold status" });

    if (call.engineerInfo?._id?.toString() !== engineerId)
      return res.status(403).json({ success: false, message: "You are not assigned to this call" });

    const [engineerAddress] = await Promise.all([
      reverseGeocode(parseFloat(latitude), parseFloat(longitude)),
    ]);

    await call.updateOne({
      status: "Travel Started",
      "dates.travelStarted": new Date(),
      $push: {
        "engineerInfo.locations": {
          address:   engineerAddress,
          latitude:  parseFloat(latitude),
          longitude: parseFloat(longitude),
        },
      },
    });

    return res.status(200).json({ success: true, message: "Travel started" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const reachedLocation = async (req, res) => {
  try {
    const engineerId = req.engineer.id;
    const { callId } = req.body;

    if (!mongoose.isValidObjectId(callId))
      return res.status(400).json({ success: false, message: "Invalid callId" });

    if (!await checkOnline(engineerId))
      return res.status(403).json({ success: false, message: "You must be online to perform this action" });

    const call = await ServiceCall.findById(callId);
    if (!call)
      return res.status(404).json({ success: false, message: "Call not found" });

    if (call.status !== "Travel Started")
      return res.status(400).json({ success: false, message: "Call is not in Travel Started status" });

    if (call.engineerInfo?._id?.toString() !== engineerId)
      return res.status(403).json({ success: false, message: "You are not assigned to this call" });

    await call.updateOne({ status: "Reached Location", "dates.reachedLocation": new Date() });

    return res.status(200).json({ success: true, message: "Reached location updated" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const startWork = async (req, res) => {
  try {
    const engineerId = req.engineer.id;
    const { callId } = req.body;
    const files = req.files || [];

    if (!mongoose.isValidObjectId(callId))
      return res.status(400).json({ success: false, message: "Invalid callId" });

    if (!await checkOnline(engineerId))
      return res.status(403).json({ success: false, message: "You must be online to perform this action" });

    const call = await ServiceCall.findById(callId);
    if (!call)
      return res.status(404).json({ success: false, message: "Call not found" });

    if (call.status !== "Reached Location")
      return res.status(400).json({ success: false, message: "Call is not in Reached Location status" });

    if (call.engineerInfo?._id?.toString() !== engineerId)
      return res.status(403).json({ success: false, message: "You are not assigned to this call" });

    const isCounterReading = call.callType === "Counter-Reading";

    if (!isCounterReading) {
      if (files.length === 0)
        return res.status(400).json({ success: false, message: "beforeWorkImages are required" });
      if (files.length > 5)
        return res.status(400).json({ success: false, message: "beforeWorkImages must not exceed 5 images" });
    }

    let beforeWorkImages;
    if (!isCounterReading && files.length > 0) {
      try {
        beforeWorkImages = await processImages(files);
      } catch (imgErr) {
        return res.status(400).json({ success: false, message: imgErr.message });
      }
    }

    await call.updateOne({
      status: "In Progress",
      "dates.inProgress": new Date(),
      ...(beforeWorkImages && { beforeWorkImages }),
    });

    return res.status(200).json({ success: true, message: "Work started" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const putOnHold = async (req, res) => {
  try {
    const engineerId = req.engineer.id;
    const { callId, onHoldReason } = req.body;

    if (!mongoose.isValidObjectId(callId))
      return res.status(400).json({ success: false, message: "Invalid callId" });

    if (!await checkOnline(engineerId))
      return res.status(403).json({ success: false, message: "You must be online to perform this action" });

    if (!onHoldReason || !onHoldReason.trim())
      return res.status(400).json({ success: false, message: "onHoldReason is required" });

    const call = await ServiceCall.findById(callId);
    if (!call)
      return res.status(404).json({ success: false, message: "Call not found" });

    if (call.status !== "In Progress")
      return res.status(400).json({ success: false, message: "Call is not in In Progress status" });

    if (call.engineerInfo?._id?.toString() !== engineerId)
      return res.status(403).json({ success: false, message: "You are not assigned to this call" });

    await call.updateOne({
      status: "On Hold",
      "dates.onHold": new Date(),
      onHoldReason: onHoldReason.trim(),
    });

    return res.status(200).json({ success: true, message: "Call put on hold" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getChargesSummary = async (req, res) => {
  try {
    const { callId, usedParts } = req.body;

    if (!mongoose.isValidObjectId(callId))
      return res.status(400).json({ success: false, message: "Invalid callId" });

    const hasUsedParts = Array.isArray(usedParts) && usedParts.length > 0;

    if (hasUsedParts) {
      for (const p of usedParts) {
        if (!p || typeof p.partCode !== "string")
          return res.status(400).json({ success: false, message: "Each usedPart must have a partCode string" });
        if (!p.serialNumber || typeof p.serialNumber !== "string")
          return res.status(400).json({ success: false, message: "Each usedPart must have a serialNumber" });
      }
    }

    const call = await ServiceCall.findById(callId).select("totalServiceCharges status engineerInfo._id machines");
    if (!call)
      return res.status(404).json({ success: false, message: "Call not found" });

    if (call.engineerInfo?._id?.toString() !== req.engineer.id)
      return res.status(403).json({ success: false, message: "You are not assigned to this call" });

    const serviceCharges = call.totalServiceCharges ?? 0;

    if (!hasUsedParts)
      return res.status(200).json({ success: true, data: { serviceCharges, partsCharges: 0, totalCharges: serviceCharges } });

    // Build contractType map: serialNumber -> contractType
    const contractMap = new Map();
    for (const m of call.machines) contractMap.set(m.serialNumber, m.contractType);

    // Validate serialNumbers
    for (const p of usedParts) {
      if (!contractMap.has(p.serialNumber))
        return res.status(400).json({ success: false, message: `serialNumber ${p.serialNumber} does not belong to this call` });
    }

    const partCodesList = usedParts.map(p => p.partCode.trim());

    const purchaseRecords = await PurchasedMachine.find(
      { "machines.partCodes.partCode": { $in: partCodesList } },
      { "machines.partCodes": 1, "machines.sellingPrice": 1, "machines.discountedSellingPrice": 1 }
    );

    const priceMap = new Map();
    for (const record of purchaseRecords) {
      for (const machine of record.machines) {
        const unitPrice = machine.discountedSellingPrice ?? machine.sellingPrice ?? 0;
        for (const entry of (machine.partCodes || [])) {
          if (partCodesList.includes(entry.partCode.trim()))
            priceMap.set(entry.partCode.trim(), unitPrice);
        }
      }
    }

    const notFound = partCodesList.filter(c => !priceMap.has(c));
    if (notFound.length > 0)
      return res.status(404).json({ success: false, message: `Part code(s) not found: ${notFound.join(", ")}` });

    const alreadySold = [];
    for (const record of purchaseRecords) {
      for (const machine of record.machines) {
        for (const entry of (machine.partCodes || [])) {
          if (partCodesList.includes(entry.partCode.trim()) && entry.status === "sold")
            alreadySold.push(entry.partCode.trim());
        }
      }
    }
    if (alreadySold.length > 0)
      return res.status(400).json({ success: false, message: `Part code(s) already sold: ${alreadySold.join(", ")}` });

    const now = new Date();
    let partsCharges = 0;
    for (const p of usedParts) {
      const contract  = contractMap.get(p.serialNumber);
      const isExpired = !contract?.validTo || now > new Date(contract.validTo);
      const unitPrice = priceMap.get(p.partCode.trim()) ?? 0;
      const charge    = (!isExpired && contract?.freeParts) ? 0 : unitPrice;
      partsCharges    = Math.round((partsCharges + charge) * 100) / 100;
    }

    const totalCharges = Math.round((serviceCharges + partsCharges) * 100) / 100;

    return res.status(200).json({ success: true, data: { serviceCharges, partsCharges, totalCharges } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getPartsMachines = async (req, res) => {
  try {
    const partsCategoryId = process.env.PARTS_CATEGORY_ID;
    const { search } = req.query;

    const escaped = search?.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const purchaseRecords = await PurchasedMachine.find({
      "machines.categoryId": new mongoose.Types.ObjectId(partsCategoryId),
      ...(search?.trim() && {
        $or: [
          { "machines.machineName": { $regex: escaped, $options: "i" } },
          { "machines.partCodes.partCode": { $regex: escaped, $options: "i" } },
        ],
      }),
    });

    const machineIds = [...new Set(
      purchaseRecords.flatMap(record =>
        record.machines
          .filter(m => m.categoryId?.toString() === partsCategoryId)
          .map(m => m.machineId)
          .filter(Boolean)
      )
    )];

    const machineImagesMap = new Map();
    if (machineIds.length > 0) {
      const machines = await Machine.find({ _id: { $in: machineIds }, status: "Active" }).select("_id images");
      machines.forEach(m => machineImagesMap.set(m._id.toString(), m.images));
    }

    // One entry per available part code
    const parts = [];
    for (const record of purchaseRecords) {
      for (const machine of record.machines) {
        if (machine.categoryId?.toString() !== partsCategoryId) continue;
        if (!machine.machineId || !machineImagesMap.has(machine.machineId.toString())) continue;

        for (const entry of (machine.partCodes || [])) {
          if (entry.status !== "available") continue;
          if (search?.trim()) {
            const s = search.trim().toLowerCase();
            const matchesPartCode   = entry.partCode.toLowerCase().includes(s);
            const matchesMachineName = machine.machineName.toLowerCase().includes(s);
            if (!matchesPartCode && !matchesMachineName) continue;
          }

          parts.push({
            machineId:              machine.machineId,
            machineName:            machine.machineName,
            modelNumber:            machine.modelNumber || "",
            categoryId:             machine.categoryId,
            category:               machine.category,
            divisionId:             machine.divisionId,
            division:               machine.division,
            sellingPrice:           machine.sellingPrice ?? 0,
            discountedSellingPrice: machine.discountedSellingPrice ?? null,
            images:                 machineImagesMap.get(machine.machineId.toString()) || [],
            partCode:               entry.partCode,
          });
        }
      }
    }

    return res.status(200).json({ success: true, data: parts });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getRoadDistanceKm = async (originLat, originLng, destLat, destLng) => {
  const { data } = await axios.get("https://maps.googleapis.com/maps/api/distancematrix/json", {
    params: {
      origins:      `${originLat},${originLng}`,
      destinations: `${destLat},${destLng}`,
      key: MAPS_KEY,
    },
  });
  const element = data.rows?.[0]?.elements?.[0];
  const meters = element?.distance?.value;
  if (meters == null) throw new Error("Could not calculate distance");
  return Math.round((meters / 1000) * 100) / 100;
};

const createReimbursement = async (req, res) => {
  try {
    const engineerId = req.engineer.id;
    const { callId, purpose } = req.body;

    if (!mongoose.isValidObjectId(callId))
      return res.status(400).json({ success: false, message: "Invalid callId" });

    if (!["Service Call", "Go To Office", "Go To Home"].includes(purpose))
      return res.status(400).json({ success: false, message: "Invalid purpose. Must be Service Call, Go To Office or Go To Home" });

    const call = await ServiceCall.findById(callId);
    if (!call)
      return res.status(404).json({ success: false, message: "Call not found" });

    if (call.engineerInfo?._id?.toString() !== engineerId)
      return res.status(403).json({ success: false, message: "You are not assigned to this call" });

    if (![ "Completed", "On Hold"].includes(call.status))
      return res.status(400).json({ success: false, message: "Call must be Completed or On Hold to create reimbursement" });

    const locations = call.engineerInfo?.locations || [];
    if (locations.length === 0)
      return res.status(400).json({ success: false, message: "No travel locations found for this call" });

    const lastLocation  = locations[locations.length - 1];
    const customerLat   = call.customerInfo?.location?.latitude;
    const customerLng   = call.customerInfo?.location?.longitude;

    if (!customerLat || !customerLng)
      return res.status(400).json({ success: false, message: "Customer location not available on this call" });

    const engineer = await AdminUser.findById(engineerId).select("engineerLocation");
    if (!engineer)
      return res.status(404).json({ success: false, message: "Engineer not found" });

    // ── Validate destination exists for purpose ──
    if (purpose === "Go To Office") {
      const adminUser = await AdminUser.findOne({ role: "Admin" }).select("officeLocation");
      if (!adminUser?.officeLocation?.latitude || !adminUser?.officeLocation?.longitude)
        return res.status(400).json({ success: false, message: "Office location not set" });
    }
    if (purpose === "Go To Home") {
      if (!engineer.engineerLocation?.latitude || !engineer.engineerLocation?.longitude)
        return res.status(400).json({ success: false, message: "Home location not set on your profile" });
    }

    // ── Calculate distances ──
    const customerAddress = call.customerInfo?.location?.address || call.customerInfo?.address;
    const customerPoint   = { address: customerAddress, latitude: customerLat, longitude: customerLng };
    const fromPoint       = { address: lastLocation.address || "", latitude: lastLocation.latitude, longitude: lastLocation.longitude };

    const engineerInfo = {
      _id:        call.engineerInfo._id,
      identityId: call.engineerInfo.identityId,
      name:       call.engineerInfo.name,
      phone:      call.engineerInfo.phone,
    };
    const customerInfo = {
      name:    call.customerInfo.name,
      phone:   call.customerInfo.phone,
      address: call.customerInfo.address,
    };

    if (purpose === "Service Call") {
      const km = await getRoadDistanceKm(lastLocation.latitude, lastLocation.longitude, customerLat, customerLng);
      const reimbursement = await TravelReimbursement.create({
        callId: call._id, engineerInfo, customerInfo,
        travelDate: new Date(), purpose,
        travelFrom: fromPoint, travelTo: customerPoint,
        travelledKm: km, status: "Pending",
      });
      return res.status(201).json({ success: true, data: reimbursement });
    }

    if (purpose === "Go To Office") {
      const adminUser = await AdminUser.findOne({ role: "Admin" }).select("officeLocation");
      const officePoint = { address: adminUser.officeLocation.address || "", latitude: adminUser.officeLocation.latitude, longitude: adminUser.officeLocation.longitude };
      const [leg1Km, leg2Km] = await Promise.all([
        getRoadDistanceKm(lastLocation.latitude, lastLocation.longitude, customerLat, customerLng),
        getRoadDistanceKm(customerLat, customerLng, adminUser.officeLocation.latitude, adminUser.officeLocation.longitude),
      ]);
      const leg1 = await TravelReimbursement.create({ callId: call._id, engineerInfo, customerInfo, travelDate: new Date(), purpose: "Service Call", travelFrom: fromPoint,      travelTo: customerPoint, travelledKm: leg1Km, status: "Pending" });
      const leg2 = await TravelReimbursement.create({ callId: call._id, engineerInfo, customerInfo, travelDate: new Date(), purpose: "Go To Office",  travelFrom: customerPoint, travelTo: officePoint,   travelledKm: leg2Km, status: "Pending" });
      return res.status(201).json({ success: true, data: [leg1, leg2] });
    }

    if (purpose === "Go To Home") {
      const homePoint = { address: engineer.engineerLocation.address || "", latitude: engineer.engineerLocation.latitude, longitude: engineer.engineerLocation.longitude };
      const [leg1Km, leg2Km] = await Promise.all([
        getRoadDistanceKm(lastLocation.latitude, lastLocation.longitude, customerLat, customerLng),
        getRoadDistanceKm(customerLat, customerLng, engineer.engineerLocation.latitude, engineer.engineerLocation.longitude),
      ]);
      const leg1 = await TravelReimbursement.create({ callId: call._id, engineerInfo, customerInfo, travelDate: new Date(), purpose: "Service Call", travelFrom: fromPoint,      travelTo: customerPoint, travelledKm: leg1Km, status: "Pending" });
      const leg2 = await TravelReimbursement.create({ callId: call._id, engineerInfo, customerInfo, travelDate: new Date(), purpose: "Go To Home",   travelFrom: customerPoint, travelTo: homePoint,      travelledKm: leg2Km, status: "Pending" });
      return res.status(201).json({ success: true, data: [leg1, leg2] });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const completeCall = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const engineerId = req.engineer.id;
    const { callId, usedParts, sendToEmail, sendToWhatsapp, counterReadings, serviceCallReadings } = req.body;

    const abort = async (status, message) => {
      await session.abortTransaction();
      session.endSession();
      return res.status(status).json({ success: false, message });
    };

    if (!mongoose.isValidObjectId(callId))
      return abort(400, "Invalid callId");

    if (!await checkOnline(engineerId))
      return abort(403, "You must be online to perform this action");

    let parsedUsedParts;
    try {
      parsedUsedParts = typeof usedParts === "string" ? JSON.parse(usedParts) : usedParts;
    } catch (_) {
      return abort(400, "Invalid usedParts format");
    }

    let parsedCounterReadings;
    try {
      parsedCounterReadings = typeof counterReadings === "string" ? JSON.parse(counterReadings) : counterReadings;
    } catch (_) {
      return abort(400, "Invalid counterReadings format");
    }

    let parsedServiceCallReadings;
    try {
      parsedServiceCallReadings = typeof serviceCallReadings === "string" ? JSON.parse(serviceCallReadings) : serviceCallReadings;
    } catch (_) {
      return abort(400, "Invalid serviceCallReadings format");
    }

    const files       = req.files || {};
    const afterFiles  = files.afterWorkImages || [];
    const sigFiles    = files.customerSignature || [];

    const call = await ServiceCall.findById(callId).session(session);
    if (!call)
      return abort(404, "Call not found");

    if (call.status !== "In Progress")
      return abort(400, "Call is not in In Progress status");

    if (call.engineerInfo?._id?.toString() !== engineerId)
      return abort(403, "You are not assigned to this call");

    const isCounterReading = call.callType === "Counter-Reading";

    if (!isCounterReading) {
      if (afterFiles.length === 0)
        return abort(400, "afterWorkImages are required");
      if (afterFiles.length > 5)
        return abort(400, "afterWorkImages must not exceed 5 images");
      if (sigFiles.length === 0)
        return abort(400, "customerSignature is required");
      if (sigFiles.length > 1)
        return abort(400, "customerSignature must be a single image");
    }

    // usedParts only apply to Service-Call type; ignore for other call types
    const hasUsedParts = Array.isArray(parsedUsedParts) && parsedUsedParts.length > 0 && call.callType === "Service-Call";

    if (hasUsedParts) {
      for (const p of parsedUsedParts) {
        if (!p.partCode || typeof p.partCode !== "string")
          return abort(400, "Each usedPart must have a partCode");
        if (!p.serialNumber || typeof p.serialNumber !== "string")
          return abort(400, "Each usedPart must have a serialNumber (the call machine it was used on)");
      }
    }

    // ── Upload images ──
    let afterWorkImages, customerSignature;
    if (!isCounterReading) {
      try {
        afterWorkImages   = await processImages(afterFiles);
        customerSignature = (await processImages(sigFiles))[0];
      } catch (imgErr) {
        return abort(400, imgErr.message);
      }
    }

    // ── Resolve parts pricing and build inventory structures ──
    let partsCharges      = 0;
    const logMachineMap   = new Map(); // machineId -> { meta, variants: [] }
    const variantPartsMap = new Map(); // call variantId -> [usedPart docs]

    if (hasUsedParts) {
      // Validate all serialNumbers exist in this call
      const callSerialNumbers = new Set(call.machines.map(m => m.serialNumber));
      for (const p of parsedUsedParts) {
        if (!p.serialNumber || typeof p.serialNumber !== "string")
          return abort(400, `Each usedPart must have a serialNumber (the call machine it was used on)`);
        if (!callSerialNumbers.has(p.serialNumber))
          return abort(400, `serialNumber ${p.serialNumber} does not belong to this call`);
      }

      const partCodesList = parsedUsedParts.map(p => p.partCode.trim());

      const purchaseRecords = await PurchasedMachine.find(
        { "machines.partCodes.partCode": { $in: partCodesList } },
        { "machines.machineId": 1, "machines.machineName": 1,
          "machines.categoryId": 1, "machines.category": 1, "machines.divisionId": 1, "machines.division": 1,
          "machines.modelNumber": 1,
          "machines.partCodes": 1, "machines.sellingPrice": 1, "machines.discountedSellingPrice": 1 }
      ).session(session);

      const partInfoMap = new Map();
      for (const record of purchaseRecords) {
        for (const machine of record.machines) {
          const unitPrice = machine.discountedSellingPrice ?? machine.sellingPrice ?? 0;
          for (const entry of (machine.partCodes || [])) {
            if (partCodesList.includes(entry.partCode.trim())) {
              if (entry.status === "sold")
                return abort(400, `Part code "${entry.partCode}" is already sold`);
              partInfoMap.set(entry.partCode.trim(), {
                unitPrice,
                machineId:              machine.machineId,
                machineName:            machine.machineName,
                modelNumber:            machine.modelNumber || "",
                categoryId:             machine.categoryId,
                category:               machine.category || "",
                divisionId:             machine.divisionId,
                division:               machine.division || "",
                sellingPrice:           machine.sellingPrice ?? 0,
                discountedSellingPrice: machine.discountedSellingPrice ?? 0,
              });
            }
          }
        }
      }

      const notFound = partCodesList.filter(c => !partInfoMap.has(c));
      if (notFound.length > 0)
        return abort(404, `Part code(s) not found: ${notFound.join(", ")}`);

      // Fetch hsnCode from Machine docs for all unique machineIds
      const uniqueMachineIds = [...new Set([...partInfoMap.values()].map(i => i.machineId?.toString()).filter(Boolean))];
      const machineDocs = uniqueMachineIds.length > 0
        ? await Machine.find({ _id: { $in: uniqueMachineIds } }).select("_id hsnCode").session(session)
        : [];
      const hsnMap = new Map(machineDocs.map(m => [m._id.toString(), m.hsnCode || ""]));
      for (const [code, info] of partInfoMap)
        partInfoMap.set(code, { ...info, hsnCode: hsnMap.get(info.machineId?.toString()) || "" });

      // Build contractType map: serialNumber -> contractType
      const contractMap = new Map();
      for (const m of call.machines) contractMap.set(m.serialNumber, m.contractType);

      const now = new Date();

      // Each part code = 1 unit, deduct stock and build log
      for (const p of parsedUsedParts) {
        const info      = partInfoMap.get(p.partCode.trim());
        const contract  = contractMap.get(p.serialNumber);
        const isExpired = !contract?.validTo || now > new Date(contract.validTo);
        const lineTotal = (!isExpired && contract?.freeParts) ? 0 : info.unitPrice;
        partsCharges    = Math.round((partsCharges + lineTotal) * 100) / 100;

        const callMachineKey = p.serialNumber;
        if (!variantPartsMap.has(callMachineKey)) variantPartsMap.set(callMachineKey, []);
        variantPartsMap.get(callMachineKey).push({
          partCode:               p.partCode.trim(),
          machineId:              info.machineId,
          machineName:            info.machineName,
          modelNumber:            info.modelNumber || "",
          hsnCode:                info.hsnCode || "",
          categoryId:             info.categoryId,
          category:               info.category,
          sellingPrice:           info.sellingPrice,
          discountedSellingPrice: info.discountedSellingPrice,
          total:                  lineTotal,
        });

        // Deduct 1 unit of stock
        const updated = await Machine.findOneAndUpdate(
          { _id: info.machineId, currentStock: { $gte: 1 } },
          { $inc: { currentStock: -1 } },
          { new: true, session }
        );
        if (!updated)
          return abort(400, `Insufficient stock for part: ${info.machineName}`);

        const newStatus = resolveStockStatus(updated.currentStock, updated.lowStockThreshold);
        await Machine.updateOne({ _id: info.machineId }, { $set: { stockStatus: newStatus } }, { session });

        // Mark part code as sold in purchase model
        await PurchasedMachine.updateOne(
          { "machines.partCodes.partCode": p.partCode.trim() },
          { $set: { "machines.$[outer].partCodes.$[inner].status": "sold" } },
          { arrayFilters: [{ "outer.partCodes.partCode": p.partCode.trim() }, { "inner.partCode": p.partCode.trim() }], session }
        );

        const machineKey = info.machineId.toString();
        if (!logMachineMap.has(machineKey)) {
          logMachineMap.set(machineKey, {
            machineId:   info.machineId,
            machineName: info.machineName,
            categoryId:  info.categoryId,
            category:    info.category,
            divisionId:  info.divisionId,
            division:    info.division,
            quantity:    1,
            partCodes:   [p.partCode.trim()],
          });
        } else {
          logMachineMap.get(machineKey).partCodes.push(p.partCode.trim());
          logMachineMap.get(machineKey).quantity += 1;
        }
      }

      // Create inventory log
      await InventoryLog.create(
        [{
          action:       "sold",
          customerInfo: {
            customerId: call.customerInfo.customerId,
            name:       call.customerInfo.name,
            phone:      call.customerInfo.phone,
            email:      call.customerInfo.email,
            address:    call.customerInfo.address,
            zone:       call.customerInfo.zone || "",
            gstNumber:  call.customerInfo.gstNumber || "",
          },
          machines: [...logMachineMap.values()].map(e => ({
            machineId:     e.machineId,
            machineName:   e.machineName,
            categoryId:    e.categoryId,
            category:      e.category,
            divisionId:    e.divisionId,
            division:      e.division,
            quantity:      e.quantity,
            partCodes:     e.partCodes,
            serialNumbers: [],
          })),
        }],
        { session }
      );
    }

    // ── Build counter readings per machine ──
    const counterReadingsMap = new Map(); // serialNumber -> counterReading entry
    const hasCounterReadings = Array.isArray(parsedCounterReadings) && parsedCounterReadings.length > 0;

    if (hasCounterReadings && call.callType !== "Counter-Reading")
      return abort(400, "counterReadings can only be submitted for Counter-Reading call type");

    if (call.callType === "Counter-Reading" && !hasCounterReadings)
      return abort(400, "counterReadings is required for Counter-Reading call type");

    if (hasCounterReadings && !TSS_CONTRACT_TYPE_ID)
      return abort(500, "TSS_CONTRACT_TYPE_ID is not configured");

    if (hasCounterReadings) {
      const tssSerialSet = new Set(
        call.machines
          .filter(m => m.contractType?.contractTypeId?.toString() === TSS_CONTRACT_TYPE_ID)
          .map(m => m.serialNumber)
          .filter(Boolean)
      );

      // Ensure every TSS serial in the call is present in the submitted counterReadings
      const submittedSerialSet = new Set(parsedCounterReadings.map(cr => cr.serialNumber).filter(Boolean));
      for (const sn of tssSerialSet) {
        if (!submittedSerialSet.has(sn))
          return abort(400, `counterReadings missing for serial number "${sn}"`);
      }

      for (const cr of parsedCounterReadings) {
        if (!cr.serialNumber || !Array.isArray(cr.categories) || cr.categories.length === 0)
          return abort(400, `counterReadings entry for serial "${cr.serialNumber}" must have at least one category`);

        if (!tssSerialSet.has(cr.serialNumber))
          return abort(400, `Serial number "${cr.serialNumber}" does not belong to this call or does not have TSS contract type`);

        // Get costPerPage from SoldMachine for this serial
        const soldRecord = await SoldMachine.findOne(
          { "machines.serialNumbers.serialNumber": cr.serialNumber },
          { "machines.serialNumbers.$": 1 }
        ).session(session).lean();

        const soldSnEntry = soldRecord?.machines
          ?.flatMap(m => m.serialNumbers)
          .find(s => s.serialNumber === cr.serialNumber);

        const costPerPageMap = new Map(
          (soldSnEntry?.pagesCategories ?? []).map(pc => [
            pc.pagesCategoryId.toString(),
            { pagesCategory: pc.pagesCategory, costPerPage: pc.costPerPage, minCopies: pc.minCopies ?? 0 },
          ])
        );

        // Ensure all categories from SoldMachine are submitted
        const submittedCategoryIds = new Set(cr.categories.map(c => c.pagesCategoryId?.toString()));
        for (const [pcId, pc] of costPerPageMap) {
          if (!submittedCategoryIds.has(pcId))
            return abort(400, `Pages category "${pc.pagesCategory}" is required but missing for serial ${cr.serialNumber}`);
        }

        // Get lastReading from the most recent completed Counter-Reading call
        const lastCall = await ServiceCall.findOne(
          {
            "machines.serialNumber":              cr.serialNumber,
            "machines.counterReadings.serialNumber": cr.serialNumber,
            callType: "Counter-Reading",
            status:   "Completed",
            _id:      { $ne: call._id },
          },
          { "machines.counterReadings": 1 }
        ).sort({ "dates.completed": -1 }).session(session).lean();

        const lastSnReading = lastCall?.machines
          ?.flatMap(m => m.counterReadings ?? [])
          .find(r => r.serialNumber === cr.serialNumber);

        const categories = [];
        for (const cat of cr.categories) {
          const pcId = cat.pagesCategoryId?.toString();
          const pc   = costPerPageMap.get(pcId);
          if (!pc)
            return abort(400, `Pages category "${pcId}" not found in sold record for serial ${cr.serialNumber}`);
          const lastCat     = lastSnReading?.categories?.find(c => c.pagesCategoryId.toString() === pcId);
          const lastReading = lastCat?.currentReading ?? 0;
          const current     = Number(cat.currentReading);
          if (isNaN(current))
            return abort(400, `currentReading must be a valid number for serial ${cr.serialNumber} category ${pc.pagesCategory}`);
          if (current < lastReading)
            return abort(400, `currentReading (${current}) cannot be less than lastReading (${lastReading}) for serial ${cr.serialNumber} category ${pc.pagesCategory}`);
          const diff            = current - lastReading;
          const chargesInRupees = Math.round(diff * pc.costPerPage * 100) / 100;
          categories.push({
            pagesCategoryId: cat.pagesCategoryId,
            pagesCategory:   pc.pagesCategory,
            lastReading,
            currentReading:  current,
            costPerPage:     pc.costPerPage,
            minCopies:       pc.minCopies ?? 0,
            diff,
            chargesInRupees,
          });
        }

        if (categories.length > 0) {
          const soldMinCopies      = soldSnEntry?.minCopies ?? 0;
          const totalCopiesPrinted = categories.reduce((sum, c) => sum + c.diff, 0);
          let minCopiesEntry       = null;

          if (soldMinCopies > 0 && totalCopiesPrinted < soldMinCopies) {
            const remainingCopies  = soldMinCopies - totalCopiesPrinted;
            const minCostPerPage   = Math.min(...categories.map(c => c.costPerPage));
            minCopiesEntry = {
              minCopies:          soldMinCopies,
              currentTotalCopies: totalCopiesPrinted,
              diff:               remainingCopies,
              costPerPage:        minCostPerPage,
              chargesInRupees:    Math.round(remainingCopies * minCostPerPage * 100) / 100,
            };
          }

          counterReadingsMap.set(cr.serialNumber, { serialNumber: cr.serialNumber, categories, minCopies: minCopiesEntry });
        }
      }
    }

    const totalServiceCharges          = call.totalServiceCharges ?? 0;
    const totalPartsCharges             = Math.round(partsCharges * 100) / 100;
    const totalCounterReadingCharges    = Math.round(
      Array.from(counterReadingsMap.values())
        .reduce((sum, cr) => {
          const catCharges = cr.categories.reduce((s, c) => s + c.chargesInRupees, 0);
          const minCharges = cr.minCopies?.chargesInRupees ?? 0;
          return sum + catCharges + minCharges;
        }, 0) * 100
    ) / 100;
    const totalCharges = Math.round((totalServiceCharges + totalPartsCharges + totalCounterReadingCharges) * 100) / 100;

    // ── Build lastReading map for Service-Call readings ──
    const lastReadingMap = new Map(); // serialNumber -> reading

    if (call.callType === "Service-Call" && Array.isArray(parsedServiceCallReadings) && parsedServiceCallReadings.length > 0) {
      const callSerialNumbers = new Set(call.machines.map(m => m.serialNumber).filter(Boolean));
      for (const entry of parsedServiceCallReadings) {
        if (!entry.serialNumber || typeof entry.serialNumber !== "string")
          return abort(400, "Each serviceCallReading must have a serialNumber");
        if (!callSerialNumbers.has(entry.serialNumber))
          return abort(400, `serialNumber "${entry.serialNumber}" does not belong to this call`);
        if (entry.reading == null || isNaN(Number(entry.reading)) || Number(entry.reading) < 0)
          return abort(400, `reading must be a non-negative number for serial ${entry.serialNumber}`);
        lastReadingMap.set(entry.serialNumber, Number(entry.reading));
      }
    }

    // Build per-machine field updates
    const machineSetFields = {};
    call.machines.forEach((m, idx) => {
      const mParts       = variantPartsMap.get(m.serialNumber) || [];
      const mPartsCharge = Math.round(mParts.reduce((s, p) => s + p.total, 0) * 100) / 100;
      machineSetFields[`machines.${idx}.partsCharge`]      = mPartsCharge;
      machineSetFields[`machines.${idx}.usedParts`]        = mParts;
      machineSetFields[`machines.${idx}.counterReadings`]  = counterReadingsMap.has(m.serialNumber)
        ? [counterReadingsMap.get(m.serialNumber)]
        : [];
      if (lastReadingMap.has(m.serialNumber))
        machineSetFields[`machines.${idx}.lastReading`] = lastReadingMap.get(m.serialNumber);
    });

    await call.updateOne(
      {
        $set: {
          status:              "Completed",
          "dates.completed":   new Date(),
          ...(afterWorkImages   && { afterWorkImages }),
          ...(customerSignature && { customerSignature }),
          totalPartsCharges,
          totalServiceCharges,
          totalCharges,
          totalCounterReadingCharges,
          sendToEmail:    sendToEmail    === true || sendToEmail    === "true",
          sendToWhatsapp: sendToWhatsapp === true || sendToWhatsapp === "true",
          ...machineSetFields,
        },
      },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    // Generate invoice and send email if requested — runs after transaction, non-blocking
    if ((sendToEmail === true || sendToEmail === "true") && call.callType === "Service-Call") {
      setImmediate(async () => {
        try {
          const updatedCall = await ServiceCall.findById(callId);
          if (!updatedCall) return;

          const Company  = require("../../admin/companyManagement/admin.company.model");
          const Counter  = require("../../admin/auth/counter.model");
          const companyId = updatedCall.companyInfo?.companyId;
          const company   = companyId ? await Company.findById(companyId) : null;

          const counter = await Counter.findByIdAndUpdate(
            "serviceCallInvoice",
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
          );
          const invoiceNumber = `SVC-INV-${counter.seq}`;

          const fmt = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          const basicTotal  = updatedCall.totalCharges ?? 0;
          const cgstPercent = updatedCall.cgst?.percent ?? 0;
          const sgstPercent = updatedCall.sgst?.percent ?? 0;
          const igstPercent = updatedCall.igst?.percent ?? 0;
          const cgstAmount  = parseFloat(((basicTotal * cgstPercent) / 100).toFixed(2));
          const sgstAmount  = parseFloat(((basicTotal * sgstPercent) / 100).toFixed(2));
          const igstAmount  = parseFloat(((basicTotal * igstPercent) / 100).toFixed(2));
          const grandTotal  = parseFloat((basicTotal + cgstAmount + sgstAmount + igstAmount).toFixed(2));

          const invoiceDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
          const completedDate = updatedCall.dates?.completed
            ? new Date(updatedCall.dates.completed).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
            : invoiceDate;

          const invoiceLogoUrl  = process.env.INVOICE_LOGO_URL  || "";
          const invoiceLogoText = process.env.INVOICE_LOGO_TEXT || "";

          const templatePath = path.join(__dirname, "../../../invoicesExamples/sales-invoice.html");
          let html = await fs.readFile(templatePath, "utf-8");

          html = html
            .replace(`<th>Description</th>`, `<th>Description</th>\n          <th style="width:120px;">Machine S/N</th>`)
            .replace(
              `<td>\n            <div class="item-name">{{machineName}}</div>\n            {{#if modelNumber}}<div class="item-model">Model: {{modelNumber}}</div>{{/if}}\n            {{#if serials}}<div class="item-serials">{{serialLabel}}: {{serials}}</div>{{/if}}\n          </td>`,
              `<td><div class="item-name">{{machineName}}</div>{{#if modelNumber}}<div class="item-model">Model: {{modelNumber}}</div>{{/if}}{{#if partCode}}<div class="item-serials">P/C: {{partCode}}</div>{{/if}}</td>\n          <td style="font-size:11px;">{{machineSN}}</td>`
            );

          html = html
            .replace(/{{invoiceNumber}}/g,     invoiceNumber)
            .replace(/{{invoiceDate}}/g,        invoiceDate)
            .replace(/{{companyName}}/g,        company?.name        || updatedCall.companyInfo?.name    || "")
            .replace(/{{companyTagline}}/g,     company?.tagline     || "")
            .replace(/{{companyAddress}}/g,     company?.address     || updatedCall.companyInfo?.address || "")
            .replace(/{{companyPhone}}/g,       company?.phone       || updatedCall.companyInfo?.phone   || "")
            .replace(/{{companyEmail}}/g,       company?.email       || updatedCall.companyInfo?.email   || "")
            .replace(/{{companyGst}}/g,         company?.gstNumber   || updatedCall.companyInfo?.gstNumber || "")
            .replace(/{{bankAccountNumber}}/g,  company?.bankAccountNumber || "")
            .replace(/{{bankName}}/g,           company?.bankName    || "")
            .replace(/{{ifscCode}}/g,           company?.ifscCode    || "")
            .replace(/{{bankBranch}}/g,         company?.bankBranch  || "")
            .replace(/{{qrCode}}/g,             company?.qrCode      || "")
            .replace(/{{invoiceLogoUrl}}/g,     invoiceLogoUrl)
            .replace(/{{invoiceLogoText}}/g,    invoiceLogoText)
            .replace(/{{customerName}}/g,       updatedCall.customerInfo?.name    || "")
            .replace(/{{customerAddress}}/g,    updatedCall.customerInfo?.address || "")
            .replace(/{{customerUniqueId}}/g,   updatedCall.customerInfo?.customerUniqueId || "")
            .replace(/{{customerGst}}/g,        updatedCall.customerInfo?.gstNumber || "")
            .replace(/{{basicTotal}}/g,         fmt(basicTotal))
            .replace(/{{cgstPercent}}/g,        cgstPercent)
            .replace(/{{cgstAmount}}/g,         fmt(cgstAmount))
            .replace(/{{sgstPercent}}/g,        sgstPercent)
            .replace(/{{sgstAmount}}/g,         fmt(sgstAmount))
            .replace(/{{igstPercent}}/g,        igstPercent)
            .replace(/{{igstAmount}}/g,         fmt(igstAmount))
            .replace(/{{grandTotal}}/g,         fmt(grandTotal));

          html = cgstPercent > 0 ? html.replace(/{{#if cgst}}([\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if cgst}}[\s\S]*?{{\/if}}/g, "");
          html = sgstPercent > 0 ? html.replace(/{{#if sgst}}([\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if sgst}}[\s\S]*?{{\/if}}/g, "");
          html = igstPercent > 0 ? html.replace(/{{#if igst}}([\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if igst}}[\s\S]*?{{\/if}}/g, "");
          html = company?.tagline    ? html.replace(/{{#if companyTagline}}([\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if companyTagline}}[\s\S]*?{{\/if}}/g, "");
          html = company?.qrCode     ? html.replace(/{{#if qrCode}}([\s\S]*?){{\/if}}/g, "$1")        : html.replace(/{{#if qrCode}}[\s\S]*?{{\/if}}/g, "");
          html = invoiceLogoUrl      ? html.replace(/{{#if invoiceLogoUrl}}([\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if invoiceLogoUrl}}[\s\S]*?{{\/if}}/g, "");
          html = invoiceLogoText     ? html.replace(/{{#if invoiceLogoText}}([\s\S]*?){{\/if}}/g, "$1"): html.replace(/{{#if invoiceLogoText}}[\s\S]*?{{\/if}}/g, "");

          const machineRowsMatch = html.match(/{{#each machines}}([\s\S]*?){{\/each}}/);
          if (machineRowsMatch) {
            const rowTemplate = machineRowsMatch[1];
            const rows = [];
            let srNo = 1;
            for (const machine of updatedCall.machines) {
              const sc = machine.serviceCharge ?? 0;
              if (sc > 0) {
                let row = rowTemplate
                  .replace(/{{srNo}}/g,        srNo++)
                  .replace(/{{machineName}}/g, "Service Charge")
                  .replace(/{{hsnCode}}/g,     machine.hsnCode || "-")
                  .replace(/{{quantity}}/g,    "-")
                  .replace(/{{rate}}/g,        fmt(sc))
                  .replace(/{{amount}}/g,      fmt(sc))
                  .replace(/{{machineSN}}/g,   machine.serialNumber || "-");
                row = row.replace(/{{#if modelNumber}}[\s\S]*?{{\/if}}/g, "");
                row = row.replace(/{{#if partCode}}[\s\S]*?{{\/if}}/g, "");
                row = row.replace(/{{#if serials}}[\s\S]*?{{\/if}}/g, "");
                rows.push(row);
              }
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
                row = part.modelNumber
                  ? row.replace(/{{#if modelNumber}}([\s\S]*?){{\/if}}/g, "$1").replace(/{{modelNumber}}/g, part.modelNumber)
                  : row.replace(/{{#if modelNumber}}[\s\S]*?{{\/if}}/g, "");
                row = part.partCode
                  ? row.replace(/{{#if partCode}}([\s\S]*?){{\/if}}/g, "$1").replace(/{{partCode}}/g, part.partCode)
                  : row.replace(/{{#if partCode}}[\s\S]*?{{\/if}}/g, "");
                row = row.replace(/{{#if serials}}[\s\S]*?{{\/if}}/g, "");
                rows.push(row);
              }
            }
            html = html.replace(/{{#each machines}}[\s\S]*?{{\/each}}/, rows.join(""));
          }

          const DOCS_DIR = process.env.NODE_ENV === "production"
            ? "/app/cloud/Documents"
            : path.join(__dirname, "../../../cloud/Documents");

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
          await ServiceCall.findByIdAndUpdate(callId, { invoiceUrl, invoiceNumber, invoiceGrandTotal: grandTotal });

          await sendServiceCallInvoiceEmail({
            invoiceNumber,
            invoiceDate,
            customerName:          updatedCall.customerInfo?.name    || "",
            customerEmail:         updatedCall.customerInfo?.email   || "",
            callId:                updatedCall.callId,
            callType:              updatedCall.callType,
            completedDate,
            engineerName:          updatedCall.engineerInfo?.name    || "",
            machines:              updatedCall.machines.map(m => ({ machineName: m.machineName, serialNumber: m.serialNumber })),
            totalServiceCharges:   updatedCall.totalServiceCharges   ?? 0,
            totalPartsCharges:     updatedCall.totalPartsCharges     ?? 0,
            basicTotal,
            cgstPercent,  cgstAmount,
            sgstPercent,  sgstAmount,
            igstPercent,  igstAmount,
            grandTotal,
            invoiceUrl,
            companyName:    company?.name      || updatedCall.companyInfo?.name    || "",
            companyAddress: company?.address   || updatedCall.companyInfo?.address || "",
            companyPhone:   company?.phone     || updatedCall.companyInfo?.phone   || "",
            companyGst:     company?.gstNumber || updatedCall.companyInfo?.gstNumber || "",
            companyEmail:   company?.email     || updatedCall.companyInfo?.email   || "",
          });
        } catch (err) {
          console.error("Invoice generation/email error after completeCall:", err.message);
        }
      });
    }

    if ((sendToEmail === true || sendToEmail === "true") && call.callType === "Counter-Reading") {
      setImmediate(async () => {
        try {
          const updatedCall = await ServiceCall.findById(callId);
          if (!updatedCall) return;

          const Company = require("../../admin/companyManagement/admin.company.model");
          const Counter = require("../../admin/auth/counter.model");
          const companyId = updatedCall.companyInfo?.companyId;
          const company   = companyId ? await Company.findById(companyId) : null;

          const counter = await Counter.findByIdAndUpdate(
            "counterReadingInvoice",
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
          );
          const invoiceNumber = `CR-INV-${counter.seq}`;

          const fmt = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          const basicTotal  = updatedCall.totalCounterReadingCharges ?? updatedCall.totalCharges ?? 0;
          const cgstPercent = updatedCall.cgst?.percent ?? 0;
          const sgstPercent = updatedCall.sgst?.percent ?? 0;
          const igstPercent = updatedCall.igst?.percent ?? 0;
          const cgstAmount  = parseFloat(((basicTotal * cgstPercent) / 100).toFixed(2));
          const sgstAmount  = parseFloat(((basicTotal * sgstPercent) / 100).toFixed(2));
          const igstAmount  = parseFloat(((basicTotal * igstPercent) / 100).toFixed(2));
          const grandTotal  = parseFloat((basicTotal + cgstAmount + sgstAmount + igstAmount).toFixed(2));

          const invoiceDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
          const completedDate = updatedCall.dates?.completed
            ? new Date(updatedCall.dates.completed).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
            : invoiceDate;

          const invoiceLogoUrl  = process.env.INVOICE_LOGO_URL  || "";
          const invoiceLogoText = process.env.INVOICE_LOGO_TEXT || "";

          const templatePath = path.join(__dirname, "../../../invoicesExamples/counter-reading-invoice.html");
          let html = await fs.readFile(templatePath, "utf-8");

          html = html
            .replace(/{{invoiceNumber}}/g,    invoiceNumber)
            .replace(/{{invoiceDate}}/g,      invoiceDate)
            .replace(/{{companyName}}/g,      company?.name        || updatedCall.companyInfo?.name    || "")
            .replace(/{{companyTagline}}/g,   company?.tagline     || "")
            .replace(/{{companyAddress}}/g,   company?.address     || updatedCall.companyInfo?.address || "")
            .replace(/{{companyPhone}}/g,     company?.phone       || updatedCall.companyInfo?.phone   || "")
            .replace(/{{companyEmail}}/g,     company?.email       || updatedCall.companyInfo?.email   || "")
            .replace(/{{companyGst}}/g,       company?.gstNumber   || updatedCall.companyInfo?.gstNumber || "")
            .replace(/{{bankAccountNumber}}/g, company?.bankAccountNumber || "")
            .replace(/{{bankName}}/g,         company?.bankName    || "")
            .replace(/{{ifscCode}}/g,         company?.ifscCode    || "")
            .replace(/{{bankBranch}}/g,       company?.bankBranch  || "")
            .replace(/{{qrCode}}/g,           company?.qrCode      || "")
            .replace(/{{invoiceLogoUrl}}/g,   invoiceLogoUrl)
            .replace(/{{invoiceLogoText}}/g,  invoiceLogoText)
            .replace(/{{customerName}}/g,     updatedCall.customerInfo?.name    || "")
            .replace(/{{customerAddress}}/g,  updatedCall.customerInfo?.address || "")
            .replace(/{{customerUniqueId}}/g, updatedCall.customerInfo?.customerUniqueId || "")
            .replace(/{{customerGst}}/g,      updatedCall.customerInfo?.gstNumber || "")
            .replace(/{{basicTotal}}/g,  fmt(basicTotal))
            .replace(/{{cgstPercent}}/g, cgstPercent)
            .replace(/{{cgstAmount}}/g,  fmt(cgstAmount))
            .replace(/{{sgstPercent}}/g, sgstPercent)
            .replace(/{{sgstAmount}}/g,  fmt(sgstAmount))
            .replace(/{{igstPercent}}/g, igstPercent)
            .replace(/{{igstAmount}}/g,  fmt(igstAmount))
            .replace(/{{grandTotal}}/g,  fmt(grandTotal));

          html = cgstPercent > 0 ? html.replace(/{{#if cgst}}([\s\S]*?){{\/if}}/g, "$1")  : html.replace(/{{#if cgst}}[\s\S]*?{{\/if}}/g, "");
          html = sgstPercent > 0 ? html.replace(/{{#if sgst}}([\s\S]*?){{\/if}}/g, "$1")  : html.replace(/{{#if sgst}}[\s\S]*?{{\/if}}/g, "");
          html = igstPercent > 0 ? html.replace(/{{#if igst}}([\s\S]*?){{\/if}}/g, "$1")  : html.replace(/{{#if igst}}[\s\S]*?{{\/if}}/g, "");
          html = company?.tagline  ? html.replace(/{{#if companyTagline}}([\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if companyTagline}}[\s\S]*?{{\/if}}/g, "");
          html = company?.qrCode   ? html.replace(/{{#if qrCode}}([\s\S]*?){{\/if}}/g, "$1")        : html.replace(/{{#if qrCode}}[\s\S]*?{{\/if}}/g, "");
          html = invoiceLogoUrl    ? html.replace(/{{#if invoiceLogoUrl}}([\s\S]*?){{\/if}}/g, "$1") : html.replace(/{{#if invoiceLogoUrl}}[\s\S]*?{{\/if}}/g, "");
          html = invoiceLogoText   ? html.replace(/{{#if invoiceLogoText}}([\s\S]*?){{\/if}}/g, "$1"): html.replace(/{{#if invoiceLogoText}}[\s\S]*?{{\/if}}/g, "");

          const rows = [];
          for (const machine of updatedCall.machines) {
            const cr = machine.counterReadings?.[0];
            if (!cr || !cr.categories?.length) continue;
            const categories   = cr.categories;
            const minCopies    = cr.minCopies;
            const machineTotal = categories.reduce((s, c) => s + c.chargesInRupees, 0) + (minCopies?.chargesInRupees ?? 0);
            const totalDataRows = categories.length + (minCopies ? 1 : 0);
            categories.forEach((cat, idx) => {
              const isFirst   = idx === 0;
              const isLastCat = idx === categories.length - 1;
              rows.push(`<tr class="cat-row${isLastCat && !minCopies ? " last-cat" : ""}">
                ${isFirst ? `<td rowspan="${totalDataRows}" style="font-weight:600;vertical-align:top;">${machine.machineName}${machine.modelNumber ? `<div style="font-size:10px;color:#555;font-weight:400;margin-top:2px;">Model: ${machine.modelNumber}</div>` : ""}</td><td rowspan="${totalDataRows}" style="font-size:11px;vertical-align:top;">${machine.serialNumber || ""}</td><td rowspan="${totalDataRows}" style="font-size:11px;vertical-align:top;">${machine.hsnCode || ""}</td>` : ""}
                <td>${cat.pagesCategory}</td><td class="right">${cat.diff}</td><td class="right">${fmt(cat.costPerPage)}</td><td class="right">${fmt(cat.chargesInRupees)}</td>
              </tr>`);
            });
            if (minCopies) {
              rows.push(`<tr class="min-copies-row"><td class="min-copies-label">Min Copies</td><td class="right">${minCopies.diff}</td><td class="right">${fmt(minCopies.costPerPage)}</td><td class="right">${fmt(minCopies.chargesInRupees)}</td></tr>`);
            }
            rows.push(`<tr class="machine-total-row"><td colspan="3"></td><td class="machine-total-label">Total</td><td></td><td></td><td class="right"><strong>${fmt(machineTotal)}</strong></td></tr>`);
          }
          html = html.replace("{{tableRows}}", rows.join(""));

          const DOCS_DIR = process.env.NODE_ENV === "production"
            ? "/app/cloud/Documents"
            : path.join(__dirname, "../../../cloud/Documents");

          const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
            import("puppeteer"),
            import("@sparticuz/chromium"),
          ]);
          const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || await chromium.executablePath();
          await fs.mkdir(DOCS_DIR, { recursive: true });
          const filename = `counter_reading_invoice_${invoiceNumber}_${Date.now()}.pdf`;
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
          await ServiceCall.findByIdAndUpdate(callId, { invoiceUrl, invoiceNumber, invoiceGrandTotal: grandTotal });

          await sendServiceCallInvoiceEmail({
            invoiceNumber,
            invoiceDate,
            customerName:        updatedCall.customerInfo?.name    || "",
            customerEmail:       updatedCall.customerInfo?.email   || "",
            callId:              updatedCall.callId,
            callType:            updatedCall.callType,
            completedDate,
            engineerName:        updatedCall.engineerInfo?.name    || "",
            machines:            updatedCall.machines.map(m => ({ machineName: m.machineName, serialNumber: m.serialNumber })),
            totalServiceCharges: 0,
            totalPartsCharges:   0,
            basicTotal,
            cgstPercent,  cgstAmount,
            sgstPercent,  sgstAmount,
            igstPercent,  igstAmount,
            grandTotal,
            invoiceUrl,
            companyName:    company?.name      || updatedCall.companyInfo?.name    || "",
            companyAddress: company?.address   || updatedCall.companyInfo?.address || "",
            companyPhone:   company?.phone     || updatedCall.companyInfo?.phone   || "",
            companyGst:     company?.gstNumber || updatedCall.companyInfo?.gstNumber || "",
            companyEmail:   company?.email     || updatedCall.companyInfo?.email   || "",
          });
        } catch (err) {
          console.error("Counter reading invoice/email error after completeCall:", err.message);
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: "Call completed successfully",
      data: { totalServiceCharges, totalPartsCharges, totalCounterReadingCharges, totalCharges },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getCounterReadingAssignedCalls = async (req, res) => {
  try {
    const engineerId = req.engineer.id;

    const calls = await ServiceCall.find({
      "engineerInfo._id": engineerId,
      status: { $in: ["Assigned"] },
      callType: "Counter-Reading",
    })
      .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt callType onHoldReason")
      .sort({ updatedAt: -1 });

    const data = await buildCounterReadingInfo(calls);

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getCounterReadingHistoryCalls = async (req, res) => {
  try {
    const engineerId = req.engineer.id;

    const calls = await ServiceCall.find({
      "engineerInfo._id": engineerId,
      status: { $in: ["Completed", "Cancelled"] },
      callType: "Counter-Reading",
    })
      .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt callType totalCounterReadingCharges totalCharges")
      .sort({ updatedAt: -1 });

    return res.status(200).json({ success: true, data: calls });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAssignedCalls, getOnHoldCalls, getHistoryCalls, getCounterReadingAssignedCalls, getCounterReadingHistoryCalls, getReimbursementPreview, startTravel, reachedLocation, startWork, putOnHold, getPartsMachines, getChargesSummary, createReimbursement, completeCall, buildCounterReadingInfo };
