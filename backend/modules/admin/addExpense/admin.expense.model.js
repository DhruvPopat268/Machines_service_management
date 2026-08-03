const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    category: {
      categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "ExpenseCategory", required: true },
      name:       { type: String, trim: true, required: true },
    },
    description: { type: String, trim: true, default: "" },
    date:        { type: Date, required: true },
    amount:      { type: Number, required: true },
    method:      { type: String, enum: ["Cash", "Online"], required: true },
  },
  { timestamps: true }
);

expenseSchema.index({ "category.categoryId": 1 });
expenseSchema.index({ date: -1 });
expenseSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Expense", expenseSchema);
