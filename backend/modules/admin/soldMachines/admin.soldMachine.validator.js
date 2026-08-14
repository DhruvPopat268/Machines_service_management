const mongoose = require("mongoose");

const PRODUCT_CATEGORY_ID  = process.env.PRODUCT_CATEGORY_ID;
const TSS_CONTRACT_TYPE_ID = process.env.TSS_CONTRACT_TYPE_ID;

const validateCreateSale = (body) => {
  const { customerId, machines } = body;

  if (!customerId || !mongoose.isValidObjectId(customerId))
    return "Invalid or missing customer ID";

  if (!Array.isArray(machines) || machines.length === 0)
    return "machines array is required and must not be empty";

  for (let mi = 0; mi < machines.length; mi++) {
    const { machineId, quantity, sellingPriceWithGst, discountPercentage, serialNumbers } = machines[mi];
    const label = `Machine ${mi + 1}`;

    if (!machineId || !mongoose.isValidObjectId(machineId))
      return `${label}: invalid or missing machine ID`;

    if (quantity == null || isNaN(quantity) || Number(quantity) <= 0)
      return `${label}: quantity must be a positive number`;

    if (sellingPriceWithGst == null || (typeof sellingPriceWithGst === "string" && sellingPriceWithGst.trim() === ""))
      return `${label}: sellingPriceWithGst is required`;
    const numPrice = Number(sellingPriceWithGst);
    if (isNaN(numPrice)) return `${label}: sellingPriceWithGst must be a valid number`;
    if (numPrice < 0)    return `${label}: sellingPriceWithGst must be a non-negative number`;

    if (discountPercentage !== undefined && discountPercentage !== null) {
      const n = Number(discountPercentage);
      if (isNaN(n))   return `${label}: discountPercentage must be a valid number`;
      if (n < 0)      return `${label}: discountPercentage must be a non-negative number`;
      if (n > 100)    return `${label}: discountPercentage cannot exceed 100`;
    }

    // serialNumbers validation only — isParts is determined in controller from DB
    // For parts machines, partCodes are auto-fetched in controller, nothing to validate here
    if (Array.isArray(serialNumbers) && serialNumbers.length > 0) {
      if (serialNumbers.length !== Number(quantity))
        return `${label}: serialNumbers count must match quantity (${quantity})`;

      for (let si = 0; si < serialNumbers.length; si++) {
        const entry = serialNumbers[si];
        const slabel = `${label} serial ${si + 1}`;
        if (!entry || typeof entry !== "object")
          return `${slabel}: must be an object with serialNumber`;
        if (!entry.serialNumber || !String(entry.serialNumber).trim())
          return `${slabel}: serialNumber is required`;
        
        // Contract type fields are now optional
        // Only validate them if contractTypeId is provided
        if (entry.contractTypeId) {
          if (!mongoose.isValidObjectId(entry.contractTypeId))
            return `${slabel}: invalid contractTypeId`;
          if (!entry.validFrom || !entry.validTo)
            return `${slabel}: validFrom and validTo are required when contractTypeId is provided`;
          const from = new Date(entry.validFrom);
          const to   = new Date(entry.validTo);
          if (isNaN(from.getTime())) return `${slabel}: invalid validFrom date`;
          if (isNaN(to.getTime()))   return `${slabel}: invalid validTo date`;
          if (to <= from)            return `${slabel}: validTo must be after validFrom`;

          if (TSS_CONTRACT_TYPE_ID && entry.contractTypeId.toString() === TSS_CONTRACT_TYPE_ID) {
            if (!Array.isArray(entry.pagesCategories) || entry.pagesCategories.length === 0)
              return `${slabel}: pagesCategories is required (at least 1) for TSS contract type`;
            for (let pi = 0; pi < entry.pagesCategories.length; pi++) {
              const pc = entry.pagesCategories[pi];
              if (!pc.pagesCategoryId || !mongoose.isValidObjectId(pc.pagesCategoryId))
                return `${slabel} pagesCategories[${pi}]: invalid or missing pagesCategoryId`;
              if (pc.costPerPage == null || isNaN(Number(pc.costPerPage)) || Number(pc.costPerPage) < 0)
                return `${slabel} pagesCategories[${pi}]: costPerPage must be a non-negative number`;
            }
          }
        }
      }
    }
  }

  const { currentPaymentStatus, paidAmount, paymentDate } = body;

  const validStatuses = ["Paid", "Unpaid", "Partial-Paid"];
  if (!currentPaymentStatus || !validStatuses.includes(currentPaymentStatus))
    return "currentPaymentStatus must be one of: Paid, Unpaid, Partial-Paid";

  if (currentPaymentStatus === "Paid" || currentPaymentStatus === "Partial-Paid") {
    if (!paymentDate) return "paymentDate is required for Paid or Partial-Paid status";
    if (isNaN(new Date(paymentDate).getTime())) return "paymentDate must be a valid date";
    if (!body.paymentMethod || !["Cash", "Online"].includes(body.paymentMethod))
      return "paymentMethod must be Cash or Online";
    if (!body.companyId || !mongoose.isValidObjectId(body.companyId))
      return "companyId is required for Paid or Partial-Paid status";
  }

  if (currentPaymentStatus === "Partial-Paid") {
    if (paidAmount == null || isNaN(Number(paidAmount)))
      return "paidAmount is required for Partial-Paid status";
    if (Number(paidAmount) <= 0)
      return "paidAmount must be greater than 0";
  }

  return null;
};

module.exports = { validateCreateSale };
