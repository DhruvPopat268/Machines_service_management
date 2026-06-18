const mongoose = require("mongoose");
const Role = require("./admin.role.model");
const AdminUser = require("../auth/admin.user.model");
const AdminUserSession = require("../auth/admin.user.session.model");
const { validateCreateRole, validateUpdateRole } = require("./admin.role.validator");

const getAllRoles = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) query.name = { $regex: s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }
    if (status && ["Active", "Inactive"].includes(status)) query.status = status;

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const [data, total] = await Promise.all([
      Role.find(query)
        .populate("permissions", "name status")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      Role.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getActiveRoles = async (req, res) => {
  try {
    const roles = await Role.find({ status: "Active" })
      .populate("permissions", "name status")
      .sort({ name: 1 })
      .select("_id name permissions");
    res.status(200).json({ success: true, data: roles });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createRole = async (req, res) => {
  try {
    const { name, permissions = [], status } = req.body;

    const error = validateCreateRole({ name, permissions, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const role = await Role.create({ name: name.trim(), permissions, status });
    await role.populate("permissions", "name status");

    res.status(201).json({ success: true, data: role });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: "Role name already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const PROTECTED_ROLES = ["Admin", "Support"];

const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const existing = await Role.findById(id);
    if (!existing) return res.status(404).json({ success: false, message: "Role not found" });

    const { name, permissions, status } = req.body;

    // Admin: nothing can be changed
    if (existing.name === "Admin")
      return res.status(403).json({ success: false, message: "Admin role permissions cannot be modified" });

    // Support: only permissions allowed, not name or status
    const isProtected = PROTECTED_ROLES.includes(existing.name);
    if (isProtected && (name !== undefined || status !== undefined))
      return res.status(403).json({ success: false, message: "Name and status of this role cannot be changed" });

    const error = validateUpdateRole({ name, permissions, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const update = {};
    if (!isProtected && name    !== undefined) update.name   = name.trim();
    if (!isProtected && status  !== undefined) update.status = status;
    if (permissions !== undefined)             update.permissions = permissions;

    if (!Object.keys(update).length) return res.status(400).json({ success: false, message: "Nothing to update" });

    const role = await Role.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .populate("permissions", "name status");

    // Invalidate all sessions of users with this role so they re-login and get fresh permissions
    if (update.permissions !== undefined) {
      const affectedUsers = await AdminUser.find({ role: existing.name }).select("_id");
      const userIds = affectedUsers.map((u) => u._id);
      if (userIds.length > 0) await AdminUserSession.deleteMany({ userId: { $in: userIds } });
    }

    res.status(200).json({ success: true, data: role });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: "Role name already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const role = await Role.findById(id);
    if (!role) return res.status(404).json({ success: false, message: "Role not found" });

    if (PROTECTED_ROLES.includes(role.name))
      return res.status(403).json({ success: false, message: `"${role.name}" role cannot be deleted` });

    await role.deleteOne();
    res.status(200).json({ success: true, message: "Role deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAllRoles, getActiveRoles, createRole, updateRole, deleteRole };
