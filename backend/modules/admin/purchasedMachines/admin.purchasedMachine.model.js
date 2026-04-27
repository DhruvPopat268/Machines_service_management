const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema(
  {
    attribute:          { type: mongoose.Schema.Types.ObjectId, ref: "Attribute", required: true },
    name:               { type: String, trim: true, required: true },
    value:              { type: String, trim: true, required: true },
    quantity:           { type: Number, required: true },
    price:              { type: Number, required: true },
    discountedPrice:    { type: Number, default: null },
    total:              { type: Number, required: true },
    willAddToInventory: { type: Boolean, default: true },
    addedToInventory:   { type: Boolean, default: false },
  },
  { _id: false }
);

const purchasedMachineEntrySchema = new mongoose.Schema(
  {
    machineId:            { type: mongoose.Schema.Types.ObjectId, ref: "Machine", default: null },
    machineName:          { type: String, trim: true, required: true },
    category:             { type: String, trim: true, default: "" },
    variants:             { type: [variantSchema], required: true },
    machineTotalPurchased:{ type: Number, default: 0 },
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
    machines:   { type: [purchasedMachineEntrySchema], required: true },
    grandTotal: { type: Number, default: 0 },
  },
  { timestamps: true }
);

purchasedMachineSchema.index({ "vendorInfo.name": 1 });
purchasedMachineSchema.index({ "vendorInfo.vendorId": 1 });
purchasedMachineSchema.index({ "machines.machineName": 1 });
purchasedMachineSchema.index({ "machines.category": 1 });
purchasedMachineSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PurchasedMachine", purchasedMachineSchema);
