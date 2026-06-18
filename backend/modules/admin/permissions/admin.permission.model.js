const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema(
  {
    name:   { type: String, required: true, unique: true, trim: true },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Permission", permissionSchema);
