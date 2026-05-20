const mongoose = require("mongoose");

const validateVariantId = (req, res, next) => {
  const { variantId } = req.params;
  
  if (!mongoose.Types.ObjectId.isValid(variantId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid variant ID format"
    });
  }
  
  next();
};

module.exports = { validateVariantId };
