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

const usedPartSchema = new mongoose.Schema(
  {
    partCode:    { type: String, trim: true, required: true },
    partName:    { type: String, trim: true, default: "" },
    machineId:   { type: mongoose.Schema.Types.ObjectId, ref: "Machine", default: null },
    machineName: { type: String, trim: true, default: "" },
    modelNumber: { type: String, trim: true, default: "" },
    quantity:    { type: Number, required: true },
    unitPrice:   { type: Number, default: 0 },
    total:       { type: Number, default: 0 },
  },
  { _id: false }
);

const machineVariantSchema = new mongoose.Schema(
  {
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    machineId: { type: mongoose.Schema.Types.ObjectId, ref: "Machine", default: null },
    machineName: { type: String, trim: true, required: true },
    modelNumber: { type: String, trim: true, default: "" },
    serialNumber: { type: String, trim: true, default: "" },
    divisionId: { type: mongoose.Schema.Types.ObjectId, ref: "MachineDivision", default: null },
    division: { type: String, trim: true, default: "" },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "MachineCategory", default: null },
    category: { type: String, trim: true, default: "" },
    attributeName: { type: String, trim: true, default: "" },
    attributeValue: { type: String, trim: true, default: "" },
    contractType: { type: contractTypeSnapshotSchema, required: true },
    issueDescription: { type: String, trim: true, required: true },
    problemTypeIds: { type: [mongoose.Schema.Types.ObjectId], ref: "ProblemType", default: [] },
    problemTypes: { type: [String], default: [] },
    images: { type: [String], default: [] },
    serviceCharge: { type: Number },
    partsCharge:   { type: Number },
    usedParts:     { type: [usedPartSchema], default: [] },
  },
  { _id: false }
);

const serviceCallSchema = new mongoose.Schema(
  {
    callId: { type: String, unique: true, required: true },
    customerInfo: {
      customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
      name: { type: String, trim: true, required: true },
      phone: { type: String, trim: true, required: true },
      email: { type: String, trim: true, lowercase: true, required: true },
      address: { type: String, trim: true, required: true },
      zone: { type: String, trim: true, default: "" },
      gstNumber: { type: String, trim: true, uppercase: true, default: "" },
      location: {
        address:   { type: String, trim: true },
        latitude:  { type: Number, min: [-90,  "Latitude must be between -90 and 90"],  max: [90,  "Latitude must be between -90 and 90"] },
        longitude: { type: Number, min: [-180, "Longitude must be between -180 and 180"], max: [180, "Longitude must be between -180 and 180"] },
      }
    },
    machines: {
      type: [machineVariantSchema],
      required: true,
      validate: {
        validator: function(v) {
          return v && v.length > 0;
        },
        message: "At least one machine variant is required"
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
    note: { type: String, trim: true, default: "" },
    callType: { type: String, enum: ["Service-Call", "Installation", "Deinstallation", "Counter-Reading", "Others"], default: "Service-Call" },
    createdBy: { type: String, enum: ["Admin", "Customer"], default: "Customer" },
    totalServiceCharges: { type: Number },
    totalPartsCharges:   { type: Number },
    beforeWorkImages: { type: [String] },
    afterWorkImages:  { type: [String] },
    customerSignature: { type: String },
    onHoldReason: { type: String, trim: true },
    sendToEmail:      { type: Boolean, default: false },
    sendToWhatsapp:   { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes for efficient querying
serviceCallSchema.index({ "customerInfo.customerId": 1 });
serviceCallSchema.index({ "machines.variantId": 1 });
serviceCallSchema.index({ "machines.machineId": 1 });
serviceCallSchema.index({ "machines.contractType.contractTypeId": 1 });
serviceCallSchema.index({ "engineerInfo._id": 1 });
serviceCallSchema.index({ status: 1 });
serviceCallSchema.index({ priority: 1 });
serviceCallSchema.index({ "dates.created": -1 });
serviceCallSchema.index({ createdAt: -1 });

module.exports = mongoose.model("ServiceCall", serviceCallSchema);
