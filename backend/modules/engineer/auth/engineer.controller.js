const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs/promises");
const sharp = require("sharp");
const bcrypt = require("bcrypt");
const AdminUser = require("../../admin/auth/admin.user.model");
const EngineerSession = require("./engineer.session.model");
const { validateUpdateProfile, validatePassword } = require("./engineer.validator");
const { sendEngineerForgotPasswordOtp, sendEngineerPasswordResetSuccess } = require("../../../utils/emailService");

const IMAGES_DIR = process.env.NODE_ENV === "production"
  ? "/app/cloud/images"
  : path.join(__dirname, "../../../cloud/images");

const uploadProfilePhoto = async (fileBuffer) => {
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  const filename = `profile_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`;
  await sharp(fileBuffer)
    .resize({ width: 400, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(path.join(IMAGES_DIR, filename));
  return `${process.env.BACKEND_URL}/app/cloud/images/${filename}`;
};

const deleteProfilePhoto = async (url) => {
  try {
    const filename = url.split("/app/cloud/images/")[1];
    if (!filename) return;
    await fs.unlink(path.join(IMAGES_DIR, filename));
  } catch (_) {}
};

const login = async (req, res) => {
  try {
    const { email, phone, password, onesignalPlayerId } = req.body;

    if ((!email && !phone) || !password)
      return res.status(400).json({ success: false, message: "Email or phone and password are required" });

    const query = email
      ? { email: email.trim().toLowerCase() }
      : { phone: phone.trim() };

    const engineer = await AdminUser.findOne(query);
    if (!engineer || !(await engineer.comparePassword(password)))
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    if (engineer.role !== "Engineer")
      return res.status(403).json({ success: false, message: "Access denied" });

    if (engineer.status === "Inactive")
      return res.status(403).json({ success: false, message: "Account is inactive" });

    const maxSessions = parseInt(process.env.ENGINEER_MAX_SESSIONS) || 3;
    const sessionCount = await EngineerSession.countDocuments({ engineerId: engineer._id });
    if (sessionCount >= maxSessions) {
      const oldest = await EngineerSession.find({ engineerId: engineer._id }).sort({ createdAt: 1 }).limit(sessionCount - maxSessions + 1);
      await EngineerSession.deleteMany({ _id: { $in: oldest.map((s) => s._id) } });
    }

    const token = jwt.sign({ id: engineer._id, email: engineer.email }, process.env.ENGINEER_JWT_SECRET, {
      expiresIn: process.env.ENGINEER_JWT_EXPIRES_IN || "30d",
    });

    await EngineerSession.create({ engineerId: engineer._id, token });
    await AdminUser.findByIdAndUpdate(engineer._id, {
      lastLoginAt: new Date(),
      ...(onesignalPlayerId?.trim() && { onesignalPlayerId: onesignalPlayerId.trim() }),
    });

    res.status(200).json({ success: true, message: "Login successful", token });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];
    if (token) await EngineerSession.deleteOne({ token });

    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getProfile = async (req, res) => {
  try {
    const engineer = await AdminUser.findById(req.engineer.id)
      .select("name phone email role engineerId engineerLocation profilePhoto _id");
    if (!engineer) return res.status(404).json({ success: false, message: "Engineer not found" });

    res.status(200).json({ success: true, data: engineer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    

    const error = validateUpdateProfile({ name, phone, email });
    if (error) return res.status(400).json({ success: false, message: error });

    const update = {};
    if (name              !== undefined) update.name             = name.trim();
    if (phone             !== undefined) update.phone            = phone.trim();
    if (email             !== undefined) update.email            = email.trim().toLowerCase();
    

    if (req.file) {
      try {
        update.profilePhoto = await uploadProfilePhoto(req.file.buffer);
      } catch (imgErr) {
        return res.status(400).json({ success: false, message: imgErr.message });
      }
    }

    if (Object.keys(update).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    if (update.phone || update.email) {
      const orConditions = [];
      if (update.phone) orConditions.push({ phone: update.phone });
      if (update.email) orConditions.push({ email: update.email });
      const conflict = await AdminUser.findOne({ $or: orConditions, _id: { $ne: req.engineer.id } });
      if (conflict) {
        if (update.email && conflict.email === update.email)
          return res.status(409).json({ success: false, message: "Email already exists" });
        return res.status(409).json({ success: false, message: "Phone number already exists" });
      }
    }

    const existing = await AdminUser.findById(req.engineer.id).select("profilePhoto");
    if (!existing) return res.status(404).json({ success: false, message: "Engineer not found" });

    const engineer = await AdminUser.findByIdAndUpdate(req.engineer.id, update, { new: true, runValidators: true })
      .select("name phone email role  profilePhoto engineerId");

    if (update.profilePhoto && existing.profilePhoto)
      await deleteProfilePhoto(existing.profilePhoto);

    res.status(200).json({ success: true, data: engineer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const sendForgotPasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim())
      return res.status(400).json({ success: false, message: "Email is required" });

    const engineer = await AdminUser.findOne({ email: email.trim().toLowerCase(), role: "Engineer" });
    if (!engineer) return res.status(404).json({ success: false, message: "Engineer not found" });

    if (engineer.status === "Inactive")
      return res.status(403).json({ success: false, message: "Account is inactive" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryMinutes = parseInt(process.env.ENGINEER_RESET_PASSWORD_OTP_EXPIRY) || 10;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    await AdminUser.findByIdAndUpdate(engineer._id, {
      changePasswordOtp: otp,
      changePasswordOtpExpires: expiresAt,
    });

    const emailResult = await sendEngineerForgotPasswordOtp(engineer.name, engineer.email, otp, expiryMinutes);
    if (!emailResult.success)
      return res.status(500).json({ success: false, message: "Failed to send OTP email" });

    res.status(200).json({ success: true, message: "OTP sent to your email" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const verifyOtpResetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword)
      return res.status(400).json({ success: false, message: "Email, OTP and new password are required" });

    const engineer = await AdminUser.findOne({ email: email.trim().toLowerCase(), role: "Engineer" });
    if (!engineer) return res.status(404).json({ success: false, message: "Engineer not found" });

    if (!engineer.changePasswordOtp || !engineer.changePasswordOtpExpires)
      return res.status(400).json({ success: false, message: "No OTP request found. Please request an OTP first" });

    if (engineer.changePasswordOtp !== otp.trim())
      return res.status(401).json({ success: false, message: "Invalid OTP" });

    if (new Date() > engineer.changePasswordOtpExpires)
      return res.status(401).json({ success: false, message: "OTP has expired" });

    const passwordError = validatePassword(newPassword);
    if (passwordError) return res.status(400).json({ success: false, message: passwordError });

    const hashed = await bcrypt.hash(newPassword, 10);
    await AdminUser.findByIdAndUpdate(engineer._id, {
      password: hashed,
      $unset: { changePasswordOtp: "", changePasswordOtpExpires: "" },
    });

    await EngineerSession.deleteMany({ engineerId: engineer._id });

    sendEngineerPasswordResetSuccess(engineer.name, engineer.email).catch(() => {});

    res.status(200).json({ success: true, message: "Password reset successfully. Please login with your new password" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: "Current password and new password are required" });

    const engineer = await AdminUser.findById(req.engineer.id);
    if (!engineer) return res.status(404).json({ success: false, message: "Engineer not found" });

    const isMatch = await engineer.comparePassword(currentPassword);
    if (!isMatch)
      return res.status(400).json({ success: false, message: "Current password is incorrect" });

    if (currentPassword === newPassword)
      return res.status(400).json({ success: false, message: "New password must be different from current password" });

    const passwordError = validatePassword(newPassword);
    if (passwordError) return res.status(400).json({ success: false, message: passwordError });

    engineer.password = newPassword;
    await engineer.save();

    await EngineerSession.deleteMany({ engineerId: engineer._id });

    sendEngineerPasswordResetSuccess(engineer.name, engineer.email).catch(() => {});

    res.status(200).json({ success: true, message: "Password changed successfully. Please login with your new password" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { login, logout, getProfile, updateProfile, sendForgotPasswordOtp, verifyOtpResetPassword, changePassword };
