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

const pagesCategoryEntrySchema = new mongoose.Schema(
  {
    pagesCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "PagesCategory", required: true },
    pagesCategory:   { type: String, trim: true, required: true },
    costPerPage:     { type: Number, required: true },
  },
  { _id: false }
);

const serialNumberEntrySchema = new mongoose.Schema(
  {
    serialNumber:    { type: String, trim: true, required: true },
    contractType:    { type: contractTypeSnapshotSchema, default: null },
    pagesCategories: { type: [pagesCategoryEntrySchema], default: [] },
  },
  { _id: false }
);

const partCodeEntrySchema = new mongoose.Schema(
  {
    partCode:     { type: String, trim: true, required: true },
    contractType: { type: contractTypeSnapshotSchema, default: null },
  },
  { _id: false }
);

const soldMachineEntrySchema = new mongoose.Schema(
  {
    machineId:              { type: mongoose.Schema.Types.ObjectId, ref: "Machine", default: null },
    machineName:            { type: String, trim: true, required: true },
    modelNumber:            { type: String, trim: true, default: "" },
    hsnCode:                { type: String, trim: true, default: "" },
    categoryId:             { type: mongoose.Schema.Types.ObjectId, ref: "MachineCategory", default: null },
    category:               { type: String, trim: true, default: "" },
    divisionId:             { type: mongoose.Schema.Types.ObjectId, ref: "MachineDivision", default: null },
    division:               { type: String, trim: true, default: "" },
    quantity:               { type: Number, required: true },
    sellingPrice:           { type: Number, required: true },
    discountedSellingPrice: { type: Number, default: null },
    sellingTotal:           { type: Number, required: true },
    serialNumbers:          { type: [serialNumberEntrySchema], default: [] },
    partCodes:              { type: [partCodeEntrySchema], default: [] },
  },
  { _id: false }
);

const soldMachineSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, trim: true, default: "" },
    companyInfo: {
      companyId:         { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
      name:              { type: String, trim: true, default: "" },
      tagline:           { type: String, trim: true, default: "" },
      address:           { type: String, trim: true, default: "" },
      phone:             { type: String, trim: true, default: "" },
      email:             { type: String, trim: true, default: "" },
      gstNumber:         { type: String, trim: true, default: "" },
      bankAccountNumber: { type: String, trim: true, default: "" },
      bankName:          { type: String, trim: true, default: "" },
      ifscCode:          { type: String, trim: true, default: "" },
      bankBranch:        { type: String, trim: true, default: "" },
      qrCode:            { type: String, trim: true, default: "" },
    },
    basicTotal:       { type: Number, default: null },
    cgst:             { percent: { type: Number, default: 0 }, amount: { type: Number, default: 0 } },
    sgst:             { percent: { type: Number, default: 0 }, amount: { type: Number, default: 0 } },
    igst:             { percent: { type: Number, default: 0 }, amount: { type: Number, default: 0 } },
    invoiceGrandTotal: { type: Number, default: null },
    invoiceUrl:  { type: String, trim: true, default: "" },
    customerInfo: {
      customerId:       { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
      customerUniqueId: { type: String, trim: true, default: "" },
      name:             { type: String, trim: true, default: "" },
      phone:      { type: String, trim: true, default: "" },
      email:      { type: String, trim: true, lowercase: true, default: "" },
      address:    { type: String, trim: true, default: "" },
      zone:       { type: String, trim: true, default: "" },
      gstNumber:  { type: String, trim: true, uppercase: true, default: "" },
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
soldMachineSchema.index({ "machines.divisionId": 1 });
soldMachineSchema.index({ "machines.serialNumbers.serialNumber": 1 });
soldMachineSchema.index({ "machines.partCodes.partCode": 1 });
soldMachineSchema.index({ "machines.serialNumbers.contractType.contractTypeId": 1 });
soldMachineSchema.index({ "machines.partCodes.contractType.contractTypeId": 1 });
soldMachineSchema.index({ createdAt: -1 });

module.exports = mongoose.model("SoldMachine", soldMachineSchema);
