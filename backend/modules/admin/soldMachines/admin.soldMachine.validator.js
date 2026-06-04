const mongoose = require("mongoose");

const PARTS_CATEGORY_ID = process.env.PARTS_CATEGORY_ID;

const validateCreateSale = (body) => {
  const { customerId, machines } = body;

  if (!customerId || !mongoose.isValidObjectId(customerId))
    return "Invalid or missing customer ID";

  if (!Array.isArray(machines) || machines.length === 0)
    return "machines array is required and must not be empty";

  for (let mi = 0; mi < machines.length; mi++) {
    const { machineId, categoryId, quantity, sellingPrice, discountedSellingPrice, serialNumbers, partCodes } = machines[mi];
    const label = `Machine ${mi + 1}`;

    if (!machineId || !mongoose.isValidObjectId(machineId))
      return `${label}: invalid or missing machine ID`;

    if (quantity == null || isNaN(quantity) || Number(quantity) <= 0)
      return `${label}: quantity must be a positive number`;

    if (sellingPrice == null || (typeof sellingPrice === "string" && sellingPrice.trim() === ""))
      return `${label}: sellingPrice is required`;
    const numPrice = Number(sellingPrice);
    if (isNaN(numPrice)) return `${label}: sellingPrice must be a valid number`;
    if (numPrice < 0)    return `${label}: sellingPrice must be a non-negative number`;

    if (discountedSellingPrice !== undefined && discountedSellingPrice !== null) {
      const n = Number(discountedSellingPrice);
      if (isNaN(n))     return `${label}: discountedSellingPrice must be a valid number`;
      if (n < 0)        return `${label}: discountedSellingPrice must be a non-negative number`;
      if (n > numPrice) return `${label}: discountedSellingPrice cannot be greater than sellingPrice`;
    }

    const isParts = categoryId && categoryId.toString() === PARTS_CATEGORY_ID;

    if (isParts) {
      if (!Array.isArray(partCodes) || partCodes.length === 0)
        return `${label}: partCodes are required for parts category machines`;
      if (partCodes.length !== Number(quantity))
        return `${label}: partCodes count must match quantity (${quantity})`;
      if (partCodes.some((c) => !c || !String(c).trim()))
        return `${label}: all part codes must be non-empty strings`;
    } else {
      if (!Array.isArray(serialNumbers) || serialNumbers.length === 0)
        return `${label}: serialNumbers are required`;
      if (serialNumbers.length !== Number(quantity))
        return `${label}: serialNumbers count must match quantity (${quantity})`;

      for (let si = 0; si < serialNumbers.length; si++) {
        const entry = serialNumbers[si];
        const slabel = `${label} serial ${si + 1}`;
        if (!entry || typeof entry !== "object")
          return `${slabel}: must be an object with serialNumber and contract fields`;
        if (!entry.serialNumber || !String(entry.serialNumber).trim())
          return `${slabel}: serialNumber is required`;
        if (!entry.contractTypeId || !mongoose.isValidObjectId(entry.contractTypeId))
          return `${slabel}: invalid or missing contractTypeId`;
        if (!entry.validFrom || !entry.validTo)
          return `${slabel}: validFrom and validTo are required`;
        const from = new Date(entry.validFrom);
        const to   = new Date(entry.validTo);
        if (isNaN(from.getTime())) return `${slabel}: invalid validFrom date`;
        if (isNaN(to.getTime()))   return `${slabel}: invalid validTo date`;
        if (to <= from)            return `${slabel}: validTo must be after validFrom`;
      }
    }
  }

  return null;
};

module.exports = { validateCreateSale };
