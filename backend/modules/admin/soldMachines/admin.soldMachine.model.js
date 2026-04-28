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
    deductedFromInventory: { type: Boolean, default: false },
  },
  { _id: false }
);

const soldMachineEntrySchema = new mongoose.Schema(
  {
    machineId:       { type: mongoose.Schema.Types.ObjectId, ref: "Machine", default: null },
    machineName:     { type: String, trim: true, required: true },
    category:        { type: String, trim: true, default: "" },
    variants:        { type: [variantSchema], required: true },
    machineTotalSold:{ type: Number, default: 0 },
  },
  { _id: false }
);

const soldMachineSchema = new mongoose.Schema(
  {
    customerInfo: {
      customerId:  { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
      name:        { type: String, trim: true, default: "" },
      phone:       { type: String, trim: true, default: "" },
      email:       { type: String, trim: true, lowercase: true, default: "" },
      address:     { type: String, trim: true, default: "" },
      zone:        { type: String, trim: true, default: "" },
      gstNumber:   { type: String, trim: true, uppercase: true, default: "" },
    },
    machines:   { type: [soldMachineEntrySchema], required: true },
    grandTotal: { type: Number, default: 0 },
  },
  { timestamps: true }
);

soldMachineSchema.index({ "customerInfo.name": 1 });
soldMachineSchema.index({ "customerInfo.customerId": 1 });
soldMachineSchema.index({ "machines.machineName": 1 });
soldMachineSchema.index({ "machines.category": 1 });
soldMachineSchema.index({ createdAt: -1 });

module.exports = mongoose.model("SoldMachine", soldMachineSchema);
