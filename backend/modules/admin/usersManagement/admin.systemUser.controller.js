const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs/promises");
const sharp = require("sharp");
const bcrypt = require("bcrypt");
const AdminUser = require("../auth/admin.user.model");
const AdminUserSession = require("../auth/admin.user.session.model");
const validatePassword = require("../../../utils/validatePassword");
const { validateCreateSystemUser, validateUpdateSystemUser } = require("./admin.systemUser.validator");
const { sendAdminChangePasswordOtp, sendAdminResetPasswordOtp, sendSystemUserWelcome, sendSystemUserPasswordResetSuccess } = require("../../../utils/emailService");
const generateAvatar = require("../../../utils/generateAvatar");

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

const Counter = require("../auth/counter.model");

const generateEngineerId = async (name) => {
  const parts = name.trim().split(/\s+/);
  const first  = (parts[0]?.[0] || "").toUpperCase();
  const second = (parts[1]?.[0] || "").toUpperCase();
  const initials = first + second;
  const counter = await Counter.findOneAndUpdate(
    { _id: "engineerId" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return `${initials}-${counter.seq}`;
};

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
    const user = await AdminUser.findById(req.adminUser.id)
      .select("-password -changePasswordOtp -changePasswordOtpExpires");

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const computeExperienceYears = (dateOfJoining) => {
  if (!dateOfJoining) return null;
  const ms = Date.now() - new Date(dateOfJoining).getTime();
  return parseFloat((ms / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1));
};

const createSystemUser = async (req, res) => {
  try {
    const { name, email, phone, password, role, status, dateOfJoining } = req.body;

    let engineerLocation;
    if (req.body.engineerLocation) {
      try {
        engineerLocation = typeof req.body.engineerLocation === "string"
          ? JSON.parse(req.body.engineerLocation)
          : req.body.engineerLocation;
      } catch (_) {}
    }

    const error = validateCreateSystemUser({ name, email, phone, password, role, status });
    if (error) return res.status(400).json({ success: false, message: error });

    if (role === "Engineer" && !dateOfJoining)
      return res.status(400).json({ success: false, message: "Date of joining is required for Engineers" });

    if (role === "Admin") {
      const adminExists = await AdminUser.exists({ role: "Admin" });
      if (adminExists)
        return res.status(409).json({ success: false, message: "An Admin user already exists" });
    }

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

    let profilePhoto;
    if (req.file) {
      try {
        profilePhoto = await uploadProfilePhoto(req.file.buffer);
      } catch (imgErr) {
        return res.status(400).json({ success: false, message: imgErr.message });
      }
    } else if (role === "Engineer") {
      try { profilePhoto = await generateAvatar(name.trim()); } catch (_) {}
    }

    let engineerId;
    if (role === "Engineer") engineerId = await generateEngineerId(name);

    let user;
    try {
      user = await AdminUser.create({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password,
        role,
        status,
        ...(engineerLocation         && { engineerLocation }),
        ...(profilePhoto             && { profilePhoto }),
        ...(engineerId               && { engineerId }),
        ...(role === "Engineer" && dateOfJoining && { dateOfJoining: new Date(dateOfJoining) }),
      });
    } catch (dbErr) {
      if (profilePhoto) await deleteProfilePhoto(profilePhoto);
      if (dbErr.code === 11000)
        return res.status(409).json({ success: false, message: "Email already exists" });
      return res.status(500).json({ success: false, message: dbErr.message });
    }

    const result = user.toObject();
    delete result.password;
    delete result.changePasswordOtp;
    delete result.changePasswordOtpExpires;

    sendSystemUserWelcome(name.trim(), email.trim().toLowerCase(), password, role).catch(() => {});

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateSystemUser = async (req, res) => {
  try {
    const id = req.params.id || req.adminUser.id;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid user ID" });

    const { name, email, phone, role, status, dateOfJoining } = req.body;

    let engineerLocation;
    let officeLocation;
    if (req.body.officeLocation) {
      try {
        officeLocation = typeof req.body.officeLocation === "string"
          ? JSON.parse(req.body.officeLocation)
          : req.body.officeLocation;
      } catch (_) {}
    }

    if (req.body.engineerLocation) {
      try {
        engineerLocation = typeof req.body.engineerLocation === "string"
          ? JSON.parse(req.body.engineerLocation)
          : req.body.engineerLocation;
      } catch (_) {}
    }

    const error = validateUpdateSystemUser({ name, email, phone, role, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const update = {};
    if (name    !== undefined) update.name    = name.trim();
    if (email   !== undefined) update.email   = email.trim().toLowerCase();
    if (phone   !== undefined) update.phone   = phone.trim();
    if (role    !== undefined) update.role    = role;
    if (status  !== undefined) update.status  = status;
    if (engineerLocation !== undefined) update.engineerLocation = engineerLocation;
    if (officeLocation   !== undefined) update.officeLocation   = officeLocation;
    if (dateOfJoining    !== undefined) {
      update.dateOfJoining   = new Date(dateOfJoining);
    }

    if (req.file) {
      try {
        update.profilePhoto = await uploadProfilePhoto(req.file.buffer);
      } catch (imgErr) {
        return res.status(400).json({ success: false, message: imgErr.message });
      }
    }

    if (Object.keys(update).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    if (update.email || update.phone) {
      const orConditions = [];
      if (update.email) orConditions.push({ email: update.email });
      if (update.phone) orConditions.push({ phone: update.phone });
      const conflict = await AdminUser.findOne({ $or: orConditions, _id: { $ne: id } });
      if (conflict) {
        if (update.profilePhoto) await deleteProfilePhoto(update.profilePhoto);
        if (update.email && conflict.email === update.email)
          return res.status(409).json({ success: false, message: "Email already exists" });
        return res.status(409).json({ success: false, message: "Phone number already exists" });
      }
    }

    const existing = await AdminUser.findById(id).select("role profilePhoto engineerId name");
    if (!existing) {
      if (update.profilePhoto) await deleteProfilePhoto(update.profilePhoto);
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const effectiveRole = update.role || existing.role;
    if (effectiveRole === "Engineer" && !existing.dateOfJoining && !update.dateOfJoining)
      return res.status(400).json({ success: false, message: "Date of joining is required for Engineers" });

    if (!req.file && effectiveRole === "Engineer" && !existing.profilePhoto && !update.profilePhoto) {
      try { update.profilePhoto = await generateAvatar((update.name || existing.name).trim()); } catch (_) {}
    }

    if (update.role === "Engineer" && !existing.engineerId)
      update.engineerId = await generateEngineerId(update.name || existing.name);
    let user;
    try {
      user = await AdminUser.findByIdAndUpdate(id, update, { new: true, runValidators: true })
        .select("-password -changePasswordOtp -changePasswordOtpExpires");
    } catch (dbErr) {
      if (update.profilePhoto) await deleteProfilePhoto(update.profilePhoto);
      if (dbErr.code === 11000)
        return res.status(409).json({ success: false, message: "Email already exists" });
      return res.status(500).json({ success: false, message: dbErr.message });
    }

    if (update.role && update.role !== existing.role)
      await AdminUserSession.deleteMany({ userId: id });

    if (update.profilePhoto && existing.profilePhoto)
      await deleteProfilePhoto(existing.profilePhoto);

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
    if (user.profilePhoto) await deleteProfilePhoto(user.profilePhoto);

    res.status(200).json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const changeOwnPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: "currentPassword and newPassword are required" });
    const passwordError = validatePassword(newPassword);
    if (passwordError) return res.status(400).json({ success: false, message: passwordError });
    const user = await AdminUser.findById(req.adminUser.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    const match = await user.comparePassword(currentPassword);
    if (!match) return res.status(401).json({ success: false, message: "Current password is incorrect" });
    user.password = newPassword;
    await user.save();
    res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAllSystemUsers, getSystemUserById, createSystemUser, updateSystemUser, sendResetPasswordOtp, resetSystemUserPassword, deleteSystemUser, changeOwnPassword };
