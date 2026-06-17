const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const adminUserSchema = new mongoose.Schema(
  {
    name:      { type: String, trim: true, default: "" },
    phone:     { type: String, trim: true, default: "", sparse: true, unique: true },
    email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:  { type: String, required: true },
    role:      { type: String, enum: ["Admin", "Engineer", "Support"], required: true },
    profilePhoto:  { type: String, trim: true },
    engineerLocation: {
      address:   { type: String, trim: true },
      latitude:  { type: Number },
      longitude: { type: Number },
    },
    engineerCurrentLocation: {
      latitude:  { type: Number },
      longitude: { type: Number },
    },
    officeLocation: {
      address:   { type: String, trim: true },
      latitude:  { type: Number },
      longitude: { type: Number },
    },
    engineerId:      { type: String, trim: true, unique: true, sparse: true },
    dateOfJoining:   { type: Date, required: true },
    lastLoginAt:     { type: Date, default: null },
    lastActivityAt: { type: Date, default: null },
    isOnline:       { type: Boolean, default: false },
    status:    { type: String, enum: ["Active", "Inactive"], default: "Active" },
    changePasswordOtp:        { type: String },
    changePasswordOtpExpires: { type: Date },
    onesignalPlayerId:        { type: String, trim: true },
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
