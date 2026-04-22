const validateCreateVendor = ({ name, companyName, phone, email, status }) => {
  if (!name || typeof name !== "string" || !name.trim())
    return "Name is required";
  if (!companyName || typeof companyName !== "string" || !companyName.trim())
    return "Company name is required";
  if (!phone || typeof phone !== "string" || !phone.trim())
    return "Phone is required";
  if (!email || typeof email !== "string" || !email.trim())
    return "Email is required";
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

const validateUpdateVendor = ({ status }) => {
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

const validateImportVendorRow = (row, rowNum) => {
  const name        = String(row.name        || "").trim();
  const companyName = String(row.companyName || row.companyname || "").trim();
  const phone       = String(row.phone       || "").trim();
  const email       = String(row.email       || "").trim();
  const status      = String(row.status      || "").trim();
  if (!name)        return `Row ${rowNum}: name is required`;
  if (!companyName) return `Row ${rowNum}: companyName is required`;
  if (!phone)       return `Row ${rowNum}: phone is required`;
  if (!email)       return `Row ${rowNum}: email is required`;
  if (!["Active", "Inactive"].includes(status)) return `Row ${rowNum}: status must be Active or Inactive`;
  return null;
};

module.exports = { validateCreateVendor, validateUpdateVendor, validateImportVendorRow };
