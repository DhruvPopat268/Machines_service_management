const { onesignal, APP_ID } = require("./config");
const ServiceCall = require("../modules/customer/calls/customer.serviceCall.model");
const AdminUser   = require("../modules/admin/auth/admin.user.model");

const sendCallAssignedNotification = async (callId) => {
  try {
    const call = await ServiceCall.findById(callId).select("callId customerInfo engineerInfo").lean();
    if (!call?.engineerInfo?._id) return;

    const engineer = await AdminUser.findById(call.engineerInfo._id).select("onesignalPlayerId phone").lean();
    if (!engineer?.onesignalPlayerId) {
      console.log(`[OneSignal] Assign notification skipped — no playerId for engineer ${call.engineerInfo._id} (phone: ${engineer?.phone || "N/A"})`);
      return;
    }

    await onesignal.post("/notifications", {
      app_id:             APP_ID,
      include_player_ids: [engineer.onesignalPlayerId],
      headings:           { en: `New Call Assigned — ${call.callId}` },
      contents:           { en: `You have a new call at ${call.customerInfo.address}. Customer: ${call.customerInfo.name} (${call.customerInfo.phone})` },
      data:               { callId: call.callId },
    });

    console.log(`[OneSignal] Assign notification sent — callId: ${call.callId}, playerId: ${engineer.onesignalPlayerId}, phone: ${engineer.phone || "N/A"}`);
  } catch (err) {
    console.error(`[OneSignal] Assign notification error — callId: ${callId}:`, err?.response?.data || err.message);
  }
};

const sendCallCancelledNotification = async (callId) => {
  try {
    const call = await ServiceCall.findById(callId).select("callId engineerInfo").lean();
    if (!call?.engineerInfo?._id) return;

    const engineer = await AdminUser.findById(call.engineerInfo._id).select("onesignalPlayerId phone").lean();
    if (!engineer?.onesignalPlayerId) {
      console.log(`[OneSignal] Cancel notification skipped — no playerId for engineer ${call.engineerInfo._id} (phone: ${engineer?.phone || "N/A"})`);
      return;
    }

    await onesignal.post("/notifications", {
      app_id:             APP_ID,
      include_player_ids: [engineer.onesignalPlayerId],
      headings:           { en: `Call Cancelled — ${call.callId}` },
      contents:           { en: `Call ${call.callId} assigned to you has been cancelled by admin.` },
      data:               { callId: call.callId },
    });

    console.log(`[OneSignal] Cancel notification sent — callId: ${call.callId}, playerId: ${engineer.onesignalPlayerId}, phone: ${engineer.phone || "N/A"}`);
  } catch (err) {
    console.error(`[OneSignal] Cancel notification error — callId: ${callId}:`, err?.response?.data || err.message);
  }
};

module.exports = { sendCallAssignedNotification, sendCallCancelledNotification };
