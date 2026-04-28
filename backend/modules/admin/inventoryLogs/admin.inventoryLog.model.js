const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema(
  {
    name:      { type: String, trim: true, required: true },
    value:     { type: String, trim: true, required: true },
    qtyChange: { type: String, trim: true, required: true },
  },
  { _id: false }
);

const machineEntrySchema = new mongoose.Schema(
  {
    machineName: { type: String, trim: true, required: true },
    modelNumber: { type: String, trim: true, default: "" },
    category:    { type: String, trim: true, default: "" },
    division:    { type: String, trim: true, default: "" },
    variants:    { type: [variantSchema], required: true },
  },
  { _id: false }
);

const inventoryLogSchema = new mongoose.Schema(
  {
    action: { type: String, enum: ["purchased", "sold"], required: true },

    vendorInfo: {
      vendorId:    { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
      name:        { type: String, trim: true },
      phone:       { type: String, trim: true },
      email:       { type: String, trim: true, lowercase: true },
      companyName: { type: String, trim: true },
      gstNumber:   { type: String, trim: true, uppercase: true },
    },

    customerInfo: {
      customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
      name:       { type: String, trim: true },
      phone:      { type: String, trim: true },
      email:      { type: String, trim: true, lowercase: true },
      address:    { type: String, trim: true },
      zone:       { type: String, trim: true },
      gstNumber:  { type: String, trim: true, uppercase: true },
    },

    machines: { type: [machineEntrySchema], required: true },
  },
  { timestamps: true }
);

inventoryLogSchema.index({ action: 1 });
inventoryLogSchema.index({ "vendorInfo.vendorId": 1 });
inventoryLogSchema.index({ "customerInfo.customerId": 1 });
inventoryLogSchema.index({ "machines.machineName": 1 });
inventoryLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("InventoryLog", inventoryLogSchema);
