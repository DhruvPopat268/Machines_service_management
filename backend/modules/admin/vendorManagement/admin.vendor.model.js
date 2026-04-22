const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    phone:       { type: String, required: true, trim: true },
    email:       { type: String, required: true, trim: true, lowercase: true },
    address:     { type: String, trim: true, default: "" },
    gstNumber:   { type: String, trim: true, unique: true, sparse: true, set: (v) => (v && v.trim() ? v.trim().toUpperCase() : undefined) },
    status:      { type: String, enum: ["Active", "Inactive"], default: "Active" },
    source:      { type: String, enum: ["manual", "imported"], default: "manual" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vendor", vendorSchema);