const mongoose = require("mongoose");

const validateCreateSale = (body) => {
  const { customerId, machines } = body;

  if (!customerId || !mongoose.isValidObjectId(customerId))
    return "Invalid or missing customer ID";

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
      const { attribute, value, quantity, price, discountedPrice } = variants[vi];
      const label = `${machineLabel} Variant ${vi + 1}`;

      if (!attribute || !mongoose.isValidObjectId(attribute))
        return `${label}: invalid or missing attribute ID`;

      if (!value || !String(value).trim())
        return `${label}: value is required`;

      if (quantity == null || isNaN(quantity) || Number(quantity) <= 0)
        return `${label}: quantity must be a positive number`;

      // Strict validation for price
      if (price == null)
        return `${label}: price is required`;
      if (typeof price === "string" && price.trim() === "")
        return `${label}: price cannot be empty`;
      const numPrice = Number(price);
      if (Number.isNaN(numPrice))
        return `${label}: price must be a valid number`;
      if (numPrice < 0)
        return `${label}: price must be a non-negative number`;

      // Strict validation for discountedPrice
      if (discountedPrice !== undefined && discountedPrice !== null) {
        if (typeof discountedPrice === "string" && discountedPrice.trim() === "")
          return `${label}: discounted price cannot be empty`;
        const numDiscountedPrice = Number(discountedPrice);
        if (Number.isNaN(numDiscountedPrice))
          return `${label}: discounted price must be a valid number`;
        if (numDiscountedPrice < 0)
          return `${label}: discounted price must be a non-negative number`;
        if (numDiscountedPrice > numPrice)
          return `${label}: discounted price cannot be greater than price`;
      }
    }
  }

  return null;
};

module.exports = { validateCreateSale };
