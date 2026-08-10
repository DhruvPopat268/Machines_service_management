const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Customer = require("../customerManagement/admin.customer.model");
const Machine = require("../inventoryManagement/admin.machine.model");
const Zone = require("../zoneManagement/admin.zone.model");
const MachineCategory = require("../machineCategoryManagement/admin.machineCategory.model");
const MachineDivision = require("../machineDivisionManagement/admin.machineDivision.model");
const Counter = require("../auth/counter.model");
const generateAvatar = require("../../../utils/generateAvatar");
const { sendWelcomeCredentials } = require("../../../utils/emailService");
const { validateFlowShortcut } = require("./admin.flowShortcut.validator");

const generatePassword = () => {
  const upper  = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower  = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const rand = (str) => str[Math.floor(Math.random() * str.length)];
  const chars = [rand(upper), rand(upper), rand(lower), rand(lower), rand(lower), rand(lower), "@", rand(digits), rand(digits), rand(digits), rand(digits)];
  const prefix = chars.slice(0, 6).sort(() => Math.random() - 0.5);
  return [...prefix, "@", ...chars.slice(7)].join("");
};

const caseInsensitiveRegex = (val) => ({
  $regex: `^${String(val).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
  $options: "i",
});

const createShortcutFlow = async (req, res) => {
  const error = validateFlowShortcut(req.body);
  if (error) return res.status(400).json({ success: false, message: error });

  const { customer: customerData, machine: machineData } = req.body;

  // ── Pre-transaction lookups & validations ─────────────────────────────────
  // These run before the transaction so we don't hold a session open during
  // slow operations like bcrypt, avatar generation, or zone/category lookups.

  const existingCustomer = await Customer.findOne({
    $or: [
      { phone: customerData.phone.trim() },
      { email: customerData.email.trim().toLowerCase() },
    ],
  });

  if (existingCustomer)
    return res.status(409).json({ success: false, message: "Customer with this phone or email already exists. Please use the normal flow for existing customers." });

  const zone = await Zone.findById(customerData.zone);
  if (!zone)
    return res.status(404).json({ success: false, message: "Zone not found" });

  const category = await MachineCategory.findById(machineData.category);
  if (!category)
    return res.status(404).json({ success: false, message: "Machine category not found" });

  const division = await MachineDivision.findById(machineData.division);
  if (!division)
    return res.status(404).json({ success: false, message: "Machine division not found" });

  const existingMachine = await Machine.findOne({
    name:        caseInsensitiveRegex(machineData.name),
    modelNumber: caseInsensitiveRegex(machineData.modelNumber),
    category:    machineData.category,
    division:    machineData.division,
  });

  let newCustomerData = null;
  let defaultPassword = null;

  defaultPassword = generatePassword();
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  const counter = await Counter.findOneAndUpdate(
    { _id: "customerId" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );

  let profilePhoto;
  try { profilePhoto = await generateAvatar(customerData.name.trim()); } catch (_) {}

  newCustomerData = {
    name:         customerData.name.trim(),
    phone:        customerData.phone.trim(),
    email:        customerData.email.trim().toLowerCase(),
    zone:         customerData.zone,
    customerId:   `CUS-${counter.seq}`,
    password:     hashedPassword,
    status:       "Active",
    source:       "manual",
    userLocation: {
      address: customerData.address.trim(),
      ...(customerData.latitude  != null && { latitude:  customerData.latitude }),
      ...(customerData.longitude != null && { longitude: customerData.longitude }),
    },
    ...(profilePhoto && { profilePhoto }),
  };

  // ── Transaction ───────────────────────────────────────────────────────────
  const session = await mongoose.startSession();
  session.startTransaction();

  let customer, machine;
  let machineCreated = false;

  try {
    // Step 1: Create customer
    [customer] = await Customer.create([newCustomerData], { session });

    // Step 2: Create machine if not exists
    if (existingMachine) {
      machine = existingMachine;
    } else {
      [machine] = await Machine.create([{
        name:              machineData.name.trim(),
        modelNumber:       machineData.modelNumber.trim(),
        hsnCode:           machineData.hsnCode?.trim() || "",
        category:          machineData.category,
        division:          machineData.division,
        lowStockThreshold: -1,
        currentStock:      0,
        stockStatus:       "Out of Stock",
        status:            "Active",
        source:            "manual",
      }], { session });
      machineCreated = true;
    }

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    if (err.code === 11000) {
      const key = Object.keys(err.keyPattern || {})[0];
      const msg = key === "phone" ? "Phone number already exists" : key === "email" ? "Email already exists" : "Duplicate entry";
      return res.status(409).json({ success: false, message: msg });
    }
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }

  // ── Post-commit side effects ───────────────────────────────────────────────
  if (defaultPassword)
    sendWelcomeCredentials(customer.name, customer.email, defaultPassword).catch(() => {});

  return res.status(200).json({
    success: true,
    message: `Customer created, Machine ${machineCreated ? "created" : "already exists"}`,
    data: {
      customer: {
        _id:        customer._id,
        customerId: customer.customerId,
        name:       customer.name,
        phone:      customer.phone,
        email:      customer.email,
        created: true,
      },
      machine: {
        _id:         machine._id,
        name:        machine.name,
        modelNumber: machine.modelNumber,
        hsnCode:     machine.hsnCode,
        category:    { _id: category._id, name: category.name },
        division:    { _id: division._id, name: division.name },
        created:     machineCreated,
      },
    },
  });
};

module.exports = { createShortcutFlow };
