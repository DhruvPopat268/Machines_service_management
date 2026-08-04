const mongoose = require("mongoose");

const paymentTransactionSchema = new mongoose.Schema(
  {
    soldMachineId:  { type: mongoose.Schema.Types.ObjectId, ref: "SoldMachine", required: true },
    amount:         { type: Number, required: true },
    paymentDate:    { type: Date, required: true },
    paymentMethod:  { type: String, enum: ["Cash", "Online"], required: true },
    receiptNumber:  { type: String, trim: true, default: "" },
    receiptUrl:     { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

paymentTransactionSchema.index({ soldMachineId: 1 });
paymentTransactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PaymentTransaction", paymentTransactionSchema);
