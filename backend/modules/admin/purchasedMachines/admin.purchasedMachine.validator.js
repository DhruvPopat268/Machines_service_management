const mongoose = require("mongoose");

const validateCreatePurchase = (body) => {
  const { vendorId, machines, invoiceNumber } = body;

  if (!vendorId || !mongoose.isValidObjectId(vendorId))
    return "Invalid or missing vendor ID";

  if (!invoiceNumber || typeof invoiceNumber !== "string" || !invoiceNumber.trim())
    return "Invoice number is required";

  if (invoiceNumber.trim().length > 100)
    return "Invoice number must not exceed 100 characters";

  if (!Array.isArray(machines) || machines.length === 0)
    return "machines array is required and must not be empty";

  for (let mi = 0; mi < machines.length; mi++) {
    const { machineId, quantity, buyingPriceWithGst, sellingPriceWithGst, serialNumbers, partCodes } = machines[mi];
    const label = `Machine ${mi + 1}`;

    if (!machineId || !mongoose.isValidObjectId(machineId))
      return `${label}: invalid or missing machine ID`;

    if (quantity == null || isNaN(quantity) || Number(quantity) <= 0)
      return `${label}: quantity must be a positive number`;

    if (buyingPriceWithGst == null || (typeof buyingPriceWithGst === "string" && buyingPriceWithGst.trim() === ""))
      return `${label}: buyingPriceWithGst is required`;
    const numBuyGst = Number(buyingPriceWithGst);
    if (isNaN(numBuyGst) || numBuyGst < 0) return `${label}: buyingPriceWithGst must be a non-negative number`;

    if (sellingPriceWithGst !== undefined && sellingPriceWithGst !== null) {
      const n = Number(sellingPriceWithGst);
      if (isNaN(n) || n < 0) return `${label}: sellingPriceWithGst must be a non-negative number`;
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
