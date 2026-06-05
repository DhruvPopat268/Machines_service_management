const ServiceCall = require("../../customer/calls/customer.serviceCall.model");
const AdminUser = require("../../admin/auth/admin.user.model");

const getHome = async (req, res) => {
  try {
    const engineerId = req.engineer.id;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [activeCalls, engineer, assignedToday, onHoldToday, completedToday] = await Promise.all([
      ServiceCall.find({
        "engineerInfo._id": engineerId,
        status: { $in: ["Travel Started", "Reached Location", "In Progress"] },
      })
        .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt callType onHoldReason")
        .sort({ updatedAt: -1 }),
      AdminUser.findById(engineerId).select("name phone email engineerId  profilePhoto isOnline"),
      ServiceCall.countDocuments({ "engineerInfo._id": engineerId, "dates.assigned": { $gte: todayStart, $lte: todayEnd } }),
      ServiceCall.countDocuments({ "engineerInfo._id": engineerId, "dates.onHold":   { $gte: todayStart, $lte: todayEnd } }),
      ServiceCall.countDocuments({ "engineerInfo._id": engineerId, "dates.completed":{ $gte: todayStart, $lte: todayEnd } }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        engineer,
        activeCalls,
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

module.exports = { getHome, updateOnlineStatus };
