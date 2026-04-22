const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const validateGST = (gst) => {
  if (!gst) return null;
  if (gst.length !== 15 || !GST_REGEX.test(gst))
    return "Invalid GST number format";
  return null;
};

const validateCreateCustomer = ({ name, phone, email, status }) => {
  if (!name || typeof name !== "string" || !name.trim())
    return "Name is required";
  if (!phone || typeof phone !== "string" || !phone.trim())
    return "Phone is required";
  if (!email || typeof email !== "string" || !email.trim())
    return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return "Invalid email format";
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

const validateUpdateCustomer = ({ name, phone, email, status }) => {
  if (name !== undefined && (typeof name !== "string" || !name.trim()))
    return "Name must be a non-empty string";
  if (phone !== undefined && (typeof phone !== "string" || !phone.trim()))
    return "Phone must be a non-empty string";
  if (email !== undefined) {
    if (typeof email !== "string" || !email.trim()) return "Email must be a non-empty string";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Invalid email format";
  }
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

const validateImportCustomerRow = (row, rowNum) => {
  const name  = String(row.name  || "").trim();
  const phone = String(row.phone || "").trim();
  const email = String(row.email || "").trim();
  const status = String(row.status || "").trim();
  const totalPurchases = row.totalpurchases !== undefined ? Number(row.totalpurchases) : 0;
  if (!name)  return `Row ${rowNum}: name is required`;
  if (!phone) return `Row ${rowNum}: phone is required`;
  if (!email) return `Row ${rowNum}: email is required`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return `Row ${rowNum}: invalid email format`;
  if (!["Active", "Inactive"].includes(status)) return `Row ${rowNum}: status must be Active or Inactive`;
  if (isNaN(totalPurchases) || totalPurchases < 0) return `Row ${rowNum}: totalPurchases must be a non-negative number`;
  return null;
};

module.exports = { validateCreateCustomer, validateUpdateCustomer, validateImportCustomerRow, validateGST };
