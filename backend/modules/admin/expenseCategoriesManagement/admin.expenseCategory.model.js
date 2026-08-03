const mongoose = require("mongoose");

const expenseCategorySchema = new mongoose.Schema(
  {
    name:   { type: String, required: true, unique: true, trim: true },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ExpenseCategory", expenseCategorySchema);
