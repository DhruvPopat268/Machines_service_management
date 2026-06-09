const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const validateGST = (gst) => {
  if (!gst) return null;
  if (gst.length !== 15 || !GST_REGEX.test(gst))
    return "Invalid GST number format";
  return null;
};

const validateCreateCompany = ({ name, address, phone, email, gstNumber, status }) => {
  if (!name || typeof name !== "string" || !name.trim())
    return "Name is required";
  if (!address || typeof address !== "string" || !address.trim())
    return "Address is required";
  if (!phone || typeof phone !== "string" || !phone.trim())
    return "Phone is required";
  if (!email || typeof email !== "string" || !email.trim())
    return "Email is required";
  if (!emailRegex.test(email.trim()))
    return "Invalid email format";
  if (!gstNumber || typeof gstNumber !== "string" || !gstNumber.trim())
    return "GST number is required";
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

const validateUpdateCompany = ({ name, address, phone, email, status }) => {
  if (name !== undefined && (typeof name !== "string" || !name.trim()))
    return "Name must be a non-empty string";
  if (address !== undefined && (typeof address !== "string" || !address.trim()))
    return "Address must be a non-empty string";
  if (phone !== undefined && (typeof phone !== "string" || !phone.trim()))
    return "Phone must be a non-empty string";
  if (email !== undefined) {
    if (typeof email !== "string" || !email.trim()) return "Email must be a non-empty string";
    if (!emailRegex.test(email.trim())) return "Invalid email format";
  }
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

module.exports = { validateCreateCompany, validateUpdateCompany, validateGST };
