const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    phone:       { type: String, required: true, trim: true },
    email:       { type: String, required: true, trim: true, lowercase: true },
    address:     { type: String, trim: true, default: "" },
    gstNumber:   { type: String, trim: true, default: "", unique: true, sparse: true },
    status:      { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vendor", vendorSchema);