const mongoose = require("mongoose");

const stockAdjustmentSchema = new mongoose.Schema(
  {
    machineId:             { type: mongoose.Schema.Types.ObjectId, ref: "Machine" },
    machineName:           { type: String, trim: true, default: "" },
    modelNumber:           { type: String, trim: true, default: "" },
    previousQuantity:      { type: Number, default: 0 },
    newQuantity:           { type: Number, default: 0 },
    difference:            { type: Number, default: 0 },
    type:                  {
      type: String,
      enum: ["item_added", "item_removed", "quantity_increased", "quantity_decreased", "unchanged", "price_changed", "serial_swapped"],
      default: "unchanged"
    },
    serialNumbersReturned: { type: [String], default: [] },
    serialNumbersDeducted: { type: [String], default: [] },
  },
  { _id: false }
);

const invoiceAuditLogSchema = new mongoose.Schema(
  {
    soldMachineId:             { type: mongoose.Schema.Types.ObjectId, ref: "SoldMachine", required: true },
    invoiceNumber:             { type: String, trim: true, default: "" },
    editedBy:                  { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", default: null },
    editedByName:              { type: String, trim: true, default: "Admin" },
    editDate:                  { type: Date, default: Date.now },
    reason:                    { type: String, trim: true, default: "Invoice Edited" },

    // Financial changes
    previousGrandTotalBase:    { type: Number, default: 0 },
    newGrandTotalBase:         { type: Number, default: 0 },
    previousGrandTotalWithGst: { type: Number, default: 0 },
    newGrandTotalWithGst:      { type: Number, default: 0 },
    totalDifference:           { type: Number, default: 0 },

    // Payment / Balance changes
    previousPaidAmount:        { type: Number, default: 0 },
    newPaidAmount:             { type: Number, default: 0 },
    previousRemainingAmount:   { type: Number, default: 0 },
    newRemainingAmount:        { type: Number, default: 0 },
    previousPaymentStatus:     { type: String, default: null },
    newPaymentStatus:          { type: String, default: null },
    excessPaymentAmount:       { type: Number, default: 0 },

    // Customer changes
    previousCustomerId:        { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
    newCustomerId:             { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
    previousCustomerName:      { type: String, trim: true, default: "" },
    newCustomerName:           { type: String, trim: true, default: "" },

    // Item & Stock changes
    stockAdjustments:          { type: [stockAdjustmentSchema], default: [] },
    previousItemsSnapshot:     { type: Array, default: [] },
    newItemsSnapshot:          { type: Array, default: [] },
  },
  { timestamps: true }
);

invoiceAuditLogSchema.index({ soldMachineId: 1, createdAt: -1 });
invoiceAuditLogSchema.index({ invoiceNumber: 1 });

module.exports = mongoose.model("InvoiceAuditLog", invoiceAuditLogSchema);
