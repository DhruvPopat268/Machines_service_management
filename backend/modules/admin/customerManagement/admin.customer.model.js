const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true },
    phone:     { type: String, required: true, trim: true, unique: true },
    email:     { type: String, required: true, trim: true, lowercase: true, unique: true },
    address:   { type: String, trim: true, default: "" },
    zone:      { type: mongoose.Schema.Types.ObjectId, ref: "Zone", default: null },
    gstNumber:      { type: String, trim: true, uppercase: true, unique: true, sparse: true, default: "" },
    totalPurchases: { type: Number, default: 0 },
    status:         { type: String, enum: ["Active", "Inactive"], default: "Active" },
    source:         { type: String, enum: ["manual", "imported"], default: "manual" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Customer", customerSchema);
