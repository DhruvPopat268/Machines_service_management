const validatePassword = require("../../../utils/validatePassword");

const validateCreateUser = (data) => {
  const errors = {};

  if (!data.email) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = "Invalid email format";
  }

  const passwordError = validatePassword(data.password);
  if (passwordError) errors.password = passwordError;

  return { isValid: Object.keys(errors).length === 0, errors };
};

module.exports = { validateCreateUser };
