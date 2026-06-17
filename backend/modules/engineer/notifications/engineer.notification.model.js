const mongoose = require("mongoose");

const engineerNotificationSchema = new mongoose.Schema(
  {
    engineerId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", required: true },
    callId:     { type: mongoose.Schema.Types.ObjectId, ref: "ServiceCall", required: true },
    header:     { type: String, trim: true, required: true },
    message:    { type: String, trim: true, required: true },
    callType:   { type: String, trim: true, required: true },
    type:       { type: String, enum: ["Assigned", "Cancelled"], required: true },
    status:     { type: String, enum: ["Read", "Unread"], default: "Unread" },
  },
  { timestamps: true }
);

engineerNotificationSchema.index({ engineerId: 1, status: 1 });
engineerNotificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("EngineerNotification", engineerNotificationSchema);
