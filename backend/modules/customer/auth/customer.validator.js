const validatePassword = require("../../../utils/validatePassword");

const validateSignup = ({ name, phone, email, password, address, zone }) => {
  const errors = {};
  if (!name || typeof name !== "string" || !name.trim())
    errors.name = "Name is required";
  if (!phone || typeof phone !== "string" || !phone.trim())
    errors.phone = "Phone is required";
  else if (!/^[0-9]{10}$/.test(phone.trim()))
    errors.phone = "Phone must be exactly 10 digits";
  if (!email || typeof email !== "string" || !email.trim())
    errors.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    errors.email = "Invalid email format";
  const passwordError = validatePassword(password);
  if (passwordError) errors.password = passwordError;
  if (!address || typeof address !== "string" || !address.trim())
    errors.address = "Address is required";
  if (!zone)
    errors.zone = "Zone is required";
  return { isValid: Object.keys(errors).length === 0, errors };
};

const validateLogin = ({ email, phone, password }) => {
  const errors = {};
  if (!email && !phone)
    errors.credential = "Email or phone is required";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    errors.email = "Invalid email format";
  if (phone && !/^[0-9]{10}$/.test(phone.trim()))
    errors.phone = "Phone must be exactly 10 digits";
  if (!password || typeof password !== "string" || !password.trim())
    errors.password = "Password is required";
  return { isValid: Object.keys(errors).length === 0, errors };
};

module.exports = { validateSignup, validateLogin };
