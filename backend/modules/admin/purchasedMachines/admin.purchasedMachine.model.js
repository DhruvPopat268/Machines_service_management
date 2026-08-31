const mongoose = require("mongoose");

const serialNumberEntrySchema = new mongoose.Schema(
  {
    serialNumber: { type: String, trim: true, required: true },
    status:       { type: String, enum: ["available", "sold"], default: "available" },
  },
  { _id: false }
);

const purchasedMachineEntrySchema = new mongoose.Schema(
  {
    machineId:              { type: mongoose.Schema.Types.ObjectId, ref: "Machine", default: null },
    machineName:            { type: String, trim: true, required: true },
    modelNumber:            { type: String, trim: true, default: "" },
    partCode:               { type: String, trim: true, default: "" },
    categoryId:             { type: mongoose.Schema.Types.ObjectId, ref: "MachineCategory", default: null },
    category:               { type: String, trim: true, default: "" },
    divisionId:             { type: mongoose.Schema.Types.ObjectId, ref: "MachineDivision", default: null },
    division:               { type: String, trim: true, default: "" },
    quantity:             { type: Number, required: true },
    buyingPriceWithGst:   { type: Number, required: true },
    buyingPriceBase:      { type: Number, required: true },
    gstAmountPerUnit:     { type: Number, required: true },
    buyingTotalWithGst:  { type: Number, required: true },
    buyingTotalBase:      { type: Number, required: true },
    gstAmountTotal:       { type: Number, required: true },
    serialNumbers:          { type: [serialNumberEntrySchema], default: [] },
    availableParts:         { type: Number, default: 0 },
    soldParts:              { type: Number, default: 0 },
  },
  { _id: false }
);

const purchasedMachineSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, trim: true, default: "" },
    vendorInfo: {
      vendorId:    { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null },
      name:        { type: String, trim: true, default: "" },
      phone:       { type: String, trim: true, default: "" },
      email:       { type: String, trim: true, lowercase: true, default: "" },
      companyName: { type: String, trim: true, default: "" },
      gstNumber:   { type: String, trim: true, uppercase: true, default: "" },
    },
    gstConfig: {
      cgst: { type: Number, default: 0 },
      sgst: { type: Number, default: 0 },
      igst: { type: Number, default: 0 },
      totalGst: { type: Number, default: 0 },
    },
    machines:        { type: [purchasedMachineEntrySchema], required: true },
    grandTotalWithGst: { type: Number, default: 0 },
    grandTotalBase:    { type: Number, default: 0 },
    grandTotalGstAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

purchasedMachineSchema.index({ invoiceNumber: 1 });
purchasedMachineSchema.index({ "vendorInfo.name": 1 });
purchasedMachineSchema.index({ "vendorInfo.vendorId": 1 });
purchasedMachineSchema.index({ "machines.machineId": 1 });
purchasedMachineSchema.index({ "machines.machineName": 1 });
purchasedMachineSchema.index({ "machines.modelNumber": 1 });
purchasedMachineSchema.index({ "machines.categoryId": 1 });
purchasedMachineSchema.index({ "machines.divisionId": 1 });
purchasedMachineSchema.index({ "machines.serialNumbers.serialNumber": 1 });
purchasedMachineSchema.index({ "machines.serialNumbers.status": 1 });
purchasedMachineSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PurchasedMachine", purchasedMachineSchema);
