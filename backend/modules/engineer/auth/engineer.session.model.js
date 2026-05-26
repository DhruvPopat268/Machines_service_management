const mongoose = require("mongoose");

const engineerSessionSchema = new mongoose.Schema({
  engineerId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", required: true },
  token: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("EngineerSession", engineerSessionSchema);
