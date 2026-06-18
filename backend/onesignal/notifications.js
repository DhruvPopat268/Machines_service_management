const { onesignal, APP_ID } = require("./config");
const ServiceCall = require("../modules/customer/calls/customer.serviceCall.model");
const AdminUser   = require("../modules/admin/auth/admin.user.model");
const EngineerNotification = require("../modules/engineer/notifications/engineer.notification.model");

const sendCallAssignedNotification = async (callId) => {
  try {
    const call = await ServiceCall.findById(callId).select("callId callType customerInfo engineerInfo").lean();
    if (!call?.engineerInfo?._id) return;

    const engineer = await AdminUser.findById(call.engineerInfo._id).select("onesignalPlayerId phone").lean();

    const callLabel = call.callType === "Service-Call" ? "" : " Call";
    const header  = `${call.callType}${callLabel} Assigned — ${call.callId}`;
    const message = `You have a new call at ${call.customerInfo.address}. Customer: ${call.customerInfo.name} (${call.customerInfo.phone})`;

    await EngineerNotification.create({
      engineerId: call.engineerInfo._id,
      callId,
      header,
      message,
      callType: call.callType,
      type:     "Assigned",
    });

    if (!engineer?.onesignalPlayerId) {
      console.log(`[OneSignal] Assign notification skipped — no playerId for engineer ${call.engineerInfo._id} (phone: ${engineer?.phone || "N/A"})`);
      return;
    }

    await onesignal.post("/notifications", {
      app_id:             APP_ID,
      include_player_ids: [engineer.onesignalPlayerId],
      headings:           { en: header },
      contents:           { en: message },
      data:               { callId: call.callId },
    });

    console.log(`[OneSignal] Assign notification sent — callId: ${call.callId}, playerId: ${engineer.onesignalPlayerId}, phone: ${engineer.phone || "N/A"}`);
  } catch (err) {
    console.error(`[OneSignal] Assign notification error — callId: ${callId}:`, err?.response?.data || err.message);
  }
};

const sendCallCancelledNotification = async (callId) => {
  try {
    const call = await ServiceCall.findById(callId).select("callId callType engineerInfo").lean();
    if (!call?.engineerInfo?._id) return;

    const engineer = await AdminUser.findById(call.engineerInfo._id).select("onesignalPlayerId phone").lean();

    const callLabel = call.callType === "Service-Call" ? "" : " Call";
    const header  = `${call.callType}${callLabel} Cancelled — ${call.callId}`;
    const message = `Call ${call.callId} assigned to you has been cancelled by admin.`;

    await EngineerNotification.create({
      engineerId: call.engineerInfo._id,
      callId,
      header,
      message,
      callType: call.callType,
      type:     "Cancelled",
    });

    if (!engineer?.onesignalPlayerId) {
      console.log(`[OneSignal] Cancel notification skipped — no playerId for engineer ${call.engineerInfo._id} (phone: ${engineer?.phone || "N/A"})`);
      return;
    }

    await onesignal.post("/notifications", {
      app_id:             APP_ID,
      include_player_ids: [engineer.onesignalPlayerId],
      headings:           { en: header },
      contents:           { en: message },
      data:               { callId: call.callId },
    });

    console.log(`[OneSignal] Cancel notification sent — callId: ${call.callId}, playerId: ${engineer.onesignalPlayerId}, phone: ${engineer.phone || "N/A"}`);
  } catch (err) {
    console.error(`[OneSignal] Cancel notification error — callId: ${callId}:`, err?.response?.data || err.message);
  }
};

module.exports = { sendCallAssignedNotification, sendCallCancelledNotification };
