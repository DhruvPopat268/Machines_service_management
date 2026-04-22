const mongoose = require("mongoose");

const machineDivisionSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true, default: "" },
    status:      { type: String, enum: ["Active", "Inactive"], default: "Active" },
    source:      { type: String, enum: ["manual", "imported"], default: "manual" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MachineDivision", machineDivisionSchema);
