const validatePassword = require("../../../utils/validatePassword");

const ROLES = ["Admin", "Engineer", "Support"];

const validateCreateSystemUser = ({ name, email, phone, password, role, status }) => {
  if (!name || typeof name !== "string" || !name.trim())
    return "Name is required";
  if (!email || typeof email !== "string" || !email.trim())
    return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return "Invalid email format";
  if (!phone || typeof phone !== "string" || !phone.trim())
    return "Phone is required";
  const passwordError = validatePassword(password);
  if (passwordError) return passwordError;
  if (!role || !ROLES.includes(role))
    return `Role must be one of: ${ROLES.join(", ")}`;
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

const validateUpdateSystemUser = ({ name, email, phone, role, status }) => {
  if (name !== undefined && (typeof name !== "string" || !name.trim()))
    return "Name must be a non-empty string";
  if (email !== undefined) {
    if (typeof email !== "string" || !email.trim())
      return "Email must be a non-empty string";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return "Invalid email format";
  }
  if (phone !== undefined && (typeof phone !== "string" || !phone.trim()))
    return "Phone must be a non-empty string";
  if (role !== undefined && !ROLES.includes(role))
    return `Role must be one of: ${ROLES.join(", ")}`;
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

module.exports = { validateCreateSystemUser, validateUpdateSystemUser, ROLES };
