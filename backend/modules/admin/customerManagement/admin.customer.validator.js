const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const validateGST = (gst) => {
  if (!gst) return null;
  if (gst.length !== 15 || !GST_REGEX.test(gst))
    return "Invalid GST number format";

  const stateCode = parseInt(gst.slice(0, 2), 10);
  if (stateCode < 1 || stateCode > 37)
    return "Invalid GST number format";

  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const val    = CHARS.indexOf(gst[i]);
    const weight = i % 2 === 0 ? 1 : 2;
    const prod   = val * weight;
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  const checksum = CHARS[sum % 36];
  if (checksum !== gst[14])
    return "Invalid GST number format";

  return null;
};

const validateCreateCustomer = ({ name, phone, email, address, zone, status }) => {
  if (!name || typeof name !== "string" || !name.trim())
    return "Name is required";
  if (!phone || typeof phone !== "string" || !phone.trim())
    return "Phone is required";
  if (!/^[0-9]{10}$/.test(phone.trim()))
    return "Phone must be exactly 10 digits";
  if (!email || typeof email !== "string" || !email.trim())
    return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return "Invalid email format";
  if (!address || typeof address !== "string" || !address.trim())
    return "Address is required";
  if (!zone)
    return "Zone is required";
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

const validateUpdateCustomer = ({ name, phone, email, address, zone, status }) => {
  if (name !== undefined && (typeof name !== "string" || !name.trim()))
    return "Name must be a non-empty string";
  if (phone !== undefined && (typeof phone !== "string" || !phone.trim()))
    return "Phone must be a non-empty string";
  if (phone !== undefined && !/^[0-9]{10}$/.test(phone.trim()))
    return "Phone must be exactly 10 digits";
  if (email !== undefined) {
    if (typeof email !== "string" || !email.trim()) return "Email must be a non-empty string";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Invalid email format";
  }
  if (address !== undefined && (typeof address !== "string" || !address.trim()))
    return "Address must be a non-empty string";
  if (zone === "")
    return "Zone is required";
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
  if (!/^[0-9]{10}$/.test(phone)) return `Row ${rowNum}: phone must be exactly 10 digits`;
  if (!email) return `Row ${rowNum}: email is required`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return `Row ${rowNum}: invalid email format`;
  if (!String(row.address || "").trim()) return `Row ${rowNum}: address is required`;
  if (!String(row.zonename || "").trim()) return `Row ${rowNum}: zone is required`;
  if (!["Active", "Inactive"].includes(status)) return `Row ${rowNum}: status must be Active or Inactive`;
  if (isNaN(totalPurchases) || totalPurchases < 0) return `Row ${rowNum}: totalPurchases must be a non-negative number`;
  return null;
};

module.exports = { validateCreateCustomer, validateUpdateCustomer, validateImportCustomerRow, validateGST };
