const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const customerSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true },
    phone:     { type: String, required: true, trim: true, unique: true },
    email:     { type: String, required: true, trim: true, lowercase: true, unique: true },
    password:  { type: String },
    address:   { type: String, trim: true, default: "" },
    zone:      { type: mongoose.Schema.Types.ObjectId, ref: "Zone", default: null },
    gstNumber:      { type: String, trim: true, uppercase: true, unique: true, sparse: true, set: (v) => (v && v.trim() ? v.trim().toUpperCase() : undefined) },
    totalPurchases: { type: Number, default: 0 },
    status:         { type: String, enum: ["Active", "Inactive"], default: "Active" },
    source:         { type: String, enum: ["manual", "imported"], default: "manual" },
    resetPasswordOtp: { type: String },
    resetPasswordOtpExpires: { type: Date },
    changeEmailOtp: { type: String },
    changeEmailOtpExpires: { type: Date },
    newEmail: { type: String },
  },
  { timestamps: true }
);

customerSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("Customer", customerSchema);
