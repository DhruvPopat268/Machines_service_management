const mongoose = require("mongoose");

const serialNumberEntrySchema = new mongoose.Schema(
  {
    serialNumber: { type: String, trim: true, required: true },
    status:       { type: String, enum: ["available", "sold"], default: "available" },
  },
  { _id: false }
);

const partCodeEntrySchema = new mongoose.Schema(
  {
    partCode: { type: String, trim: true, required: true },
    status:   { type: String, enum: ["available", "sold"], default: "available" },
  },
  { _id: false }
);

const purchasedMachineEntrySchema = new mongoose.Schema(
  {
    machineId:              { type: mongoose.Schema.Types.ObjectId, ref: "Machine", default: null },
    machineName:            { type: String, trim: true, required: true },
    modelNumber:            { type: String, trim: true, default: "" },
    categoryId:             { type: mongoose.Schema.Types.ObjectId, ref: "MachineCategory", default: null },
    category:               { type: String, trim: true, default: "" },
    divisionId:             { type: mongoose.Schema.Types.ObjectId, ref: "MachineDivision", default: null },
    division:               { type: String, trim: true, default: "" },
    quantity:               { type: Number, required: true },
    buyingPrice:            { type: Number, required: true },
    discountedBuyingPrice:  { type: Number, default: null },
    sellingPrice:           { type: Number, default: null },
    discountedSellingPrice: { type: Number, default: null },
    buyingTotal:            { type: Number, required: true },
    serialNumbers:          { type: [serialNumberEntrySchema], default: [] },
    partCodes:              { type: [partCodeEntrySchema], default: [] },
  },
  { _id: false }
);

const purchasedMachineSchema = new mongoose.Schema(
  {
    vendorInfo: {
      vendorId:    { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null },
      name:        { type: String, trim: true, default: "" },
      phone:       { type: String, trim: true, default: "" },
      email:       { type: String, trim: true, lowercase: true, default: "" },
      companyName: { type: String, trim: true, default: "" },
      gstNumber:   { type: String, trim: true, uppercase: true, default: "" },
    },
    machines:   { type: [purchasedMachineEntrySchema], required: true },
    grandTotal: { type: Number, default: 0 },
  },
  { timestamps: true }
);

purchasedMachineSchema.index({ "vendorInfo.name": 1 });
purchasedMachineSchema.index({ "vendorInfo.vendorId": 1 });
purchasedMachineSchema.index({ "machines.machineId": 1 });
purchasedMachineSchema.index({ "machines.machineName": 1 });
purchasedMachineSchema.index({ "machines.modelNumber": 1 });
purchasedMachineSchema.index({ "machines.categoryId": 1 });
purchasedMachineSchema.index({ "machines.divisionId": 1 });
purchasedMachineSchema.index({ "machines.serialNumbers.serialNumber": 1 });
purchasedMachineSchema.index({ "machines.serialNumbers.status": 1 });
purchasedMachineSchema.index({ "machines.partCodes.partCode": 1 });
purchasedMachineSchema.index({ "machines.partCodes.status": 1 });
purchasedMachineSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PurchasedMachine", purchasedMachineSchema);
