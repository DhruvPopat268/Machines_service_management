const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const adminUserSchema = new mongoose.Schema(
  {
    name:      { type: String, trim: true, default: "" },
    phone:     { type: String, trim: true, default: "", sparse: true, unique: true },
    email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:  { type: String, required: true },
    role:      { type: String, enum: ["Admin", "Engineer", "Support"], required: true },
    lastLoginAt:    { type: Date, default: null },
    lastActivityAt: { type: Date, default: null },
    status:    { type: String, enum: ["Active", "Inactive"], default: "Active" },
    changePasswordOtp:        { type: String },
    changePasswordOtpExpires: { type: Date },
  },
  { timestamps: true }
);

adminUserSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

adminUserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("AdminUser", adminUserSchema);
