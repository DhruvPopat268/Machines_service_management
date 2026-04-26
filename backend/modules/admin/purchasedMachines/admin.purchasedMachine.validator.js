const mongoose = require("mongoose");

const validateCreatePurchase = (body) => {
  const { vendorId, machineId, variants, willAddToInventory } = body;

  if (!vendorId || !mongoose.isValidObjectId(vendorId))
    return "Invalid or missing vendor ID";

  if (!machineId || !mongoose.isValidObjectId(machineId))
    return "Invalid or missing machine ID";

  if (!Array.isArray(variants) || variants.length === 0)
    return "Variants array is required and must not be empty";

  for (let i = 0; i < variants.length; i++) {
    const { attribute, value, quantity, price, discountedPrice } = variants[i];
    const label = `Variant ${i + 1}`;

    if (!attribute || !mongoose.isValidObjectId(attribute))
      return `${label}: invalid or missing attribute ID`;

    if (!value || !String(value).trim())
      return `${label}: value is required`;

    if (quantity == null || isNaN(quantity) || Number(quantity) <= 0)
      return `${label}: quantity must be a positive number`;

    if (price == null || isNaN(price) || Number(price) < 0)
      return `${label}: price must be a non-negative number`;

    if (discountedPrice !== undefined && discountedPrice !== null) {
      if (isNaN(discountedPrice) || Number(discountedPrice) < 0)
        return `${label}: discounted price must be a non-negative number`;
      if (Number(discountedPrice) > Number(price))
        return `${label}: discounted price cannot be greater than price`;
    }
  }

  if (willAddToInventory !== undefined && typeof willAddToInventory !== "boolean")
    return "willAddToInventory must be a boolean";

  return null;
};

module.exports = { validateCreatePurchase };
