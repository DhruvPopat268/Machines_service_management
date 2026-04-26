const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema(
  {
    name:            { type: String, trim: true, required: true },
    value:           { type: String, trim: true, required: true },
    quantity:        { type: Number, required: true },
    price:           { type: Number, required: true },
    discountedPrice: { type: Number, default: null },
    total:           { type: Number, required: true },
  },
  { _id: false }
);

const purchasedMachineSchema = new mongoose.Schema(
  {
    vendorInfo: {
      vendorId:    { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null },
      name:        { type: String, trim: true, default: "" },
      phone:       { type: String, trim: true, default: "" },
      email:       { type: String, trim: true, lowercase: true, default: "" },
      companyName: { type: String, trim: true, default: "" },
      gstNumber:   { type: String, trim: true, uppercase: true, default: "" },
    },

    category:           { type: String, trim: true, default: "" },
    machineId:          { type: mongoose.Schema.Types.ObjectId, ref: "Machine", default: null },
    machineName:        { type: String, trim: true, required: true },
    variants:           { type: [variantSchema], required: true },
    willAddToInventory: { type: Boolean, default: true },
    totalPurchased:     { type: Number, default: 0 },
  },
  { timestamps: true }
);

purchasedMachineSchema.index({ machineName: 1 });
purchasedMachineSchema.index({ "vendorInfo.name": 1 });
purchasedMachineSchema.index({ "vendorInfo.vendorId": 1 });
purchasedMachineSchema.index({ category: 1 });
purchasedMachineSchema.index({ willAddToInventory: 1 });
purchasedMachineSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PurchasedMachine", purchasedMachineSchema);
