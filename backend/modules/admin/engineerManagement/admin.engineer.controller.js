const AdminUser = require("../auth/admin.user.model");
const ServiceCall = require("../../customer/calls/customer.serviceCall.model");
const axios = require("axios");
const mongoose = require("mongoose");

const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

const getEngineers = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    const query = { role: "Engineer" };

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { name:       { $regex: escaped, $options: "i" } },
          { email:      { $regex: escaped, $options: "i" } },
          { phone:      { $regex: escaped, $options: "i" } },
          { engineerId: { $regex: escaped, $options: "i" } },
        ];
      }
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [engineers, total] = await Promise.all([
      AdminUser.find(query)
        .select("_id name email phone engineerId profilePhoto engineerLocation isOnline status lastLoginAt createdAt updatedAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      AdminUser.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: engineers,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getActiveEngineers = async (req, res) => {
  try {
    const { search, callId, page = 1, limit = 10 } = req.query;

    const query = { role: "Engineer", status: "Active" };

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { name:       { $regex: escaped, $options: "i" } },
          { email:      { $regex: escaped, $options: "i" } },
          { phone:      { $regex: escaped, $options: "i" } },
          { engineerId: { $regex: escaped, $options: "i" } },
        ];
      }
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [engineers, total] = await Promise.all([
      AdminUser.find(query)
        .select("_id name email phone engineerId profilePhoto engineerCurrentLocation isOnline status")
        .sort({ name: 1 })
        .skip(skip)
        .limit(limitNum),
      AdminUser.countDocuments(query),
    ]);

    // If callId provided and valid, fetch customer location and calculate distances
    let customerLat = null, customerLng = null;
    if (callId && mongoose.isValidObjectId(callId)) {
      const call = await ServiceCall.findById(callId).select("customerInfo.location").lean();
      customerLat = call?.customerInfo?.location?.latitude ?? null;
      customerLng = call?.customerInfo?.location?.longitude ?? null;
    }

    let enrichedEngineers = engineers.map(e => e.toObject());

    if (customerLat && customerLng && MAPS_KEY) {
      const withLocation = enrichedEngineers.filter(e => e.engineerCurrentLocation?.latitude && e.engineerCurrentLocation?.longitude);
      const withoutLocation = enrichedEngineers.filter(e => !e.engineerCurrentLocation?.latitude || !e.engineerCurrentLocation?.longitude);

      if (withLocation.length > 0) {
        const origins = withLocation.map(e => `${e.engineerCurrentLocation.latitude},${e.engineerCurrentLocation.longitude}`).join("|");
        try {
          const { data } = await axios.get("https://maps.googleapis.com/maps/api/distancematrix/json", {
            params: { origins, destinations: `${customerLat},${customerLng}`, key: MAPS_KEY },
          });
          withLocation.forEach((e, i) => {
            const element = data.rows?.[i]?.elements?.[0];
            if (element?.status === "OK") {
              e.distanceKm      = Math.round((element.distance.value / 1000) * 100) / 100;
              e.estimatedTimeMin = Math.round(element.duration.value / 60);
            }
          });
        } catch (_) { /* distance fetch failed, skip enrichment */ }
      }

      enrichedEngineers = [...withLocation, ...withoutLocation];
    }

    return res.status(200).json({
      success: true,
      data: enrichedEngineers,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getEngineers, getActiveEngineers };
