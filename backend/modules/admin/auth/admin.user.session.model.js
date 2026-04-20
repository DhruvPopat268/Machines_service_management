const mongoose = require("mongoose");

const adminUserSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", required: true },
    token: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  }
);

module.exports = mongoose.model("AdminUserSession", adminUserSessionSchema);
