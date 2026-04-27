const mongoose = require("mongoose");

const validateCreatePurchase = (body) => {
  const { vendorId, machines } = body;

  if (!vendorId || !mongoose.isValidObjectId(vendorId))
    return "Invalid or missing vendor ID";

  if (!Array.isArray(machines) || machines.length === 0)
    return "machines array is required and must not be empty";

  for (let mi = 0; mi < machines.length; mi++) {
    const { machineId, variants } = machines[mi];
    const machineLabel = `Machine ${mi + 1}`;

    if (!machineId || !mongoose.isValidObjectId(machineId))
      return `${machineLabel}: invalid or missing machine ID`;

    if (!Array.isArray(variants) || variants.length === 0)
      return `${machineLabel}: variants array is required and must not be empty`;

    for (let vi = 0; vi < variants.length; vi++) {
      const { attribute, value, quantity, price, discountedPrice, willAddToInventory } = variants[vi];
      const label = `${machineLabel} Variant ${vi + 1}`;

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

      if (willAddToInventory !== undefined && typeof willAddToInventory !== "boolean")
        return `${label}: willAddToInventory must be a boolean`;
    }
  }

  return null;
};

module.exports = { validateCreatePurchase };
