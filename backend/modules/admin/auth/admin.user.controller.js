const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const AdminUser = require("./admin.user.model");
const AdminUserSession = require("./admin.user.session.model");
const { validateCreateUser } = require("./admin.user.validator");
const { sendAdminChangePasswordOtp, sendAdminPasswordChangeSuccess } = require("../../../utils/emailService");

const getAllUsers = async (req, res) => {
  try {
    const users = await AdminUser.find().select("-password");
    res.status(200).json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createUser = async (req, res) => {
  try {
    const { isValid, errors } = validateCreateUser(req.body);
    if (!isValid)
      return res.status(400).json({ success: false, errors });

    const { email, password } = req.body;

    const existing = await AdminUser.findOne({ email });
    if (existing)
      return res.status(409).json({ success: false, message: "User already exists" });

    const user = await AdminUser.create({ email, password: await bcrypt.hash(password, 10) });
    const { password: _, ...data } = user.toObject();
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (status === undefined)
      return res.status(400).json({ success: false, message: "Status is required" });

    if (!["Active", "Inactive"].includes(status))
      return res.status(400).json({ success: false, message: "Status must be Active or Inactive" });

    const user = await AdminUser.findByIdAndUpdate(id, { status }, { new: true }).select("-password");

    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await AdminUser.findByIdAndDelete(id);
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    res.status(200).json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { isValid, errors } = validateCreateUser(req.body);
    if (!isValid)
      return res.status(400).json({ success: false, errors });

    const { email, password } = req.body;

    const user = await AdminUser.findOne({ email });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    if (user.status === "Inactive")
      return res.status(403).json({ success: false, message: "Account is inactive" });

    const maxSessions = parseInt(process.env.ADMIN_MAX_SESSIONS) || 1;

    const sessionCount = await AdminUserSession.countDocuments({ userId: user._id });
    if (sessionCount >= maxSessions) {
      const oldest = await AdminUserSession.find({ userId: user._id }).sort({ createdAt: 1 }).limit(sessionCount - maxSessions + 1);
      await AdminUserSession.deleteMany({ _id: { $in: oldest.map((s) => s._id) } });
    }

    const token = jwt.sign({ id: user._id, email: user.email }, process.env.ADMIN_JWT_SECRET, {
      expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || "7d",
    });

    await AdminUserSession.create({ userId: user._id, token });
    await AdminUser.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });

    res.cookie("AdminToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      domain: process.env.NODE_ENV === "production" ? process.env.COOKIE_DOMAIN : undefined,
      maxAge: parseInt(process.env.ADMIN_COOKIE_MAX_AGE) || 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({ success: true, message: "Login successful" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const logout = async (req, res) => {
  try {
    const token = req.cookies?.AdminToken;
    if (token) await AdminUserSession.deleteOne({ token });

    res.clearCookie("AdminToken");
    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const sendChangePasswordOtp = async (req, res) => {
  try {
    const userId = req.adminUser.id;

    const user = await AdminUser.findById(userId);
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    if (user.status === "Inactive")
      return res.status(403).json({ success: false, message: "Account is inactive" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryMinutes = parseInt(process.env.ADMIN_CHANGE_PASSWORD_OTP_EXPIRY) || 10;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    user.changePasswordOtp = otp;
    user.changePasswordOtpExpires = expiresAt;
    await user.save();

    const emailResult = await sendAdminChangePasswordOtp(user.email, otp, expiryMinutes);
    if (!emailResult.success)
      return res.status(500).json({ success: false, message: "Failed to send email" });

    res.status(200).json({ success: true, message: "OTP sent to your email" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const verifyOtpAndChangePassword = async (req, res) => {
  try {
    const userId = req.adminUser.id;
    const { otp, newPassword } = req.body;

    if (!otp || !newPassword)
      return res.status(400).json({ success: false, message: "OTP and new password are required" });

    if (newPassword.length < 8)
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });

    const user = await AdminUser.findById(userId);
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    if (user.status === "Inactive")
      return res.status(403).json({ success: false, message: "Account is inactive" });

    if (!user.changePasswordOtp || !user.changePasswordOtpExpires)
      return res.status(400).json({ success: false, message: "No password change request found" });

    if (user.changePasswordOtp !== otp.trim())
      return res.status(401).json({ success: false, message: "Invalid OTP" });

    if (new Date() > user.changePasswordOtpExpires)
      return res.status(401).json({ success: false, message: "OTP has expired" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    await AdminUser.updateOne(
      { _id: user._id },
      { $unset: { changePasswordOtp: "", changePasswordOtpExpires: "" } }
    );

    await AdminUserSession.deleteMany({ userId: user._id });

    await sendAdminPasswordChangeSuccess(user.email);

    res.status(200).json({ success: true, message: "Password changed successfully. Please login with your new password" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAllUsers, createUser, updateUser, deleteUser, login, logout, sendChangePasswordOtp, verifyOtpAndChangePassword };
