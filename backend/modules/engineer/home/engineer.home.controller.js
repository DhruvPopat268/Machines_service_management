const ServiceCall = require("../../customer/calls/customer.serviceCall.model");
const AdminUser   = require("../../admin/auth/admin.user.model");
const { buildCounterReadingInfo, buildServiceCallReadingInfo } = require("../calls/engineer.serviceCall.controller");

const getHome = async (req, res) => {
  try {
    const engineerId = req.engineer.id;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [rawActiveCalls, engineer, assignedToday, onHoldToday, completedToday, totalCallsCompleted] = await Promise.all([
      ServiceCall.find({
        "engineerInfo._id": engineerId,
        status: { $in: ["Travel Started", "Reached Location", "In Progress"] },
      })
        .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt callType onHoldReason cgst.percent sgst.percent igst.percent")
        .sort({ updatedAt: -1 }),
      AdminUser.findById(engineerId).select("name phone email engineerId profilePhoto isOnline createdAt"),
      ServiceCall.countDocuments({ "engineerInfo._id": engineerId, "dates.assigned":  { $gte: todayStart, $lte: todayEnd } }),
      ServiceCall.countDocuments({ "engineerInfo._id": engineerId, "dates.onHold":    { $gte: todayStart, $lte: todayEnd } }),
      ServiceCall.countDocuments({ "engineerInfo._id": engineerId, "dates.completed": { $gte: todayStart, $lte: todayEnd } }),
      ServiceCall.countDocuments({ "engineerInfo._id": engineerId, status: "Completed" }),
    ]);

    const activeCalls = await buildCounterReadingInfo(rawActiveCalls);
    const enrichedActiveCalls = await buildServiceCallReadingInfo(activeCalls);

    const experienceYears = engineer?.createdAt
      ? parseFloat(((Date.now() - new Date(engineer.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1))
      : 0;

    const dateOfJoined = engineer?.createdAt
      ? (() => {
          const d = new Date(engineer.createdAt);
          const dd  = String(d.getDate()).padStart(2, "0");
          const mm  = String(d.getMonth() + 1).padStart(2, "0");
          const yy  = String(d.getFullYear()).slice(2);
          let   hrs = d.getHours();
          const min = String(d.getMinutes()).padStart(2, "0");
          const ampm = hrs >= 12 ? "PM" : "AM";
          hrs = hrs % 12 || 12;
          return `${dd}/${mm}/${yy} ${hrs}:${min} ${ampm}`;
        })()
      : "";

    return res.status(200).json({
      success: true,
      data: {
        engineer: { ...engineer.toObject(), totalCallsCompleted, experienceYears, dateOfJoined },
        activeCalls: enrichedActiveCalls,
        todaySummary: {
          assignedCalls:  assignedToday,
          onHoldCalls:    onHoldToday,
          completedCalls: completedToday,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const updateCurrentLocation = async (req, res) => {
  try {
    const engineerId = req.engineer.id;
    const { latitude, longitude } = req.body;

    if (latitude == null || longitude == null)
      return res.status(400).json({ success: false, message: "latitude and longitude are required" });

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || lat < -90  || lat > 90)
      return res.status(400).json({ success: false, message: "latitude must be between -90 and 90" });
    if (isNaN(lng) || lng < -180 || lng > 180)
      return res.status(400).json({ success: false, message: "longitude must be between -180 and 180" });

    await AdminUser.findByIdAndUpdate(engineerId, { engineerCurrentLocation: { latitude: lat, longitude: lng } });

    return res.status(200).json({ success: true, message: "Current location updated" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const updateOnlineStatus = async (req, res) => {
  try {
    const engineerId = req.engineer.id;
    const { isOnline } = req.body;

    if (typeof isOnline !== "boolean")
      return res.status(400).json({ success: false, message: "isOnline must be a boolean" });

    await AdminUser.findByIdAndUpdate(engineerId, { isOnline });

    return res.status(200).json({ success: true, message: `Status updated to ${isOnline ? "Online" : "Offline"}` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getHome, updateOnlineStatus, updateCurrentLocation };
