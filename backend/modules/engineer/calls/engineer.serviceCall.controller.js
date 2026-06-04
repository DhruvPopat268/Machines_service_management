const path = require("path");
const fs   = require("fs/promises");
const sharp = require("sharp");
const ServiceCall = require("../../customer/calls/customer.serviceCall.model");
const TravelReimbursement = require("../reimbursement/engineer.reimbursement.model");
const AdminUser = require("../../admin/auth/admin.user.model");
const PurchasedMachine = require("../../admin/purchasedMachines/admin.purchasedMachine.model");
const Machine = require("../../admin/inventoryManagement/admin.machine.model");
const InventoryLog = require("../../admin/inventoryLogs/admin.inventoryLog.model");
const mongoose = require("mongoose");
const axios = require("axios");

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

const getActiveCalls = async (req, res) => {
  try {
    const engineerId = req.engineer.id;

    const calls = await ServiceCall.find({
      "engineerInfo._id": engineerId,
      status: { $nin: ["Open", "Completed", "Cancelled"] },
    })
      .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt")
      .sort({ updatedAt: -1 });

    return res.status(200).json({ success: true, data: calls });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getReimbursementPreview = async (req, res) => {
  try {
    const engineerId = req.engineer.id;
    const { callId, currentLocation } = req.body;
    const { latitude: currentLatitude, longitude: currentLongitude } = currentLocation || {};

    if (!mongoose.isValidObjectId(callId))
      return res.status(400).json({ success: false, message: "Invalid callId" });

    if (!currentLatitude || !currentLongitude)
      return res.status(400).json({ success: false, message: "currentLocation.latitude and currentLocation.longitude are required" });

    const call = await ServiceCall.findById(callId);
    if (!call)
      return res.status(404).json({ success: false, message: "Call not found" });

    if (call.status !== "Assigned" && call.status !== "On Hold")
      return res.status(400).json({ success: false, message: "Call is not in Assigned or On Hold status" });

    if (call.engineerInfo?._id?.toString() !== engineerId)
      return res.status(403).json({ success: false, message: "You are not assigned to this call" });

    const customerLat = call.customerInfo?.location?.latitude;
    const customerLng = call.customerInfo?.location?.longitude;

    if (!customerLat || !customerLng)
      return res.status(400).json({ success: false, message: "Customer location not available" });

    const lat = parseFloat(currentLatitude);
    const lng = parseFloat(currentLongitude);

    const [engineerAddress, distanceMatrix] = await Promise.all([
      reverseGeocode(lat, lng),
      axios.get("https://maps.googleapis.com/maps/api/distancematrix/json", {
        params: {
          origins:      `${lat},${lng}`,
          destinations: `${customerLat},${customerLng}`,
          key: MAPS_KEY,
        },
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
        currentLocation:  { latitude: lat, longitude: lng, address: engineerAddress },
        customerLocation: { latitude: customerLat, longitude: customerLng, address: call.customerInfo?.location?.address || call.customerInfo?.address },
        distanceKm,
        estimatedTimeMin: durationMin,
      },
    });
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

    if (files.length === 0)
      return res.status(400).json({ success: false, message: "beforeWorkImages are required" });

    const call = await ServiceCall.findById(callId);
    if (!call)
      return res.status(404).json({ success: false, message: "Call not found" });

    if (call.status !== "Reached Location")
      return res.status(400).json({ success: false, message: "Call is not in Reached Location status" });

    if (call.engineerInfo?._id?.toString() !== engineerId)
      return res.status(403).json({ success: false, message: "You are not assigned to this call" });

    let beforeWorkImages;
    try {
      beforeWorkImages = await processImages(files);
    } catch (imgErr) {
      return res.status(400).json({ success: false, message: imgErr.message });
    }

    await call.updateOne({
      status: "In Progress",
      "dates.inProgress": new Date(),
      beforeWorkImages,
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
        if (!p || typeof p !== "string")
          return res.status(400).json({ success: false, message: "Each usedPart must be a non-empty string partCode" });
      }
    }

    const call = await ServiceCall.findById(callId).select("totalServiceCharges status engineerInfo._id");
    if (!call)
      return res.status(404).json({ success: false, message: "Call not found" });

    if (call.engineerInfo?._id?.toString() !== req.engineer.id)
      return res.status(403).json({ success: false, message: "You are not assigned to this call" });

    const serviceCharges = call.totalServiceCharges ?? 0;

    if (!hasUsedParts)
      return res.status(200).json({ success: true, data: { serviceCharges, partsCharges: 0, totalCharges: serviceCharges } });

    const partCodesList = usedParts.map(p => p.trim());

    const purchaseRecords = await PurchasedMachine.find(
      { "machines.partCodes.partCode": { $in: partCodesList } },
      { "machines.partCodes": 1, "machines.sellingPrice": 1, "machines.discountedSellingPrice": 1 }
    );

    // Build map: partCode -> unit price
    const priceMap = new Map();
    for (const record of purchaseRecords) {
      for (const machine of record.machines) {
        const unitPrice = machine.discountedSellingPrice ?? machine.sellingPrice ?? 0;
        for (const entry of (machine.partCodes || [])) {
          if (partCodesList.includes(entry.partCode.trim())) {
            priceMap.set(entry.partCode.trim(), unitPrice);
          }
        }
      }
    }

    const notFound = partCodesList.filter(c => !priceMap.has(c));
    if (notFound.length > 0)
      return res.status(404).json({ success: false, message: `Part code(s) not found: ${notFound.join(", ")}` });

    // Check none are already sold
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

    const partsCharges = Math.round(partCodesList.reduce((sum, pc) => sum + (priceMap.get(pc) ?? 0), 0) * 100) / 100;
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
      const records = await TravelReimbursement.insertMany([
        { callId: call._id, engineerInfo, customerInfo, travelDate: new Date(), purpose: "Service Call", travelFrom: fromPoint,      travelTo: customerPoint, travelledKm: leg1Km, status: "Pending" },
        { callId: call._id, engineerInfo, customerInfo, travelDate: new Date(), purpose: "Go To Office",  travelFrom: customerPoint, travelTo: officePoint,   travelledKm: leg2Km, status: "Pending" },
      ]);
      return res.status(201).json({ success: true, data: records });
    }

    if (purpose === "Go To Home") {
      const homePoint = { address: engineer.engineerLocation.address || "", latitude: engineer.engineerLocation.latitude, longitude: engineer.engineerLocation.longitude };
      const [leg1Km, leg2Km] = await Promise.all([
        getRoadDistanceKm(lastLocation.latitude, lastLocation.longitude, customerLat, customerLng),
        getRoadDistanceKm(customerLat, customerLng, engineer.engineerLocation.latitude, engineer.engineerLocation.longitude),
      ]);
      const records = await TravelReimbursement.insertMany([
        { callId: call._id, engineerInfo, customerInfo, travelDate: new Date(), purpose: "Service Call", travelFrom: fromPoint,      travelTo: customerPoint, travelledKm: leg1Km, status: "Pending" },
        { callId: call._id, engineerInfo, customerInfo, travelDate: new Date(), purpose: "Go To Home",   travelFrom: customerPoint, travelTo: homePoint,      travelledKm: leg2Km, status: "Pending" },
      ]);
      return res.status(201).json({ success: true, data: records });
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
    const { callId, usedParts, sendToEmail, sendToWhatsapp } = req.body;

    const abort = async (status, message) => {
      await session.abortTransaction();
      session.endSession();
      return res.status(status).json({ success: false, message });
    };

    if (!mongoose.isValidObjectId(callId))
      return abort(400, "Invalid callId");

    let parsedUsedParts;
    try {
      parsedUsedParts = typeof usedParts === "string" ? JSON.parse(usedParts) : usedParts;
    } catch (_) {
      return abort(400, "Invalid usedParts format");
    }

    const hasUsedParts = Array.isArray(parsedUsedParts) && parsedUsedParts.length > 0;

    if (hasUsedParts) {
      for (const p of parsedUsedParts) {
        if (!p.partCode || typeof p.partCode !== "string")
          return abort(400, "Each usedPart must have a partCode");
        if (!p.quantity || typeof p.quantity !== "number" || p.quantity <= 0)
          return abort(400, `Invalid quantity for partCode: ${p.partCode}`);
        if (!p.serialNumber || typeof p.serialNumber !== "string")
          return abort(400, `Each usedPart must have a serialNumber (the call machine it was used on)`);
      }
    }

    const files       = req.files || {};
    const afterFiles  = files.afterWorkImages || [];
    const sigFiles    = files.customerSignature || [];

    if (afterFiles.length === 0)
      return abort(400, "afterWorkImages are required");
    if (sigFiles.length === 0)
      return abort(400, "customerSignature is required");

    const call = await ServiceCall.findById(callId).session(session);
    if (!call)
      return abort(404, "Call not found");

    if (call.status !== "In Progress")
      return abort(400, "Call is not in In Progress status");

    if (call.engineerInfo?._id?.toString() !== engineerId)
      return abort(403, "You are not assigned to this call");

    // ── Upload images ──
    let afterWorkImages, customerSignature;
    try {
      afterWorkImages   = await processImages(afterFiles);
      customerSignature = (await processImages(sigFiles))[0];
    } catch (imgErr) {
      return abort(400, imgErr.message);
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
        { "machines.machineId": 1, "machines.machineName": 1, "machines.modelNumber": 1,
          "machines.categoryId": 1, "machines.category": 1, "machines.divisionId": 1, "machines.division": 1,
          "machines.partCodes": 1, "machines.sellingPrice": 1, "machines.discountedSellingPrice": 1 }
      ).session(session);

      // Build partCode -> { unitPrice, machineId, machineName, ... }
      const partInfoMap = new Map();
      for (const record of purchaseRecords) {
        for (const machine of record.machines) {
          const unitPrice = machine.discountedSellingPrice ?? machine.sellingPrice ?? 0;
          for (const entry of (machine.partCodes || [])) {
            if (partCodesList.includes(entry.partCode.trim())) {
              partInfoMap.set(entry.partCode.trim(), {
                unitPrice,
                machineId:              machine.machineId,
                machineName:            machine.machineName,
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

      // Group quantities by machineId for stock deduction
      const deductionMap = new Map();
      for (const p of parsedUsedParts) {
        const info      = partInfoMap.get(p.partCode.trim());
        const deductKey = info.machineId.toString();
        if (deductionMap.has(deductKey)) {
          deductionMap.get(deductKey).quantity += p.quantity;
        } else {
          deductionMap.set(deductKey, { ...info, partCode: p.partCode.trim(), quantity: p.quantity });
        }
        const lineTotal = Math.round(info.unitPrice * p.quantity * 100) / 100;
        partsCharges    = Math.round((partsCharges + lineTotal) * 100) / 100;

        // Group into variantPartsMap keyed by call machine serialNumber
        const callMachineKey = p.serialNumber || "unknown";
        if (!variantPartsMap.has(callMachineKey)) variantPartsMap.set(callMachineKey, []);
        variantPartsMap.get(callMachineKey).push({
          partCode:               p.partCode.trim(),
          machineId:              info.machineId,
          machineName:            info.machineName,
          categoryId:             info.categoryId,
          category:               info.category,
          sellingPrice:           info.sellingPrice,
          discountedSellingPrice: info.discountedSellingPrice,
          quantity:               p.quantity,
          total:                  lineTotal,
        });
      }

      // Deduct stock
      for (const [, item] of deductionMap) {
        const updated = await Machine.findOneAndUpdate(
          { _id: item.machineId, currentStock: { $gte: item.quantity } },
          { $inc: { currentStock: -item.quantity } },
          { new: true, session }
        );

        if (!updated)
          return abort(400, `Insufficient stock for part: ${item.machineName}`);

        const newStatus = resolveStockStatus(updated.currentStock, updated.lowStockThreshold);
        await Machine.updateOne(
          { _id: item.machineId },
          { $set: { stockStatus: newStatus } },
          { session }
        );

        const machineKey = item.machineId.toString();
        if (!logMachineMap.has(machineKey)) {
          logMachineMap.set(machineKey, {
            machineId:   item.machineId,
            machineName: item.machineName,
            categoryId:  item.categoryId,
            category:    item.category,
            divisionId:  item.divisionId,
            division:    item.division,
            quantity:    item.quantity,
            partCodes:   [item.partCode],
          });
        } else {
          logMachineMap.get(machineKey).partCodes.push(item.partCode);
          logMachineMap.get(machineKey).quantity += item.quantity;
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

    const totalServiceCharges = call.totalServiceCharges ?? 0;
    const totalPartsCharges   = Math.round(partsCharges * 100) / 100;
    const totalCharges        = Math.round((totalServiceCharges + totalPartsCharges) * 100) / 100;

    // Build per-machine field updates
    const machineSetFields = {};
    call.machines.forEach((m, idx) => {
      const mParts       = variantPartsMap.get(m.serialNumber) || [];
      const mPartsCharge = Math.round(mParts.reduce((s, p) => s + p.total, 0) * 100) / 100;
      machineSetFields[`machines.${idx}.partsCharge`] = mPartsCharge;
      machineSetFields[`machines.${idx}.usedParts`]   = mParts;
    });

    await call.updateOne(
      {
        $set: {
          status:              "Completed",
          "dates.completed":   new Date(),
          afterWorkImages,
          customerSignature,
          totalPartsCharges,
          totalServiceCharges,
          sendToEmail:    sendToEmail    === true || sendToEmail    === "true",
          sendToWhatsapp: sendToWhatsapp === true || sendToWhatsapp === "true",
          ...machineSetFields,
        },
      },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Call completed successfully",
      data: { totalServiceCharges, totalPartsCharges, totalCharges },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ success: false, message: err.message });
  }
};



module.exports = { getActiveCalls, getReimbursementPreview, startTravel, reachedLocation, startWork, putOnHold, getPartsMachines, getChargesSummary, createReimbursement, completeCall };
