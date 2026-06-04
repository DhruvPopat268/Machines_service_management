const mongoose = require("mongoose");

const validateCreatePurchase = (body) => {
  const { vendorId, machines } = body;

  if (!vendorId || !mongoose.isValidObjectId(vendorId))
    return "Invalid or missing vendor ID";

  if (!Array.isArray(machines) || machines.length === 0)
    return "machines array is required and must not be empty";

  for (let mi = 0; mi < machines.length; mi++) {
    const { machineId, quantity, buyingPrice, discountedBuyingPrice, sellingPrice, discountedSellingPrice, serialNumbers, partCodes } = machines[mi];
    const label = `Machine ${mi + 1}`;

    if (!machineId || !mongoose.isValidObjectId(machineId))
      return `${label}: invalid or missing machine ID`;

    if (quantity == null || isNaN(quantity) || Number(quantity) <= 0)
      return `${label}: quantity must be a positive number`;

    if (buyingPrice == null || (typeof buyingPrice === "string" && buyingPrice.trim() === ""))
      return `${label}: buyingPrice is required`;
    const numPrice = Number(buyingPrice);
    if (isNaN(numPrice)) return `${label}: buyingPrice must be a valid number`;
    if (numPrice < 0)    return `${label}: buyingPrice must be a non-negative number`;

    if (discountedBuyingPrice !== undefined && discountedBuyingPrice !== null) {
      const n = Number(discountedBuyingPrice);
      if (isNaN(n))        return `${label}: discountedBuyingPrice must be a valid number`;
      if (n < 0)           return `${label}: discountedBuyingPrice must be a non-negative number`;
      if (n > numPrice)    return `${label}: discountedBuyingPrice cannot be greater than buyingPrice`;
    }

    if (sellingPrice !== undefined && sellingPrice !== null) {
      const n = Number(sellingPrice);
      if (isNaN(n)) return `${label}: sellingPrice must be a valid number`;
      if (n < 0)    return `${label}: sellingPrice must be a non-negative number`;
    }

    if (discountedSellingPrice !== undefined && discountedSellingPrice !== null) {
      const n  = Number(discountedSellingPrice);
      const ns = Number(sellingPrice);
      if (isNaN(n))              return `${label}: discountedSellingPrice must be a valid number`;
      if (n < 0)                 return `${label}: discountedSellingPrice must be a non-negative number`;
      if (!isNaN(ns) && n > ns)  return `${label}: discountedSellingPrice cannot be greater than sellingPrice`;
    }

    if (serialNumbers !== undefined) {
      if (!Array.isArray(serialNumbers))
        return `${label}: serialNumbers must be an array`;
      if (serialNumbers.length !== Number(quantity))
        return `${label}: serialNumbers count must match quantity (${quantity})`;
      if (serialNumbers.some((s) => !s || !String(s).trim()))
        return `${label}: all serial numbers must be non-empty strings`;
      const unique = new Set(serialNumbers.map((s) => String(s).trim().toUpperCase()));
      if (unique.size !== serialNumbers.length)
        return `${label}: duplicate serial numbers in submitted list`;
    }

    if (partCodes !== undefined) {
      if (!Array.isArray(partCodes))
        return `${label}: partCodes must be an array`;
      if (partCodes.some((c) => !c || !String(c).trim()))
        return `${label}: all part codes must be non-empty strings`;
    }

  }

  return null;
};

module.exports = { validateCreatePurchase };
