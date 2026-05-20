const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const adminUserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    lastLoginAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: null },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

adminUserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("AdminUser", adminUserSchema);
