const EngineerNotification = require("./engineer.notification.model");

const getNotifications = async (req, res) => {
  try {
    const engineerId = req.engineer.id;

    const notifications = await EngineerNotification.find({ engineerId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: notifications });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const markAsRead = async (req, res) => {
  try {
    const engineerId = req.engineer.id;
    const { notificationId, all } = req.body;

    if (all === true || all === "true") {
      await EngineerNotification.updateMany(
        { engineerId, status: "Unread" },
        { $set: { status: "Read" } }
      );
      return res.status(200).json({ success: true, message: "All notifications marked as read" });
    }

    if (!notificationId)
      return res.status(400).json({ success: false, message: "notificationId is required" });

    const notification = await EngineerNotification.findOne({ _id: notificationId, engineerId });
    if (!notification)
      return res.status(404).json({ success: false, message: "Notification not found" });

    if (notification.status === "Read")
      return res.status(200).json({ success: true, message: "Notification already marked as read" });

    notification.status = "Read";
    await notification.save();

    return res.status(200).json({ success: true, message: "Notification marked as read" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getNotifications, markAsRead };
