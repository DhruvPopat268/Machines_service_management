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

const serviceCallReadingCategorySchema = new mongoose.Schema(
  {
    pagesCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "PagesCategory", required: true },
    pagesCategory:   { type: String, trim: true, required: true },
    lastReading:     { type: Number, required: true },
    lastReadingDate: { type: String, trim: true, default: "" },
    currentReading:  { type: Number, required: true },
    diff:            { type: Number, required: true },
  },
  { _id: false }
);

const counterReadingCategorySchema = new mongoose.Schema(
  {
    pagesCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "PagesCategory", required: true },
    pagesCategory:   { type: String, trim: true, required: true },
    lastReading:     { type: Number, required: true },
    lastReadingDate: { type: String, trim: true, default: "" },
    currentReading:  { type: Number, required: true },
    costPerPage:     { type: Number, required: true },
    diff:            { type: Number, required: true },
    chargesInRupees: { type: Number, required: true },
  },
  { _id: false }
);

const counterReadingMinCopiesSchema = new mongoose.Schema(
  {
    minCopies: { type: Number, required: true },
    currentTotalCopies: { type: Number, required: true },
    diff:{ type: Number, required: true },
    costPerPage: { type: Number, required: true },
    chargesInRupees: { type: Number, required: true },
  }
)

const counterReadingSchema = new mongoose.Schema(
  {
    serialNumber: { type: String, trim: true, required: true },
    categories:   { type: [counterReadingCategorySchema], default: [] },
    minCopies:    { type: counterReadingMinCopiesSchema, default: null },
  },
  { _id: false }
);

const usedPartSchema = new mongoose.Schema(
  {
    partCode:               { type: String, trim: true, required: true },
    machineId:              { type: mongoose.Schema.Types.ObjectId, ref: "Machine", default: null },
    machineName:            { type: String, trim: true, default: "" },
    modelNumber:            { type: String, trim: true, default: "" },
    hsnCode:                { type: String, trim: true, default: "" },
    categoryId:             { type: mongoose.Schema.Types.ObjectId, default: null },
    category:               { type: String, trim: true, default: "" },
    sellingPrice:           { type: Number, default: 0 },
    discountedSellingPrice: { type: Number, default: 0 },
    total:                  { type: Number, default: 0 },
  },
  { _id: false }
);

const machineEntrySchema = new mongoose.Schema(
  {
    machineId:        { type: mongoose.Schema.Types.ObjectId, ref: "Machine", default: null },
    machineName:      { type: String, trim: true, required: true },
    modelNumber:      { type: String, trim: true, default: "" },
    hsnCode:          { type: String, trim: true, default: "" },
    serialNumber:     { type: String, trim: true, default: "" },
    divisionId:       { type: mongoose.Schema.Types.ObjectId, ref: "MachineDivision", default: null },
    division:         { type: String, trim: true, default: "" },
    categoryId:       { type: mongoose.Schema.Types.ObjectId, ref: "MachineCategory", default: null },
    category:         { type: String, trim: true, default: "" },
    contractType:     { type: contractTypeSnapshotSchema, required: true },
    issueDescription: { type: String, trim: true, required: true },
    problemTypeIds:   { type: [mongoose.Schema.Types.ObjectId], ref: "ProblemType", default: [] },
    problemTypes:     { type: [String], default: [] },
    images:           { type: [String], default: [] },
    serviceCharge:       { type: Number },
    partsCharge:         { type: Number },
    serviceCallReadings: { type: [serviceCallReadingCategorySchema], default: [] },
    usedParts:           { type: [usedPartSchema], default: [] },
    counterReadings:     { type: [counterReadingSchema], default: [] },
  },
  { _id: false }
);

const companyInfoSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    name:      { type: String, trim: true, required: true },
    address:   { type: String, trim: true, default: "" },
    phone:     { type: String, trim: true, default: "" },
    email:     { type: String, trim: true, lowercase: true, default: "" },
    gstNumber: { type: String, trim: true, uppercase: true, default: "" },
  },
  { _id: false }
);

const serviceCallSchema = new mongoose.Schema(
  {
    callId: { type: String, unique: true, required: true },
    customerInfo: {
      customerId:      { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
      customerUniqueId: { type: String, trim: true, default: "" },
      name:             { type: String, trim: true, required: true },
      phone:      { type: String, trim: true, required: true },
      email:      { type: String, trim: true, lowercase: true, required: true },
      address:    { type: String, trim: true, required: true },
      zone:       { type: String, trim: true, default: "" },
      gstNumber:  { type: String, trim: true, uppercase: true, default: "" },
      location: {
        address:   { type: String, trim: true },
        latitude:  { type: Number, min: [-90,  "Latitude must be between -90 and 90"],  max: [90,  "Latitude must be between -90 and 90"] },
        longitude: { type: Number, min: [-180, "Longitude must be between -180 and 180"], max: [180, "Longitude must be between -180 and 180"] },
      }
    },
    machines: {
      type: [machineEntrySchema],
      required: true,
      validate: {
        validator: function(v) { return v && v.length > 0; },
        message: "At least one machine is required"
      }
    },
    status: {
      type: String,
      enum: ["Open", "Assigned", "Travel Started", "Reached Location", "In Progress", "On Hold", "Completed", "Cancelled"],
      default: "Open"
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium"
    },
    engineerInfo: {
      _id:        { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      identityId: { type: String, trim: true },
      name:       { type: String, trim: true },
      phone:      { type: String, trim: true },
      email:      { type: String, trim: true },
      locations: [
        {
          address:   { type: String, trim: true },
          latitude:  { type: Number },
          longitude: { type: Number },
        }
      ],
    },
    dates: {
      created:         { type: Date, required: true, default: Date.now },
      assigned:        { type: Date },
      travelStarted:   { type: Date },
      reachedLocation: { type: Date },
      inProgress:      { type: Date },
      onHold:          { type: Date },
      completed:       { type: Date },
      cancelled:       { type: Date },
    },
    note:                { type: String, trim: true, default: "" },
    callType:            { type: String, enum: ["Service-Call", "Installation", "Dis-Installation", "Counter-Reading", "Others"], default: "Service-Call" },
    createdBy:           { type: String, enum: ["Admin", "Customer"], default: "Customer" },
    totalServiceCharges: { type: Number },
    totalPartsCharges:   { type: Number },
    totalCounterReadingCharges: { type: Number },
    totalCharges:        { type: Number },
    beforeWorkImages:    { type: [String] },
    afterWorkImages:     { type: [String] },
    customerSignature:   { type: String },
    onHoldReason:        { type: String, trim: true },
    engineerCompleteRemarks: { type: String, trim: true, default: "" },
    sendToEmail:         { type: Boolean, default: false },
    sendToWhatsapp:      { type: Boolean, default: false },
    companyInfo:         { type: companyInfoSchema, default: null },
    cgst:                { percent: { type: Number, default: 0 }, amount: { type: Number, default: 0 } },
    sgst:                { percent: { type: Number, default: 0 }, amount: { type: Number, default: 0 } },
    igst:                { percent: { type: Number, default: 0 }, amount: { type: Number, default: 0 } },
    invoiceGrandTotal:   { type: Number, default: null },
    invoiceUrl:          { type: String, default: null },
    invoiceNumber:       { type: String, default: null },
  },
  { timestamps: true }
);

serviceCallSchema.index({ "customerInfo.customerId": 1 });
serviceCallSchema.index({ "machines.machineId": 1 });
serviceCallSchema.index({ "machines.serialNumber": 1 });
serviceCallSchema.index({ "machines.counterReadings.serialNumber": 1 });
serviceCallSchema.index({ "machines.contractType.contractTypeId": 1 });
serviceCallSchema.index({ "engineerInfo._id": 1 });
serviceCallSchema.index({ status: 1 });
serviceCallSchema.index({ priority: 1 });
serviceCallSchema.index({ "dates.created": -1 });
serviceCallSchema.index({ createdAt: -1 });

module.exports = mongoose.model("ServiceCall", serviceCallSchema);
