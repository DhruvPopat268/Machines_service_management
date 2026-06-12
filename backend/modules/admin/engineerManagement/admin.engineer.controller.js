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

const formatIST = (date) => {
  if (!date) return null;
  const d = new Date(date);
  const dd   = String(d.getUTCDate()        + Math.floor((d.getUTCHours() + 5.5) / 24)).padStart(2, "0");
  // Use toLocaleString for simplicity and accuracy
  const ist  = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const day  = String(ist.getUTCDate()).padStart(2, "0");
  const mon  = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const yr   = String(ist.getUTCFullYear()).slice(2);
  let   hrs  = ist.getUTCHours();
  const min  = String(ist.getUTCMinutes()).padStart(2, "0");
  const ampm = hrs >= 12 ? "PM" : "AM";
  hrs = hrs % 12 || 12;
  return `${day}/${mon}/${yr} ${String(hrs).padStart(2, "0")}:${min} ${ampm}`;
};

const getEngineerCallTimeline = async (req, res) => {
  try {
    const { engineerId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    if (!mongoose.isValidObjectId(engineerId))
      return res.status(400).json({ success: false, message: "Invalid engineerId" });

    const engineer = await AdminUser.findOne({ _id: engineerId, role: "Engineer" })
      .select("_id name email phone engineerId isOnline status")
      .lean();
    if (!engineer)
      return res.status(404).json({ success: false, message: "Engineer not found" });

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [calls, total] = await Promise.all([
      ServiceCall.find({ "engineerInfo._id": engineerId })
        .select("callId callType status priority customerInfo.name customerInfo.phone dates onHoldReason")
        .sort({ "dates.assigned": -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ServiceCall.countDocuments({ "engineerInfo._id": engineerId }),
    ]);

    const callTimelines = calls.map(call => {
      const d = call.dates || {};
      const timeline = [
        { label: "Assigned",         date: formatIST(d.assigned)        },
        { label: "Travel Started",   date: formatIST(d.travelStarted)   },
        { label: "Reached Location", date: formatIST(d.reachedLocation) },
        { label: "In Progress",      date: formatIST(d.inProgress)      },
        ...(d.onHold    ? [{ label: "On Hold",   date: formatIST(d.onHold),    meta: call.onHoldReason || null }] : []),
        ...(d.completed ? [{ label: "Completed", date: formatIST(d.completed) }] : []),
        ...(d.cancelled ? [{ label: "Cancelled", date: formatIST(d.cancelled) }] : []),
      ];

      return {
        callId:       call.callId,
        callType:     call.callType,
        status:       call.status,
        priority:     call.priority,
        customerName: call.customerInfo?.name,
        customerPhone:call.customerInfo?.phone,
        timeline,
      };
    });

    return res.status(200).json({
      success: true,
      data: { engineer, calls: callTimelines },
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAllEngineersCallTimeline = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [calls, total] = await Promise.all([
      ServiceCall.find({ "engineerInfo._id": { $exists: true } })
        .select("callId callType status priority engineerInfo.name engineerInfo._id dates onHoldReason")
        .sort({ "dates.assigned": -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ServiceCall.countDocuments({ "engineerInfo._id": { $exists: true } }),
    ]);

    const callTimelines = calls.map(call => {
      const d = call.dates || {};
      const timeline = [
        { label: "Assigned",         date: formatIST(d.assigned)        },
        { label: "Travel Started",   date: formatIST(d.travelStarted)   },
        { label: "Reached Location", date: formatIST(d.reachedLocation) },
        { label: "In Progress",      date: formatIST(d.inProgress)      },
        ...(d.onHold    ? [{ label: "On Hold",   date: formatIST(d.onHold),    meta: call.onHoldReason || null }] : []),
        ...(d.completed ? [{ label: "Completed", date: formatIST(d.completed) }] : []),
        ...(d.cancelled ? [{ label: "Cancelled", date: formatIST(d.cancelled) }] : []),
      ];
      return {
        callId:       call.callId,
        callType:     call.callType,
        status:       call.status,
        priority:     call.priority,
        engineerName: call.engineerInfo?.name ?? "",
        timeline,
      };
    });

    return res.status(200).json({
      success: true,
      data: callTimelines,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getEngineers, getActiveEngineers, getEngineerCallTimeline, getAllEngineersCallTimeline };
