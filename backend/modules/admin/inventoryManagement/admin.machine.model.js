const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema(
  {
    attribute:         { type: mongoose.Schema.Types.ObjectId, ref: "Attribute", required: true },
    value:             { type: String, trim: true, required: true },
    lowStockThreshold: { type: Number, default: -1 },
    currentStock:      { type: Number, default: 0, min: 0 },
    stockStatus:       { type: String, enum: ["In Stock", "Low Stock", "Out of Stock"], default: "Out of Stock" },
  },
  { _id: false }
);

const machineSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    modelNumber:  { type: String, trim: true, default: "" },
    serialNumber: { type: String, trim: true, default: "" },
    hsnCode:      { type: String, trim: true, default: "" },
    partCode:     { type: String, trim: true, default: "" },
    gstPercentage:{ type: Number, min: 0, max: 100, default: null },
    category:     { type: mongoose.Schema.Types.ObjectId, ref: "MachineCategory", required: true },
    division:     { type: mongoose.Schema.Types.ObjectId, ref: "MachineDivision", required: true },
    variants:     { type: [variantSchema], default: [] },
    images:       { type: [String], default: [], validate: { validator: (v) => v.length <= 5, message: "Maximum 5 images allowed" } },
    notes:        { type: String, trim: true, default: "" },
    status:       { type: String, enum: ["Active", "Inactive"], default: "Active" },
    source:       { type: String, enum: ["manual", "imported"], default: "manual" },
  },
  { timestamps: true }
);

machineSchema.index(
  { name: 1, category: 1, division: 1, modelNumber: 1 },
  { unique: true, sparse: false }
);

module.exports = mongoose.model("Machine", machineSchema);
