const mongoose = require("mongoose");

const TSS_CONTRACT_TYPE_ID = process.env.TSS_CONTRACT_TYPE_ID;

const validateEditInvoice = (body) => {
  const { customerId, machines } = body;

  if (customerId && !mongoose.isValidObjectId(customerId)) {
    return "Invalid customer ID format";
  }

  if (!Array.isArray(machines) || machines.length === 0) {
    return "machines array is required and must contain at least one item";
  }

  if (body.otherCharges !== undefined && body.otherCharges !== null) {
    const oc = Number(body.otherCharges);
    if (isNaN(oc) || oc < 0) return "otherCharges must be a non-negative number";
  }

  for (let mi = 0; mi < machines.length; mi++) {
    const item = machines[mi];
    const label = `Item ${mi + 1}`;

    if (!item.machineId || !mongoose.isValidObjectId(item.machineId)) {
      return `${label}: invalid or missing machine ID`;
    }

    const qty = Number(item.quantity);
    if (isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
      return `${label}: quantity must be a positive integer`;
    }

    if (item.sellingPriceWithGst == null || (typeof item.sellingPriceWithGst === "string" && item.sellingPriceWithGst.trim() === "")) {
      return `${label}: sellingPriceWithGst is required`;
    }
    const numPrice = Number(item.sellingPriceWithGst);
    if (isNaN(numPrice)) return `${label}: sellingPriceWithGst must be a valid number`;
    if (numPrice < 0) return `${label}: sellingPriceWithGst must be a non-negative number`;

    if (item.discountPercentage !== undefined && item.discountPercentage !== null && item.discountPercentage !== "") {
      const disc = Number(item.discountPercentage);
      if (isNaN(disc)) return `${label}: discountPercentage must be a valid number`;
      if (disc < 0 || disc > 100) return `${label}: discountPercentage must be between 0 and 100`;
    }

    if (Array.isArray(item.serialNumbers) && item.serialNumbers.length > 0) {
      if (item.serialNumbers.length !== qty) {
        return `${label}: serialNumbers count (${item.serialNumbers.length}) must match quantity (${qty})`;
      }

      for (let si = 0; si < item.serialNumbers.length; si++) {
        const entry = item.serialNumbers[si];
        const slabel = `${label} unit ${si + 1}`;
        if (!entry || typeof entry !== "object") {
          return `${slabel}: must be an object with serialNumber`;
        }
        if (!entry.serialNumber || !String(entry.serialNumber).trim()) {
          return `${slabel}: serialNumber is required`;
        }

        if (entry.contractTypeId) {
          if (!mongoose.isValidObjectId(entry.contractTypeId)) {
            return `${slabel}: invalid contractTypeId`;
          }
          if (!entry.validFrom || !entry.validTo) {
            return `${slabel}: validFrom and validTo are required when contractTypeId is provided`;
          }
          const from = new Date(entry.validFrom);
          const to = new Date(entry.validTo);
          if (isNaN(from.getTime())) return `${slabel}: invalid validFrom date`;
          if (isNaN(to.getTime())) return `${slabel}: invalid validTo date`;
          if (to <= from) return `${slabel}: validTo must be after validFrom`;

          if (TSS_CONTRACT_TYPE_ID && entry.contractTypeId.toString() === TSS_CONTRACT_TYPE_ID) {
            if (!Array.isArray(entry.pagesCategories) || entry.pagesCategories.length === 0) {
              return `${slabel}: pagesCategories is required for TSS contract type`;
            }
            const seenCatIds = new Set();
            for (let pi = 0; pi < entry.pagesCategories.length; pi++) {
              const pc = entry.pagesCategories[pi];
              if (!pc.pagesCategoryId || !mongoose.isValidObjectId(pc.pagesCategoryId)) {
                return `${slabel} pagesCategories[${pi}]: invalid pagesCategoryId`;
              }
              if (pc.costPerPage == null || isNaN(Number(pc.costPerPage)) || Number(pc.costPerPage) < 0) {
                return `${slabel} pagesCategories[${pi}]: costPerPage must be a non-negative number`;
              }
              const idStr = pc.pagesCategoryId.toString();
              if (seenCatIds.has(idStr)) {
                return `${slabel} pagesCategories[${pi}]: duplicate pages category is not allowed`;
              }
              seenCatIds.add(idStr);
            }
          }
        }
      }
    }
  }

  return null;
};

module.exports = { validateEditInvoice };
