const ServiceCall = require("../../customer/calls/customer.serviceCall.model");

const getAllCalls = async (req, res) => {
  try {
    const allCalls = await ServiceCall.find()
      .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: allCalls
    });
  } catch (error) {
    console.error("Error fetching all calls:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch all calls"
    });
  }
};

const getOpenCalls = async (req, res) => {
  try {
    const openCalls = await ServiceCall.find({ status: "Open" })
      .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: openCalls
    });
  } catch (error) {
    console.error("Error fetching open calls:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch open calls"
    });
  }
};

const getAssignedCalls = async (req, res) => {
  try {
    const assignedCalls = await ServiceCall.find({ status: "Assigned" })
      .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt")
      .sort({ "dates.assigned": -1 });

    return res.status(200).json({
      success: true,
      data: assignedCalls
    });
  } catch (error) {
    console.error("Error fetching assigned calls:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch assigned calls"
    });
  }
};

const getInProgressCalls = async (req, res) => {
  try {
    const inProgressCalls = await ServiceCall.find({ status: "In Progress" })
      .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt")
      .sort({ "dates.inProgress": -1 });

    return res.status(200).json({
      success: true,
      data: inProgressCalls
    });
  } catch (error) {
    console.error("Error fetching in progress calls:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch in progress calls"
    });
  }
};

const getOnHoldCalls = async (req, res) => {
  try {
    const onHoldCalls = await ServiceCall.find({ status: "On Hold" })
      .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt")
      .sort({ "dates.onHold": -1 });

    return res.status(200).json({
      success: true,
      data: onHoldCalls
    });
  } catch (error) {
    console.error("Error fetching on hold calls:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch on hold calls"
    });
  }
};

const getCompletedCalls = async (req, res) => {
  try {
    const completedCalls = await ServiceCall.find({ status: "Completed" })
      .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt")
      .sort({ "dates.completed": -1 });

    return res.status(200).json({
      success: true,
      data: completedCalls
    });
  } catch (error) {
    console.error("Error fetching completed calls:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch completed calls"
    });
  }
};

const getCancelledCalls = async (req, res) => {
  try {
    const cancelledCalls = await ServiceCall.find({ status: "Cancelled" })
      .select("callId customerInfo machines status priority engineerInfo dates createdAt updatedAt")
      .sort({ "dates.cancelled": -1 });

    return res.status(200).json({
      success: true,
      data: cancelledCalls
    });
  } catch (error) {
    console.error("Error fetching cancelled calls:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch cancelled calls"
    });
  }
};

const getCallDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const serviceCall = await ServiceCall.findById(id);

    if (!serviceCall) {
      return res.status(404).json({
        success: false,
        message: "Service call not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: serviceCall
    });
  } catch (error) {
    console.error("Error fetching call detail:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch call detail"
    });
  }
};

module.exports = {
  getAllCalls,
  getOpenCalls,
  getAssignedCalls,
  getInProgressCalls,
  getOnHoldCalls,
  getCompletedCalls,
  getCancelledCalls,
  getCallDetail
};
