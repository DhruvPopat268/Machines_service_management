const mongoose = require("mongoose");

const validateFlowShortcut = (body) => {
  const { customer, machine } = body;

  // ── Customer ──────────────────────────────────────────────────────────────
  if (!customer || typeof customer !== "object")
    return "customer object is required";

  const { name, phone, email, address, zone } = customer;

  if (!name || typeof name !== "string" || !name.trim())
    return "customer.name is required";

  if (!phone || typeof phone !== "string" || !phone.trim())
    return "customer.phone is required";
  if (!/^[0-9]{10}$/.test(phone.trim()))
    return "customer.phone must be exactly 10 digits";

  if (!email || typeof email !== "string" || !email.trim())
    return "customer.email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return "customer.email is invalid";

  if (!address || typeof address !== "string" || !address.trim())
    return "customer.address is required";

  const { latitude, longitude } = customer;
  if (latitude !== undefined && latitude !== null) {
    if (typeof latitude !== "number" || latitude < -90 || latitude > 90)
      return "customer.latitude must be a number between -90 and 90";
  }
  if (longitude !== undefined && longitude !== null) {
    if (typeof longitude !== "number" || longitude < -180 || longitude > 180)
      return "customer.longitude must be a number between -180 and 180";
  }

  if (!zone || !mongoose.isValidObjectId(zone))
    return "customer.zone is required and must be a valid ID";

  // ── Machine ───────────────────────────────────────────────────────────────
  if (!machine || typeof machine !== "object")
    return "machine object is required";

  const { name: mName, modelNumber, hsnCode, category, division } = machine;

  if (!mName || typeof mName !== "string" || !mName.trim())
    return "machine.name is required";

  if (!modelNumber || typeof modelNumber !== "string" || !modelNumber.trim())
    return "machine.modelNumber is required";

  if (hsnCode !== undefined && hsnCode !== null && typeof hsnCode !== "string")
    return "machine.hsnCode must be a string";

  if (!category || !mongoose.isValidObjectId(category))
    return "machine.category is required and must be a valid ID";

  if (!division || !mongoose.isValidObjectId(division))
    return "machine.division is required and must be a valid ID";

  return null;
};

module.exports = { validateFlowShortcut };
