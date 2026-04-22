const mongoose = require("mongoose");

const attributeSchema = new mongoose.Schema(
  {
    name:            { type: String, required: true, trim: true },
    machineCategory: { type: mongoose.Schema.Types.ObjectId, ref: "MachineCategory", required: true },
    description:     { type: String, trim: true, default: "" },
    status:          { type: String, enum: ["Active", "Inactive"], default: "Active" },
    source:          { type: String, enum: ["manual", "imported"], default: "manual" },
  },
  { timestamps: true }
);

// Same name allowed across different categories, but not within the same category
attributeSchema.index({ name: 1, machineCategory: 1 }, { unique: true });

module.exports = mongoose.model("Attribute", attributeSchema);
