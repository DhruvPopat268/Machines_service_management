const mongoose = require("mongoose");

const customerSessionSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    token: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  }
);

module.exports = mongoose.model("CustomerSession", customerSessionSchema);
