const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    address:   { type: String, trim: true },
    latitude:  { type: Number, min: [-90,  "Latitude must be between -90 and 90"],  max: [90,  "Latitude must be between -90 and 90"] },
    longitude: { type: Number, min: [-180, "Longitude must be between -180 and 180"], max: [180, "Longitude must be between -180 and 180"] },
  },
  { _id: false }
);

const travelReimbursementSchema = new mongoose.Schema(
  {
    callId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceCall", required: true },
    engineerInfo: {
      _id:        { type: mongoose.Schema.Types.ObjectId, ref: "AdminUser", required: true },
      identityId: { type: String, trim: true },
      name:       { type: String, trim: true },
      phone:      { type: String, trim: true },
    },
    customerInfo: {
      name:    { type: String, trim: true },
      phone:   { type: String, trim: true },
      address: { type: String, trim: true },
    },
    travelDate:   { type: Date, required: true },
    purpose:      { type: String, enum: ["Service Call", "Go To Home", "Go To Office"], required: true },
    travelFrom:   { type: locationSchema, required: true },
    travelTo:     { type: locationSchema, required: true },
    travelledKm:  { type: Number, required: true, min: 0 },
    status:       { type: String, enum: ["Pending", "Paid"], default: "Pending" },
  },
  { timestamps: true }
);

travelReimbursementSchema.index({ callId: 1 });
travelReimbursementSchema.index({ "engineerInfo._id": 1 });
travelReimbursementSchema.index({ status: 1 });

module.exports = mongoose.model("TravelReimbursement", travelReimbursementSchema);
