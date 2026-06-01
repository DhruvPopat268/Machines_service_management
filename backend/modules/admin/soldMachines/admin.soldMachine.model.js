const mongoose = require("mongoose");

const contractTypeSnapshotSchema = new mongoose.Schema(
  {
    contractTypeId: { type: mongoose.Schema.Types.ObjectId, ref: "ContractType", required: true },
    name:           { type: String, trim: true, required: true },
    code:           { type: String, trim: true, uppercase: true, required: true },
    freeService:    { type: Boolean, default: false },
    freeParts:      { type: Boolean, default: false },
    validFrom:      { type: Date, required: true },
    validTo:        { type: Date, required: true },
  },
  { _id: false }
);

const variantSchema = new mongoose.Schema(
  {
    attribute:          { type: mongoose.Schema.Types.ObjectId, ref: "Attribute", required: true },
    name:               { type: String, trim: true, required: true },
    value:              { type: String, trim: true, required: true },
    quantity:           { type: Number, required: true },
    serialNumbers:      { type: [String], default: [] },
    price:              { type: Number, required: true },
    discountedPrice:    { type: Number, default: null },
    total:              { type: Number, required: true },
    contractType:       { type: contractTypeSnapshotSchema, required: true },
    deductedFromInventory: { type: Boolean, default: false },
  }
);

const soldMachineEntrySchema = new mongoose.Schema(
  {
    machineId:       { type: mongoose.Schema.Types.ObjectId, ref: "Machine", default: null },
    machineName:     { type: String, trim: true, required: true },
    modelNumber:     { type: String, trim: true, default: "" },
    categoryId:      { type: mongoose.Schema.Types.ObjectId, ref: "MachineCategory", default: null },
    category:        { type: String, trim: true, default: "" },
    divisionId:      { type: mongoose.Schema.Types.ObjectId, ref: "MachineDivision", default: null },
    division:        { type: String, trim: true, default: "" },
    variants:        { type: [variantSchema], required: true },
    machineTotalSold:{ type: Number, default: 0 },
  },
  { _id: false }
);

const soldMachineSchema = new mongoose.Schema(
  {
    customerInfo: {
      customerId:  { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
      name:        { type: String, trim: true, default: "" },
      phone:       { type: String, trim: true, default: "" },
      email:       { type: String, trim: true, lowercase: true, default: "" },
      address:     { type: String, trim: true, default: "" },
      zone:        { type: String, trim: true, default: "" },
      gstNumber:   { type: String, trim: true, uppercase: true, default: "" },
    },
    machines:   { type: [soldMachineEntrySchema], required: true },
    grandTotal: { type: Number, default: 0 },
  },
  { timestamps: true }
);

soldMachineSchema.index({ "customerInfo.name": 1 });
soldMachineSchema.index({ "customerInfo.customerId": 1 });
soldMachineSchema.index({ "machines.machineId": 1 });
soldMachineSchema.index({ "machines.machineName": 1 });
soldMachineSchema.index({ "machines.modelNumber": 1 });
soldMachineSchema.index({ "machines.categoryId": 1 });
soldMachineSchema.index({ "machines.category": 1 });
soldMachineSchema.index({ "machines.divisionId": 1 });
soldMachineSchema.index({ "machines.variants.contractType.contractTypeId": 1 });
soldMachineSchema.index({ "machines.variants.contractType.name": 1 });
soldMachineSchema.index({ "machines.variants.validFrom": 1 });
soldMachineSchema.index({ "machines.variants.validTo": 1 });
soldMachineSchema.index({ "machines.variants.serialNumbers": 1 });
soldMachineSchema.index({ createdAt: -1 });

module.exports = mongoose.model("SoldMachine", soldMachineSchema);
