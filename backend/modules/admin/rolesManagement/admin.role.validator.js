const mongoose = require("mongoose");

const validateCreateRole = ({ name, permissions, status }) => {
  if (!name || typeof name !== "string" || !name.trim())
    return "Name is required";
  if (permissions !== undefined) {
    if (!Array.isArray(permissions))
      return "Permissions must be an array";
    if (permissions.some((id) => !mongoose.isValidObjectId(id)))
      return "One or more permission IDs are invalid";
  }
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

const validateUpdateRole = ({ name, permissions, status }) => {
  if (name !== undefined && (typeof name !== "string" || !name.trim()))
    return "Name must be a non-empty string";
  if (permissions !== undefined) {
    if (!Array.isArray(permissions))
      return "Permissions must be an array";
    if (permissions.some((id) => !mongoose.isValidObjectId(id)))
      return "One or more permission IDs are invalid";
  }
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

module.exports = { validateCreateRole, validateUpdateRole };
