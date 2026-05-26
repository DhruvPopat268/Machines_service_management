const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const AdminUser = require("../auth/admin.user.model");
const AdminUserSession = require("../auth/admin.user.session.model");
const validatePassword = require("../../../utils/validatePassword");
const { validateCreateSystemUser, validateUpdateSystemUser } = require("./admin.systemUser.validator");
const { sendAdminChangePasswordOtp, sendAdminResetPasswordOtp, sendSystemUserWelcome, sendSystemUserPasswordResetSuccess } = require("../../../utils/emailService");

const getAllSystemUsers = async (req, res) => {
  try {
    const { search, status, role, page = 1, limit = 10 } = req.query;

    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { name:  { $regex: escaped, $options: "i" } },
          { email: { $regex: escaped, $options: "i" } },
          { phone: { $regex: escaped, $options: "i" } },
        ];
      }
    }

    if (status && ["Active", "Inactive"].includes(status)) query.status = status;
    if (role && ["Admin", "Engineer", "Support"].includes(role)) query.role = role;

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [users, total] = await Promise.all([
      AdminUser.find(query)
        .select("-password -changePasswordOtp -changePasswordOtpExpires")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      AdminUser.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: users,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getSystemUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid user ID" });

    const user = await AdminUser.findById(id)
      .select("-password -changePasswordOtp -changePasswordOtpExpires");

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createSystemUser = async (req, res) => {
  try {
    const { name, email, phone, password, role, status } = req.body;

    const error = validateCreateSystemUser({ name, email, phone, password, role, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const existing = await AdminUser.findOne({
      $or: [
        { email: email.trim().toLowerCase() },
        ...(phone ? [{ phone: phone.trim() }] : []),
      ],
    });
    if (existing) {
      if (existing.email === email.trim().toLowerCase())
        return res.status(409).json({ success: false, message: "Email already exists" });
      return res.status(409).json({ success: false, message: "Phone number already exists" });
    }

    const user = await AdminUser.create({ name: name.trim(), email: email.trim().toLowerCase(), phone, password, role, status });

    const result = user.toObject();
    delete result.password;
    delete result.changePasswordOtp;
    delete result.changePasswordOtpExpires;

    // Send welcome email (non-blocking)
    sendSystemUserWelcome(name.trim(), email.trim().toLowerCase(), password, role).catch(() => {});

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error("Error creating system user:", err);
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Email already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateSystemUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid user ID" });

    const { name, email, phone, role, status } = req.body;

    const error = validateUpdateSystemUser({ name, email, phone, role, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const update = {};
    if (name   !== undefined) update.name   = name.trim();
    if (email  !== undefined) update.email  = email.trim().toLowerCase();
    if (phone  !== undefined) update.phone  = phone.trim();
    if (role   !== undefined) update.role   = role;
    if (status !== undefined) update.status = status;

    if (Object.keys(update).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    if (update.email || update.phone) {
      const orConditions = [];
      if (update.email) orConditions.push({ email: update.email });
      if (update.phone) orConditions.push({ phone: update.phone });
      const conflict = await AdminUser.findOne({ $or: orConditions, _id: { $ne: id } });
      if (conflict) {
        if (update.email && conflict.email === update.email)
          return res.status(409).json({ success: false, message: "Email already exists" });
        return res.status(409).json({ success: false, message: "Phone number already exists" });
      }
    }

    const existing = await AdminUser.findById(id).select("role");
    if (!existing) return res.status(404).json({ success: false, message: "User not found" });

    const user = await AdminUser.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .select("-password -changePasswordOtp -changePasswordOtpExpires");

    if (update.role && update.role !== existing.role)
      await AdminUserSession.deleteMany({ userId: id });

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Email already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const resetSystemUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid user ID" });

    const { otp, password } = req.body;

    if (!otp || !password)
      return res.status(400).json({ success: false, message: "OTP and password are required" });

    const passwordError = validatePassword(password);
    if (passwordError)
      return res.status(400).json({ success: false, message: passwordError });

    const user = await AdminUser.findById(id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (!user.changePasswordOtp || !user.changePasswordOtpExpires)
      return res.status(400).json({ success: false, message: "No reset request found. Please send OTP first" });

    if (user.changePasswordOtp !== otp.trim())
      return res.status(401).json({ success: false, message: "Invalid OTP" });

    if (new Date() > user.changePasswordOtpExpires)
      return res.status(401).json({ success: false, message: "OTP has expired" });

    const hashed = await bcrypt.hash(password, 10);
    await AdminUser.findByIdAndUpdate(id, {
      password: hashed,
      $unset: { changePasswordOtp: "", changePasswordOtpExpires: "" },
    });

    sendSystemUserPasswordResetSuccess(user.name, user.email, user.role).catch(() => {});

    res.status(200).json({ success: true, message: "Password reset successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const sendResetPasswordOtp = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid user ID" });

    const user = await AdminUser.findById(id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryMinutes = parseInt(process.env.ADMIN_CHANGE_PASSWORD_OTP_EXPIRY) || 10;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    await AdminUser.findByIdAndUpdate(id, {
      changePasswordOtp: otp,
      changePasswordOtpExpires: expiresAt,
    });

    const emailResult = await sendAdminResetPasswordOtp(user.name, user.email, otp, expiryMinutes);
    if (!emailResult.success)
      return res.status(500).json({ success: false, message: "Failed to send OTP email" });

    res.status(200).json({ success: true, message: "OTP sent to user's email" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteSystemUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid user ID" });

    const user = await AdminUser.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    await AdminUserSession.deleteMany({ userId: id });

    res.status(200).json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAllSystemUsers, getSystemUserById, createSystemUser, updateSystemUser, sendResetPasswordOtp, resetSystemUserPassword, deleteSystemUser };
