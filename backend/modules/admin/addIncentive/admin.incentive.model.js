const mongoose = require("mongoose");

const incentiveSchema = new mongoose.Schema(
  {
    category: {
      categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "IncentiveCategory", required: true },
      name:       { type: String, trim: true, required: true },
    },
    description: { type: String, trim: true, default: "" },
    date:        { type: Date, required: true },
    amount:      { type: Number, required: true },
    method:      { type: String, enum: ["Cash", "Online"], required: true },
  },
  { timestamps: true }
);

incentiveSchema.index({ "category.categoryId": 1 });
incentiveSchema.index({ date: -1 });
incentiveSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Incentive", incentiveSchema);
