const jwt = require("jsonwebtoken");
const AdminUser = require("./admin.user.model");
const AdminUserSession = require("./admin.user.session.model");
const { validateCreateUser } = require("./admin.user.validator");

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

    const user = await AdminUser.create({ email, password });
    const { password: _, ...data } = user.toObject();
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, password } = req.body;

    const update = {};

    if (status !== undefined) {
      if (!["Active", "Inactive"].includes(status))
        return res.status(400).json({ success: false, message: "Status must be Active or Inactive" });
      update.status = status;
    }

    if (password !== undefined) {
      const { isValid, errors } = validateCreateUser({ email: "placeholder@x.com", password });
      if (!isValid)
        return res.status(400).json({ success: false, errors });
      update.password = password;
    }

    if (Object.keys(update).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    const user = await AdminUser.findByIdAndUpdate(id, update, { new: true }).select("-password");

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
    if (!user || user.password !== password)
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    if (user.status === "Inactive")
      return res.status(403).json({ success: false, message: "Account is inactive" });

    const maxSessions = parseInt(process.env.ADMIN_MAX_SESSIONS) || 1;

    const sessionCount = await AdminUserSession.countDocuments({ userId: user._id });
    if (sessionCount >= maxSessions) {
      const oldest = await AdminUserSession.find({ userId: user._id }).sort({ createdAt: 1 }).limit(sessionCount - maxSessions + 1);
      await AdminUserSession.deleteMany({ _id: { $in: oldest.map((s) => s._id) } });
    }

    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
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

module.exports = { getAllUsers, createUser, updateUser, deleteUser, login, logout };
