const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema(
  {
    name:      { type: String, trim: true, required: true },
    value:     { type: String, trim: true, required: true },
    qtyChange: { type: String, trim: true, required: true },
  },
  { _id: false }
);

const inventoryLogSchema = new mongoose.Schema(
  {
    action: { type: String, enum: ["purchased", "sold"], required: true },

    vendorInfo: {
      vendorId:    { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null },
      name:        { type: String, trim: true, default: "" },
      phone:       { type: String, trim: true, default: "" },
      email:       { type: String, trim: true, lowercase: true, default: "" },
      companyName: { type: String, trim: true, default: "" },
      gstNumber:   { type: String, trim: true, uppercase: true, default: "" },
    },

    customerInfo: {
      customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
      name:       { type: String, trim: true, default: "" },
      phone:      { type: String, trim: true, default: "" },
      email:      { type: String, trim: true, lowercase: true, default: "" },
      address:    { type: String, trim: true, default: "" },
      zone:       { type: String, trim: true, default: "" },
      gstNumber:  { type: String, trim: true, uppercase: true, default: "" },
    },

    machineName: { type: String, trim: true, required: true },
    modelNumber: { type: String, trim: true, default: "" },
    category:    { type: String, trim: true, default: "" },
    division:    { type: String, trim: true, default: "" },
    variants: { type: [variantSchema], required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("InventoryLog", inventoryLogSchema);
