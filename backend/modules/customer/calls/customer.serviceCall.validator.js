const mongoose = require("mongoose");

const validateRaiseServiceCall = (req, res, next) => {
  const { serviceCalls } = req.body;

  if (!serviceCalls) {
    return res.status(400).json({
      success: false,
      message: "serviceCalls field is required"
    });
  }

  let parsedServiceCalls;
  try {
    parsedServiceCalls = typeof serviceCalls === "string" ? JSON.parse(serviceCalls) : serviceCalls;
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: "Invalid serviceCalls JSON format",
      error: err.message
    });
  }

  if (!Array.isArray(parsedServiceCalls) || parsedServiceCalls.length === 0) {
    return res.status(400).json({
      success: false,
      message: "serviceCalls must be a non-empty array"
    });
  }

  for (let i = 0; i < parsedServiceCalls.length; i++) {
    const serviceCall = parsedServiceCalls[i];
    
    if (!serviceCall.variantId) {
      return res.status(400).json({
        success: false,
        message: `Variant ID is required for service call at index ${i}`
      });
    }

    if (!mongoose.Types.ObjectId.isValid(serviceCall.variantId)) {
      return res.status(400).json({
        success: false,
        message: `Invalid variant ID format at index ${i}: ${serviceCall.variantId}`
      });
    }

    if (!serviceCall.issueDescription || typeof serviceCall.issueDescription !== "string" || serviceCall.issueDescription.trim() === "") {
      return res.status(400).json({
        success: false,
        message: `Issue description is required for service call at index ${i}`
      });
    }

    if (serviceCall.problemTypeId && !mongoose.Types.ObjectId.isValid(serviceCall.problemTypeId)) {
      return res.status(400).json({
        success: false,
        message: `Invalid problem type ID format at index ${i}: ${serviceCall.problemTypeId}`
      });
    }
  }

  next();
};

module.exports = { validateRaiseServiceCall };
