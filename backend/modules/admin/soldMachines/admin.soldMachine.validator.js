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
      const { attribute, value, quantity, price, discountedPrice, serialNumbers } = variants[vi];
      const label = `${machineLabel} Variant ${vi + 1}`;

      if (!attribute || !mongoose.isValidObjectId(attribute))
        return `${label}: invalid or missing attribute ID`;

      if (!value || !String(value).trim())
        return `${label}: value is required`;

      if (quantity == null || isNaN(quantity) || Number(quantity) <= 0)
        return `${label}: quantity must be a positive number`;

      if (price == null)
        return `${label}: price is required`;
      if (typeof price === "string" && price.trim() === "")
        return `${label}: price cannot be empty`;
      const numPrice = Number(price);
      if (Number.isNaN(numPrice))
        return `${label}: price must be a valid number`;
      if (numPrice < 0)
        return `${label}: price must be a non-negative number`;

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

      if (!Array.isArray(serialNumbers) || serialNumbers.length === 0)
        return `${label}: serialNumbers array is required`;

      if (serialNumbers.length !== Number(quantity))
        return `${label}: serialNumbers count must match quantity`;

      for (let si = 0; si < serialNumbers.length; si++) {
        const entry = serialNumbers[si];
        const slabel = `${label} Serial ${si + 1}`;

        if (!entry.serialNumber || !String(entry.serialNumber).trim())
          return `${slabel}: serialNumber is required`;

        if (!entry.contractTypeId || !mongoose.isValidObjectId(entry.contractTypeId))
          return `${slabel}: invalid or missing contract type ID`;

        if (!entry.validFrom || !entry.validTo)
          return `${slabel}: validFrom and validTo are required`;

        const fromDate = new Date(entry.validFrom);
        const toDate   = new Date(entry.validTo);
        if (isNaN(fromDate.getTime())) return `${slabel}: invalid validFrom date`;
        if (isNaN(toDate.getTime()))   return `${slabel}: invalid validTo date`;
        if (toDate <= fromDate)        return `${slabel}: validTo must be after validFrom`;
      }
    }
  }

  return null;
};

module.exports = { validateCreateSale };
