const path = require("path");
const fs   = require("fs/promises");
const sharp = require("sharp");
const ServiceCall = require("../../customer/calls/customer.serviceCall.model");
const TravelReimbursement = require("../reimbursement/engineer.reimbursement.model");
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

    const customerLat = call.customerInfo?.location?.latitude;
    const customerLng = call.customerInfo?.location?.longitude;

    if (!customerLat || !customerLng)
      return res.status(400).json({ success: false, message: "Customer location not available" });

    const [engineerAddress, distanceKm] = await Promise.all([
      reverseGeocode(parseFloat(latitude), parseFloat(longitude)),
      getRoadDistanceKm(parseFloat(latitude), parseFloat(longitude), customerLat, customerLng),
    ]);

    await Promise.all([
      call.updateOne({ status: "Travel Started", "dates.travelStarted": new Date() }),
      TravelReimbursement.create({
        callId:       call._id,
        engineerInfo: call.engineerInfo,
        customerInfo: {
          name:    call.customerInfo.name,
          phone:   call.customerInfo.phone,
          address: call.customerInfo.address,
        },
        travelDate:  new Date(),
        travelFrom:  { address: engineerAddress, latitude: parseFloat(latitude), longitude: parseFloat(longitude) },
        travelTo:    { address: call.customerInfo?.location?.address || call.customerInfo.address, latitude: customerLat, longitude: customerLng },
        travelledKm: distanceKm,
        status:      "Pending",
      }),
    ]);

    return res.status(200).json({ success: true, message: "Travel started", distanceKm });
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
      const machines = await Machine.find({ _id: { $in: machineIds } }).select("_id images variants");
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
        .flatMap(machine =>
          machine.variants.map(variant => {
            const { quantity, price, discountedPrice, total, willAddToInventory, addedToInventory, ...rest } = variant.toObject();
            const stockMap = machine.machineId ? machineVariantStockMap.get(machine.machineId.toString()) : null;
            const currentStock = stockMap?.get(`${rest.attribute.toString()}_${rest.value.trim().toLowerCase()}`) ?? 0;
            return {
              machineId:   machine.machineId,
              machineName: machine.machineName,
              modelNumber: machine.modelNumber,
              categoryId:  machine.categoryId,
              category:    machine.category,
              divisionId:  machine.divisionId,
              division:    machine.division,
              images:      machine.machineId ? machineImagesMap.get(machine.machineId.toString()) || [] : [],
              variant:     { ...rest, currentStock },
            };
          })
        )
    );

    return res.status(200).json({ success: true, data: parts });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getActiveCalls, getReimbursementPreview, startTravel, reachedLocation, startWork, putOnHold, getPartsMachines };
