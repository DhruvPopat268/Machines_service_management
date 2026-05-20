const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Customer = require("../../admin/customerManagement/admin.customer.model");
const Zone = require("../../admin/zoneManagement/admin.zone.model");
const CustomerSession = require("./customer.session.model");
const { validateSignup, validateLogin, validatePassword } = require("./customer.validator");
const { validateGST } = require("../../admin/customerManagement/admin.customer.validator");
const { sendForgotPasswordEmail, sendPasswordResetSuccessEmail, sendChangeEmailOtp, sendEmailChangeSuccessNotification } = require("../../../utils/emailService");

const getActiveZones = async (req, res) => {
  try {
    const zones = await Zone.find({ status: "Active" }).select("name code description").sort({ name: 1 });
    res.status(200).json({ success: true, data: zones });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const signup = async (req, res) => {
  try {
    const { name, phone, email, password, address, zone } = req.body;
    const gstNumber = req.body.gstNumber ? String(req.body.gstNumber).trim().toUpperCase() : "";

    const { isValid, errors } = validateSignup({ name, phone, email, password, address, zone });
    if (!isValid)
      return res.status(400).json({ success: false, errors });

    if (gstNumber) {
      const gstError = validateGST(gstNumber);
      if (gstError)
        return res.status(400).json({ success: false, message: gstError });
      const gstExists = await Customer.findOne({ gstNumber });
      if (gstExists)
        return res.status(409).json({ success: false, message: "GST number already exists" });
    }

    const phoneExists = await Customer.findOne({ phone: phone.trim() });
    if (phoneExists)
      return res.status(409).json({ success: false, message: "Phone number already exists" });
    const emailExists = await Customer.findOne({ email: email.trim().toLowerCase() });
    if (emailExists)
      return res.status(409).json({ success: false, message: "Email already exists" });

    if (!mongoose.isValidObjectId(zone))
      return res.status(400).json({ success: false, message: "Invalid zone ID" });
    const zoneExists = await Zone.findById(zone);
    if (!zoneExists)
      return res.status(404).json({ success: false, message: "Zone not found" });
    if (zoneExists.status === "Inactive")
      return res.status(400).json({ success: false, message: "Selected zone is inactive" });

    const customer = await Customer.create({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      password: await bcrypt.hash(password.trim(), 10),
      address: address.trim(),
      zone,
      gstNumber,
      status: "Active",
      source: "manual",
    });

    const token = jwt.sign({ id: customer._id, email: customer.email }, process.env.CUSTOMER_JWT_SECRET, {
      expiresIn: process.env.CUSTOMER_JWT_EXPIRES_IN || "30d",
    });

    await CustomerSession.create({ customerId: customer._id, token });

    res.cookie("CustomerToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      domain: process.env.NODE_ENV === "production" ? process.env.COOKIE_DOMAIN : undefined,
      maxAge: parseInt(process.env.CUSTOMER_COOKIE_MAX_AGE) || 30 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({ success: true, message: "Signup successful" });
  } catch (err) {
    if (err.code === 11000) {
      const key = Object.keys(err.keyPattern || {})[0];
      const msg = key === "phone" ? "Phone number already exists" : key === "email" ? "Email already exists" : "GST number already exists";
      return res.status(409).json({ success: false, message: msg });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    const { isValid, errors } = validateLogin({ email, phone, password });
    if (!isValid)
      return res.status(400).json({ success: false, errors });

    const query = email ? { email: email.trim().toLowerCase() } : { phone: phone.trim() };
    const customer = await Customer.findOne(query);
    if (!customer || !(await customer.comparePassword(password.trim())))
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    if (customer.status === "Inactive")
      return res.status(403).json({ success: false, message: "Account is inactive" });

    const maxSessions = parseInt(process.env.CUSTOMER_MAX_SESSIONS) || 3;
    const sessionCount = await CustomerSession.countDocuments({ customerId: customer._id });
    if (sessionCount >= maxSessions) {
      const oldest = await CustomerSession.find({ customerId: customer._id }).sort({ createdAt: 1 }).limit(sessionCount - maxSessions + 1);
      await CustomerSession.deleteMany({ _id: { $in: oldest.map((s) => s._id) } });
    }

    const token = jwt.sign({ id: customer._id, email: customer.email }, process.env.CUSTOMER_JWT_SECRET, {
      expiresIn: process.env.CUSTOMER_JWT_EXPIRES_IN || "30d",
    });

    await CustomerSession.create({ customerId: customer._id, token });

    res.cookie("CustomerToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      domain: process.env.NODE_ENV === "production" ? process.env.COOKIE_DOMAIN : undefined,
      maxAge: parseInt(process.env.CUSTOMER_COOKIE_MAX_AGE) || 30 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({ success: true, message: "Login successful" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const logout = async (req, res) => {
  try {
    const token = req.cookies?.CustomerToken;
    if (token) await CustomerSession.deleteOne({ token });

    res.clearCookie("CustomerToken");
    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const sendResetOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim())
      return res.status(400).json({ success: false, message: "Email is required" });

    const customer = await Customer.findOne({ email: email.trim().toLowerCase() });
    if (!customer)
      return res.status(404).json({ success: false, message: "Customer not found" });

    if (customer.status === "Inactive")
      return res.status(403).json({ success: false, message: "Account is inactive" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryMinutes = parseInt(process.env.CUSTOMER_RESET_PASSWORD_EMAIL_OTP_EXPIRY) || 10;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    customer.resetPasswordOtp = otp;
    customer.resetPasswordOtpExpires = expiresAt;
    await customer.save();

    const emailResult = await sendForgotPasswordEmail(customer.name, customer.email, otp, expiryMinutes);
    if (!emailResult.success)
      return res.status(500).json({ success: false, message: "Failed to send email" });

    res.status(200).json({ success: true, message: "OTP sent to your email" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const verifyOtpResetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword)
      return res.status(400).json({ success: false, message: "Email, OTP, and new password are required" });

    const customer = await Customer.findOne({ email: email.trim().toLowerCase() });
    if (!customer)
      return res.status(404).json({ success: false, message: "Customer not found" });

    if (!customer.resetPasswordOtp || !customer.resetPasswordOtpExpires)
      return res.status(400).json({ success: false, message: "No OTP request found" });

    if (customer.resetPasswordOtp !== otp.trim())
      return res.status(401).json({ success: false, message: "Invalid OTP" });

    if (new Date() > customer.resetPasswordOtpExpires)
      return res.status(401).json({ success: false, message: "OTP has expired" });

    const passwordError = validatePassword(newPassword);
    if (passwordError)
      return res.status(400).json({ success: false, message: passwordError });

    customer.password = await bcrypt.hash(newPassword, 10);
    await customer.save();

    await Customer.updateOne(
      { _id: customer._id },
      { $unset: { resetPasswordOtp: "", resetPasswordOtpExpires: "" } }
    );

    await CustomerSession.deleteMany({ customerId: customer._id });

    await sendPasswordResetSuccessEmail(customer.name, customer.email);

    res.status(200).json({ success: true, message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { name, phone, address, zone, gstNumber } = req.body;

    const customer = await Customer.findById(customerId);
    if (!customer)
      return res.status(404).json({ success: false, message: "Customer not found" });

    if (customer.status === "Inactive")
      return res.status(403).json({ success: false, message: "Account is inactive" });

    const updates = {};

    if (name !== undefined) {
      if (!name.trim())
        return res.status(400).json({ success: false, message: "Name cannot be empty" });
      updates.name = name.trim();
    }

    if (phone !== undefined) {
      if (!/^[0-9]{10}$/.test(phone.trim()))
        return res.status(400).json({ success: false, message: "Phone must be exactly 10 digits" });
      const phoneExists = await Customer.findOne({ phone: phone.trim(), _id: { $ne: customerId } });
      if (phoneExists)
        return res.status(409).json({ success: false, message: "Phone number already exists" });
      updates.phone = phone.trim();
    }

    if (address !== undefined) {
      if (!address.trim())
        return res.status(400).json({ success: false, message: "Address cannot be empty" });
      updates.address = address.trim();
    }

    if (zone !== undefined) {
      if (!mongoose.isValidObjectId(zone))
        return res.status(400).json({ success: false, message: "Invalid zone ID" });
      const zoneExists = await Zone.findById(zone);
      if (!zoneExists)
        return res.status(404).json({ success: false, message: "Zone not found" });
      if (zoneExists.status === "Inactive")
        return res.status(400).json({ success: false, message: "Selected zone is inactive" });
      updates.zone = zone;
    }

    if (gstNumber !== undefined) {
      const gstNum = gstNumber ? String(gstNumber).trim().toUpperCase() : "";
      if (gstNum) {
        const gstError = validateGST(gstNum);
        if (gstError)
          return res.status(400).json({ success: false, message: gstError });
        const gstExists = await Customer.findOne({ gstNumber: gstNum, _id: { $ne: customerId } });
        if (gstExists)
          return res.status(409).json({ success: false, message: "GST number already exists" });
        updates.gstNumber = gstNum;
      } else {
        updates.gstNumber = "";
      }
    }

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ success: false, message: "No fields to update" });

    const updatedCustomer = await Customer.findByIdAndUpdate(customerId, updates, { new: true }).select("-password");

    res.status(200).json({ success: true, message: "Profile updated successfully", data: updatedCustomer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const sendChangeEmailOtpController = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { newEmail } = req.body;

    if (!newEmail || !newEmail.trim())
      return res.status(400).json({ success: false, message: "New email is required" });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim()))
      return res.status(400).json({ success: false, message: "Invalid email format" });

    const customer = await Customer.findById(customerId);
    if (!customer)
      return res.status(404).json({ success: false, message: "Customer not found" });

    if (customer.status === "Inactive")
      return res.status(403).json({ success: false, message: "Account is inactive" });

    const normalizedNewEmail = newEmail.trim().toLowerCase();

    if (customer.email === normalizedNewEmail)
      return res.status(400).json({ success: false, message: "New email is same as current email" });

    const emailExists = await Customer.findOne({ email: normalizedNewEmail });
    if (emailExists)
      return res.status(409).json({ success: false, message: "Email already exists" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryMinutes = parseInt(process.env.CUSTOMER_CHANGE_EMAIL_OTP_EXPIRY) || 10;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    customer.changeEmailOtp = otp;
    customer.changeEmailOtpExpires = expiresAt;
    customer.newEmail = normalizedNewEmail;
    await customer.save();

    const emailResult = await sendChangeEmailOtp(customer.name, normalizedNewEmail, otp, expiryMinutes, customer.email);
    if (!emailResult.success)
      return res.status(500).json({ success: false, message: "Failed to send email" });

    res.status(200).json({ success: true, message: "OTP sent to your new email" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const verifyOtpAndChangeEmail = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { otp } = req.body;

    if (!otp)
      return res.status(400).json({ success: false, message: "OTP is required" });

    const customer = await Customer.findById(customerId);
    if (!customer)
      return res.status(404).json({ success: false, message: "Customer not found" });

    if (customer.status === "Inactive")
      return res.status(403).json({ success: false, message: "Account is inactive" });

    if (!customer.changeEmailOtp || !customer.changeEmailOtpExpires || !customer.newEmail)
      return res.status(400).json({ success: false, message: "No email change request found" });

    if (customer.changeEmailOtp !== otp.trim())
      return res.status(401).json({ success: false, message: "Invalid OTP" });

    if (new Date() > customer.changeEmailOtpExpires)
      return res.status(401).json({ success: false, message: "OTP has expired" });

    const oldEmail = customer.email;
    const newEmail = customer.newEmail;

    customer.email = newEmail;
    await customer.save();

    await Customer.updateOne(
      { _id: customer._id },
      { $unset: { changeEmailOtp: "", changeEmailOtpExpires: "", newEmail: "" } }
    );

    await sendEmailChangeSuccessNotification(customer.name, oldEmail, newEmail);

    res.status(200).json({ success: true, message: "Email changed successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: "Current password and new password are required" });

    const customer = await Customer.findById(customerId);
    if (!customer)
      return res.status(404).json({ success: false, message: "Customer not found" });

    if (customer.status === "Inactive")
      return res.status(403).json({ success: false, message: "Account is inactive" });

    const isPasswordValid = await customer.comparePassword(currentPassword);
    if (!isPasswordValid)
      return res.status(400).json({ success: false, message: "Current password is incorrect" });

    if (currentPassword === newPassword)
      return res.status(400).json({ success: false, message: "New password must be different from current password" });

    const passwordError = validatePassword(newPassword);
    if (passwordError)
      return res.status(400).json({ success: false, message: passwordError });

    customer.password = await bcrypt.hash(newPassword, 10);
    await customer.save();

    await CustomerSession.deleteMany({ customerId: customer._id });

    await sendPasswordResetSuccessEmail(customer.name, customer.email);

    res.status(200).json({ success: true, message: "Password changed successfully. Please login with your new password" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getProfileDetails = async (req, res) => {
  try {
    const customerId = req.customer.id;

    const customer = await Customer.findById(customerId).select("-password").populate("zone", "name code description");
    if (!customer)
      return res.status(404).json({ success: false, message: "Customer not found" });

    if (customer.status === "Inactive")
      return res.status(403).json({ success: false, message: "Account is inactive" });

    res.status(200).json({ success: true, data: customer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getActiveZones, signup, login, logout, sendResetOtp, verifyOtpResetPassword, updateProfile, sendChangeEmailOtpController, verifyOtpAndChangeEmail, changePassword, getProfileDetails };
