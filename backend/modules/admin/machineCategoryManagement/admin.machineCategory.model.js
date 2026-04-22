const mongoose = require("mongoose");

const machineCategorySchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true, default: "" },
    status:      { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MachineCategory", machineCategorySchema);
