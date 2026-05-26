const validatePassword = require("../../../utils/validatePassword");

const validateLogin = ({ email, password }) => {
  if (!email || typeof email !== "string" || !email.trim())
    return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return "Invalid email format";
  if (!password || typeof password !== "string" || !password.trim())
    return "Password is required";
  return null;
};

const validateUpdateProfile = ({ name, phone, email }) => {
  if (name !== undefined && (typeof name !== "string" || !name.trim()))
    return "Name must be a non-empty string";
  if (phone !== undefined && (typeof phone !== "string" || !phone.trim()))
    return "Phone must be a non-empty string";
  if (email !== undefined) {
    if (typeof email !== "string" || !email.trim())
      return "Email must be a non-empty string";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return "Invalid email format";
  }
  return null;
};

module.exports = { validateLogin, validateUpdateProfile, validatePassword };
