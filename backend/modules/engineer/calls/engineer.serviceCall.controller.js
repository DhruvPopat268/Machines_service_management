const path = require("path");
const fs   = require("fs/promises");
const sharp = require("sharp");
const ServiceCall = require("../../customer/calls/customer.serviceCall.model");
const TravelReimbursement = require("../reimbursement/engineer.reimbursement.model");
const AdminUser = require("../../admin/auth/admin.user.model");
const PurchasedMachine = require("../../admin/purchasedMachines/admin.purchasedMachine.model");
const Machine = require("../../admin/inventoryManagement/admin.machine.model");
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

const getPartsMachines = async (req, res) => {
  try {
    const partsCategoryId = process.env.PARTS_CATEGORY_ID;
    const { search } = req.query;

    const purchaseRecords = await PurchasedMachine.find({
      "machines.categoryId": new mongoose.Types.ObjectId(partsCategoryId),
      ...(search?.trim() && {
        "machines.machineName": { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
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
    const machineVariantStockMap = new Map();
    if (machineIds.length > 0) {
      const machines = await Machine.find({ _id: { $in: machineIds }, status: "Active" }).select("_id images variants");
      machines.forEach(m => {
        machineImagesMap.set(m._id.toString(), m.images);
        const stockMap = new Map();
        m.variants.forEach(v => stockMap.set(`${v.attribute.toString()}_${v.value.trim().toLowerCase()}`, v.currentStock));
        machineVariantStockMap.set(m._id.toString(), stockMap);
      });
    }

    const parts = purchaseRecords.flatMap(record =>
      record.machines
        .filter(m => m.categoryId?.toString() === partsCategoryId)
        .filter(machine => machine.machineId && machineImagesMap.has(machine.machineId.toString()))
        .flatMap(machine =>
          machine.variants.flatMap(variant => {
            const { quantity, price, discountedPrice, total, willAddToInventory, addedToInventory, partCodes, ...rest } = variant.toObject();
            const stockMap = machine.machineId ? machineVariantStockMap.get(machine.machineId.toString()) : null;
            const currentStock = stockMap?.get(`${rest.attribute.toString()}_${rest.value.trim().toLowerCase()}`) ?? 0;
            if (currentStock <= 0 || !partCodes?.length) return [];
            return partCodes.map(partCode => ({
              machineId:   machine.machineId,
              machineName: machine.machineName,
              modelNumber: machine.modelNumber,
              categoryId:  machine.categoryId,
              category:    machine.category,
              divisionId:  machine.divisionId,
              division:    machine.division,
              images:      machineImagesMap.get(machine.machineId.toString()) || [],
              variant:     { ...rest, currentStock, partCode },
            }));
          })
        )
    );

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
  const meters = data.rows?.[0]?.elements?.[0]?.distance?.value;
  if (!meters) throw new Error("Could not calculate distance");
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
    const callDistanceKm = await getRoadDistanceKm(
      lastLocation.latitude, lastLocation.longitude,
      customerLat, customerLng
    );

    let totalKm    = callDistanceKm;
    let travelTo   = { address: call.customerInfo?.location?.address || call.customerInfo?.address, latitude: customerLat, longitude: customerLng };

    if (purpose === "Go To Office") {
      const adminUser = await AdminUser.findOne({ role: "Admin" }).select("officeLocation");
      const returnKm = await getRoadDistanceKm(
        customerLat, customerLng,
        adminUser.officeLocation.latitude, adminUser.officeLocation.longitude
      );
      totalKm  = Math.round((callDistanceKm + returnKm) * 100) / 100;
      travelTo = { address: adminUser.officeLocation.address || "", latitude: adminUser.officeLocation.latitude, longitude: adminUser.officeLocation.longitude };
    }

    if (purpose === "Go To Home") {
      const returnKm = await getRoadDistanceKm(
        customerLat, customerLng,
        engineer.engineerLocation.latitude, engineer.engineerLocation.longitude
      );
      totalKm  = Math.round((callDistanceKm + returnKm) * 100) / 100;
      travelTo = { address: engineer.engineerLocation.address || "", latitude: engineer.engineerLocation.latitude, longitude: engineer.engineerLocation.longitude };
    }

    const reimbursement = await TravelReimbursement.create({
      callId:      call._id,
      engineerInfo: {
        _id:        call.engineerInfo._id,
        identityId: call.engineerInfo.identityId,
        name:       call.engineerInfo.name,
        phone:      call.engineerInfo.phone,
      },
      customerInfo: {
        name:    call.customerInfo.name,
        phone:   call.customerInfo.phone,
        address: call.customerInfo.address,
      },
      travelDate:  new Date(),
      purpose,
      travelFrom:  { address: lastLocation.address || "", latitude: lastLocation.latitude, longitude: lastLocation.longitude },
      travelTo,
      travelledKm: totalKm,
      status:      "Pending",
    });

    return res.status(201).json({ success: true, data: reimbursement });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getActiveCalls, getReimbursementPreview, startTravel, reachedLocation, startWork, putOnHold, getPartsMachines, createReimbursement };

