const mongoose = require("mongoose");

const companySchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, unique: true, trim: true },
    address:   { type: String, required: true, trim: true },
    phone:     { type: String, required: true, trim: true },
    email:     { type: String, required: true, trim: true, lowercase: true },
    gstNumber: { type: String, trim: true, required: true, unique: true, set: (v) => (v && v.trim() ? v.trim().toUpperCase() : undefined) },
    status:    { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Company", companySchema);
