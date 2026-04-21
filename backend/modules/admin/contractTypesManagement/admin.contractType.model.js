const mongoose = require("mongoose");

const contractTypeSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, unique: true, trim: true },
    code:        { type: String, required: true, unique: true, trim: true, uppercase: true },
    description: { type: String, trim: true, default: "" },
    freeService: { type: Boolean, default: false },
    freeParts:   { type: Boolean, default: false },
    status:      { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ContractType", contractTypeSchema);
